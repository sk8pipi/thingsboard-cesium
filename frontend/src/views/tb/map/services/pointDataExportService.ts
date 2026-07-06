import { getLatestTimeseries, getTimeseries } from '/@/api/tb/telemetry';
import { fetchAlarmPage } from '../../dashboard/runtime/widgets/alarm/api';
import type { AlarmItem } from '../../dashboard/runtime/widgets/alarm/types';
import { getAlarmSeverityLabel, getAlarmStatusLabel } from '../../dashboard/runtime/widgets/alarm/utils';
import type { DashboardWidget } from '../../dashboard/runtime/types';
import { utils, writeFile } from 'xlsx';

const DAY_MS = 24 * 60 * 60 * 1000;
const MAX_EXPORT_RANGE_MS = 7 * DAY_MS;
const MAX_TELEMETRY_ROWS = 50_000;
const MAX_ALARM_ROWS = 5_000;

export type PointExportKey = {
  id: string;
  entityType: string;
  entityId: string;
  entityName: string;
  name: string;
  label: string;
  units: string;
  sourceTitles: string[];
};

export type PointExportContent = {
  pointInfo: boolean;
  history: boolean;
  latest: boolean;
  alarms: boolean;
};

export type PointExportRequest = {
  sensor: Record<string, any>;
  keys: PointExportKey[];
  startTs: number;
  endTs: number;
  content: PointExportContent;
  filename?: string;
};

type TelemetryRow = {
  ts: number;
  key: PointExportKey;
  value: unknown;
};

type LatestRow = TelemetryRow;

function normalizeEntityType(value: unknown) {
  return String(value || 'DEVICE').toUpperCase();
}

function normalizeEntityId(value: unknown) {
  if (typeof value === 'string') return value;
  if (value && typeof value === 'object') {
    const source = value as Record<string, any>;
    return String(source.id?.id || source.id || source.entityId || '');
  }
  return '';
}

function datasourceList(widget: DashboardWidget): Record<string, any>[] {
  const config = widget.config || {};
  const candidates: Array<Record<string, any> | undefined> = [
    config.datasource,
    ...(Array.isArray(config.datasources) ? config.datasources : []),
  ];
  const seen = new Set<any>();
  return candidates.filter((item): item is Record<string, any> => {
    if (!item || seen.has(item)) return false;
    seen.add(item);
    return true;
  });
}

export function collectPointExportKeys(
  sensor: Record<string, any> | null | undefined,
  widgets: DashboardWidget[],
): PointExportKey[] {
  const result = new Map<string, PointExportKey>();

  widgets.forEach((widget) => {
    if (['alarm', 'control', 'static'].includes(String(widget.category || ''))) return;

    datasourceList(widget).forEach((datasource) => {
      const entityType = normalizeEntityType(datasource.entityType || sensor?.entityType);
      const entityId = normalizeEntityId(datasource.entityId || sensor?.entityId || sensor?.deviceId);
      if (!entityId) return;

      const entityName = String(
        datasource.entityName || sensor?.entityName || sensor?.deviceName || sensor?.name || entityId,
      );
      const dataKeys = Array.isArray(datasource.dataKeys) ? datasource.dataKeys : [];
      const keyNames = Array.isArray(datasource.keys) ? datasource.keys : [];
      const normalizedKeys = dataKeys.length
        ? dataKeys
        : keyNames.map((name: string) => ({ name, type: 'timeseries' }));

      normalizedKeys.forEach((dataKey: Record<string, any>) => {
        const keyType = String(dataKey?.type || 'timeseries').toLowerCase();
        const name = String(dataKey?.name || '').trim();
        if (!name || !['timeseries', 'ts'].includes(keyType)) return;

        const id = `${entityType}:${entityId}:${name}`;
        const existing = result.get(id);
        if (existing) {
          if (!existing.sourceTitles.includes(widget.title)) existing.sourceTitles.push(widget.title);
          return;
        }

        result.set(id, {
          id,
          entityType,
          entityId,
          entityName,
          name,
          label: String(dataKey.label || name),
          units: String(dataKey.units || ''),
          sourceTitles: [widget.title],
        });
      });
    });
  });

  return Array.from(result.values());
}

function groupKeys(keys: PointExportKey[]) {
  const groups = new Map<string, PointExportKey[]>();
  keys.forEach((key) => {
    const id = `${key.entityType}:${key.entityId}`;
    groups.set(id, [...(groups.get(id) || []), key]);
  });
  return Array.from(groups.values());
}

function rootPayload(payload: any) {
  return payload?.data ?? payload ?? {};
}

