import type { EntityDataQuery } from '/@/api/model/entityQuery';
import type { NativeEntityTableColumn, NativeEntityTableSettings } from './nativeWidgetTypes';

export interface NativeEntityTableRow {
  id: string;
  name: string;
  label: string;
  type: string;
  values: Record<string, string>;
}

export function nativeEntityTableQuery(
  settings: NativeEntityTableSettings,
  page: number,
  search: string,
): EntityDataQuery {
  return {
    entityFilter: settings.singleEntityId
      ? { type: 'singleEntity', singleEntity: { entityType: 'DEVICE', id: settings.singleEntityId } }
      : { type: 'entityType', entityType: settings.entityType },
    pageLink: {
      page,
      pageSize: settings.displayPagination ? settings.pageSize : 100,
      textSearch: settings.enableSearch ? search.trim() : '',
      sortOrder: { key: { type: 'ENTITY_FIELD', key: 'name' }, direction: settings.sortOrder },
    },
    entityFields: [
      { type: 'ENTITY_FIELD', key: 'name' },
      { type: 'ENTITY_FIELD', key: 'label' },
      { type: 'ENTITY_FIELD', key: 'type' },
    ],
    latestValues: settings.columns.map(({ type, key }) => ({ type, key })),
  } as EntityDataQuery;
}

export function nativeEntityTableText(value: unknown): string {
  if (value == null || value === '') return '—';
  return typeof value === 'object' ? JSON.stringify(value) : String(value);
}

export function nativeEntityTableRows(rawRows: any[], columns: NativeEntityTableColumn[]): NativeEntityTableRow[] {
  return rawRows.map((raw) => {
    const latest = raw?.latest || {};
    const values: Record<string, string> = {};
    for (const column of columns)
      values[`${column.type}:${column.key}`] = nativeEntityTableText(latest?.[column.type]?.[column.key]?.value);
    return {
      id: raw?.entityId?.id || '',
      name: nativeEntityTableText(latest?.ENTITY_FIELD?.name?.value ?? raw?.name),
      label: nativeEntityTableText(latest?.ENTITY_FIELD?.label?.value ?? raw?.label),
      type: nativeEntityTableText(latest?.ENTITY_FIELD?.type?.value ?? raw?.entityId?.entityType),
      values,
    };
  });
}