function normalizePoints(payload: any, key: PointExportKey): TelemetryRow[] {
  const value = rootPayload(payload)?.[key.name];
  const items = Array.isArray(value) ? value : Array.isArray(value?.data) ? value.data : value ? [value] : [];

  return items
    .map((item: any) => {
      if (Array.isArray(item)) return { ts: Number(item[0]), key, value: item[1] };
      return { ts: Number(item?.ts ?? item?.lastUpdateTs), key, value: item?.value ?? item?.latestValue };
    })
    .filter((item: TelemetryRow) => Number.isFinite(item.ts));
}

function deduplicateRows(rows: TelemetryRow[]) {
  const deduplicated = new Map<string, TelemetryRow>();
  rows.forEach((row) => deduplicated.set(`${row.key.id}:${row.ts}`, row));
  return Array.from(deduplicated.values()).sort((a, b) => a.ts - b.ts || a.key.name.localeCompare(b.key.name));
}

async function loadHistory(keys: PointExportKey[], startTs: number, endTs: number) {
  const rows: TelemetryRow[] = [];

  for (const group of groupKeys(keys)) {
    const first = group[0];
    for (let chunkStart = startTs; chunkStart < endTs; chunkStart += DAY_MS) {
      const chunkEnd = Math.min(endTs, chunkStart + DAY_MS);
      const response = await getTimeseries({
        entityType: first.entityType as any,
        entityId: first.entityId,
        keys: group.map((key) => key.name).join(','),
        startTs: chunkStart,
        endTs: chunkEnd,
        limit: MAX_TELEMETRY_ROWS,
        agg: 'NONE',
        orderBy: 'ASC',
        useStrictDataTypes: true,
      });

      group.forEach((key) => rows.push(...normalizePoints(response, key)));
      if (rows.length > MAX_TELEMETRY_ROWS) {
        throw new Error('遥测数据超过 50000 条，请缩小时间范围或减少 Key。');
      }
    }
  }

  return deduplicateRows(rows);
}

async function loadLatest(keys: PointExportKey[]) {
  const rows: LatestRow[] = [];

  for (const group of groupKeys(keys)) {
    const first = group[0];
    const response = await getLatestTimeseries(
      { entityType: first.entityType as any, id: first.entityId } as any,
      group.map((key) => key.name).join(','),
      true,
    );

    group.forEach((key) => {
      const points = normalizePoints(response, key).sort((a, b) => b.ts - a.ts);
      if (points[0]) rows.push(points[0]);
    });
  }

  return rows.sort((a, b) => a.key.name.localeCompare(b.key.name));
}

async function loadAlarms(sensor: Record<string, any>, startTs: number, endTs: number) {
  const entityId = normalizeEntityId(sensor.entityId || sensor.datasource?.entityId || sensor.deviceId);
  const entityType = normalizeEntityType(sensor.entityType || sensor.datasource?.entityType);
  if (!entityId) return [] as AlarmItem[];

  const rows: AlarmItem[] = [];
  let page = 0;
  let hasNext = true;

  while (hasNext && rows.length < MAX_ALARM_ROWS) {
    const result = await fetchAlarmPage({
      page,
      pageSize: 100,
      sortProperty: 'createdTime',
      sortOrder: 'DESC',
      startTime: startTs,
      endTime: endTs,
      entityId,
      entityType,
    });
    rows.push(...result.data);
    hasNext = result.hasNext;
    page += 1;
  }

  if (hasNext) throw new Error('告警记录超过 5000 条，请缩小时间范围。');
  return rows;
}

function formatDate(timestamp: number | undefined) {
  if (!timestamp || !Number.isFinite(timestamp)) return '';
  const date = new Date(timestamp);
  const pad = (value: number) => String(value).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(
    date.getMinutes(),
  )}:${pad(date.getSeconds())}`;
}

function safeCell(value: unknown) {
  if (value === null || value === undefined) return '';
  if (typeof value === 'string' && /^[=+@]/.test(value)) return `'${value}`;
  return value;
}

function appendSheet(workbook: ReturnType<typeof utils.book_new>, name: string, rows: Record<string, unknown>[]) {
  const worksheet = utils.json_to_sheet(rows);
  const headers = rows.length ? Object.keys(rows[0]) : [];
  worksheet['!cols'] = headers.map((header) => ({
    wch: Math.min(42, Math.max(header.length * 2, ...rows.map((row) => String(row[header] ?? '').length)) + 2),
  }));
  if (headers.length && rows.length) {
    worksheet['!autofilter'] = { ref: worksheet['!ref'] || `A1:${String.fromCharCode(64 + headers.length)}1` };
  }
  utils.book_append_sheet(workbook, worksheet, name.slice(0, 31));
}

function pointInfoRows(sensor: Record<string, any>) {
  return [
    {
      点位名称: safeCell(sensor.name || ''),
      设备名称: safeCell(sensor.entityName || sensor.deviceName || ''),
      设备类型: safeCell(sensor.description || sensor.entityType || ''),
      在线状态: safeCell(
        sensor.statusText || (sensor.online === true ? '在线' : sensor.online === false ? '离线' : ''),
      ),
      经度: sensor.longitude ?? '',
      纬度: sensor.latitude ?? '',
      高度: sensor.height ?? '',
      实体ID: safeCell(sensor.entityId || sensor.datasource?.entityId || sensor.deviceId || ''),
      导出时间: formatDate(Date.now()),
    },
  ];
}

function filenameTimestamp() {
  return formatDate(Date.now()).replace(/[-: ]/g, '').slice(0, 14);
}

function sanitizeFilename(value: string) {
  const normalized = value.replace(/[\\/:*?"<>|\[\]]/g, '_').trim() || '点位数据';
  return normalized.toLowerCase().endsWith('.xlsx') ? normalized : `${normalized}.xlsx`;
}

export async function exportPointData(request: PointExportRequest) {
  if (request.endTs <= request.startTs) throw new Error('结束时间必须晚于开始时间。');
  if (request.endTs - request.startTs > MAX_EXPORT_RANGE_MS) throw new Error('单次导出时间范围不能超过 7 天。');
  if ((request.content.history || request.content.latest) && !request.keys.length) {
    throw new Error('请至少选择一个需要导出的 Key。');
  }

  const [history, latest, alarms] = await Promise.all([
    request.content.history ? loadHistory(request.keys, request.startTs, request.endTs) : Promise.resolve([]),
    request.content.latest ? loadLatest(request.keys) : Promise.resolve([]),
    request.content.alarms ? loadAlarms(request.sensor, request.startTs, request.endTs) : Promise.resolve([]),
  ]);

  const workbook = utils.book_new();

  if (request.content.pointInfo) appendSheet(workbook, '点位信息', pointInfoRows(request.sensor));
  if (request.content.history) {
    appendSheet(
      workbook,
      '遥测数据',
      history.length
        ? history.map((row) => ({
            采集时间: formatDate(row.ts),
            Key: safeCell(row.key.name),
            指标名称: safeCell(row.key.label),
            值: safeCell(row.value),
            单位: safeCell(row.key.units),
            设备名称: safeCell(row.key.entityName),
          }))
        : [{ 采集时间: '', Key: '', 指标名称: '', 值: '暂无数据', 单位: '', 设备名称: '' }],
    );
  }
  if (request.content.latest) {
    appendSheet(
      workbook,
      '最新值',
      latest.length
        ? latest.map((row) => ({
            Key: safeCell(row.key.name),
            指标名称: safeCell(row.key.label),
            最新值: safeCell(row.value),
            数据时间: formatDate(row.ts),
            单位: safeCell(row.key.units),
            设备名称: safeCell(row.key.entityName),
          }))
        : [{ Key: '', 指标名称: '', 最新值: '暂无数据', 数据时间: '', 单位: '', 设备名称: '' }],
    );
  }
  if (request.content.alarms) {
    appendSheet(
      workbook,
      '告警记录',
      alarms.length
        ? alarms.map((alarm) => ({
            告警名称: safeCell(alarm.name),
            告警类型: safeCell(alarm.type),
            告警等级: safeCell(getAlarmSeverityLabel(alarm.severity)),
            状态: safeCell(getAlarmStatusLabel(alarm.status)),
            来源设备: safeCell(alarm.originator?.name || alarm.originator?.label || ''),
            产生时间: formatDate(alarm.createdTime || alarm.startTs),
            确认时间: formatDate(alarm.ackTs),
            清除时间: formatDate(alarm.clearTs || alarm.endTs),
          }))
        : [
            {
              告警名称: '',
              告警类型: '',
              告警等级: '',
              状态: '暂无数据',
              来源设备: '',
              产生时间: '',
              确认时间: '',
              清除时间: '',
            },
          ],
    );
  }

  if (!workbook.SheetNames.length) throw new Error('请至少选择一项导出内容。');

  const defaultName = `${request.sensor.name || request.sensor.entityName || '点位数据'}_${filenameTimestamp()}`;
  writeFile(workbook, sanitizeFilename(request.filename || defaultName), { bookType: 'xlsx' });
}
