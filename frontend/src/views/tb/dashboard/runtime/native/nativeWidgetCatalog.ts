import generated from './nativeWidgetCatalog.generated.json';
import type { NativeFamily, NativeOptions } from './nativeWidgetTypes';
import type { DashboardWidget } from '../types';

export const nativeWidgetCatalog = generated;
export const nativeFamilyLabels: Record<NativeFamily, string> = {
  value: '数值卡片',
  valueChart: '数值曲线',
  progress: '进度条',
  gauge: '仪表',
  timeseries: '时序图',
  pie: '饼图',
  bar: '分类柱形图',
  table: '历史表格',
};
function fingerprint(value: string) {
  let hash = 2166136261;
  for (let i = 0; i < value.length; i++) hash = Math.imul(hash ^ value.charCodeAt(i), 16777619);
  return (hash >>> 0).toString(16).padStart(8, '0');
}
export function getNativeCatalogEntry(source: any) {
  const fqn = String(source?.config?.native?.fqn || source?.fqn || source?.typeFullFqn || '').replace(/^system\./, '');
  return nativeWidgetCatalog.find((entry) => entry.fqn === fqn);
}
export function getNativeWidgetSupport(source: any): {
  supported: boolean;
  label: string;
  reason: string;
  localWidgetKey?: string;
} {
  const entry = getNativeCatalogEntry(source);
  if (!entry?.family)
    return { supported: false, label: '待适配', reason: '此部件尚无 Vue 运行实现，可查看与导出原始定义。' };
  if (source?.config?.native && (source.config.native.version !== 1 || source.config.native.family !== entry.family)) {
    return {
      supported: false,
      label: '配置版本不兼容',
      reason: '部件版本或类别与当前 Vue 适配器不一致，请保留原始配置。',
    };
  }
  const descriptor = source?.descriptor;
  if (
    descriptor &&
    fingerprint((descriptor.templateHtml || '') + '\n' + (descriptor.controllerScript || '')) !== entry.signature
  ) {
    return { supported: false, label: '自定义版本待核验', reason: '模板或控制脚本与当前适配目录不同，不能自动套用。' };
  }
  return {
    supported: true,
    label: 'Vue 基础适配',
    localWidgetKey: `native_${entry.family}`,
    reason:
      '提供此类别的 Vue 数据显示与液态玻璃外观；需重新确认字段和配置。原生造型、高级布局、脚本、动作及函数数据源不自动复刻。',
  };
}
export function createNativeWidget(source: any): DashboardWidget {
  const support = getNativeWidgetSupport(source);
  if (!support.supported) throw new Error(support.reason);
  if (source?.config?.native) {
    const native = source.config.native;
    if (
      !native.window ||
      !Array.isArray(native.thresholds) ||
      !Array.isArray(source.config.datasources) ||
      source.config.datasources.some(
        (ds: any) =>
          !ds || !Array.isArray(ds.dataKeys) || ds.dataKeys.some((key: any) => !key || typeof key.name !== 'string'),
      ) ||
      native.thresholds.some((threshold: any) => !threshold || typeof threshold !== 'object') ||
      !source.id ||
      !source.widgetKey
    ) {
      throw new Error('已保存的 Vue 部件配置结构不完整，请保留原始文件后重新配置');
    }
    const copy = JSON.parse(JSON.stringify(source));
    copy.appearance ||= { surface: 'clear-glass', backgroundOpacity: 0.04, blurPx: 0 };
    return copy;
  }
  const entry = getNativeCatalogEntry(source)!;
  const preset: any = entry.preset;
  const native: NativeOptions = {
    version: 1,
    fqn: entry.fqn,
    family: entry.family as NativeFamily,
    rawSource: source?.descriptor || source?.config ? JSON.parse(JSON.stringify(source)) : undefined,
    window: { realtime: true, durationMs: 3600000, intervalMs: 60000, aggregation: 'NONE' },
    pollMs: 10000,
    min: preset.min ?? 0,
    max: preset.max ?? 100,
    showLegend: true,
    showDate: preset.showDate ?? true,
    showLabel: preset.showLabel ?? true,
    fontSize: preset.fontSize || 36,
    chartType: preset.chartType || 'line',
    thresholds: JSON.parse(JSON.stringify(preset.thresholds || [])),
  };
  return {
    id: `native-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`,
    category: ['valueChart', 'timeseries', 'table'].includes(native.family) ? 'timeseries' : 'latest',
    widgetKey: support.localWidgetKey!,
    type: support.localWidgetKey!,
    definitionVersion: 1,
    typeFullFqn: `system.${entry.fqn}`,
    title: source?.name || entry.name,
    config: {
      title: source?.name || entry.name,
      native,
      datasources: [],
      units: preset.units || '',
      decimals: preset.decimals ?? 2,
    },
    appearance: {
      surface: 'clear-glass',
      backgroundOpacity: 0.04,
      blurPx: 0,
      borderOpacity: 0.18,
      accentColor: '#6ce9ff',
      radiusPx: 12,
      shadowStrength: 0.2,
    },
  };
}
export function validateNativeWidget(widget: DashboardWidget): string[] {
  const errors: string[] = [];
  const options = widget.config?.native as NativeOptions;
  if (!options || options.version !== 1 || !getNativeWidgetSupport(widget).supported) return ['不支持的部件或配置版本'];
  if (!options.window || !Array.isArray(options.thresholds) || !Array.isArray(widget.config.datasources))
    return ['部件配置结构无效'];
  if (!widget.title?.trim()) errors.push('请填写部件标题');
  const sources = widget.config.datasources || [];
  if (!sources.length) errors.push('请选择至少一个设备或资产');
  if (sources.length > 8) errors.push('每个部件最多选择 8 个数据源');
  if (sources.some((source) => !source || !Array.isArray(source.dataKeys) || source.dataKeys.some((key) => !key)))
    return ['数据源或字段结构无效'];
  const keyCount = sources.reduce((count, ds) => count + (ds.dataKeys?.length || 0), 0);
  if (keyCount > 32) errors.push('每个部件最多展示 32 个字段');
  if (options.family === 'gauge' && keyCount > 4) errors.push('仪表部件最多展示 4 个字段，请拆成多个部件');
  for (const source of sources) {
    if (!['DEVICE', 'ASSET'].includes(source.entityType || '') || !source.entityId) errors.push('数据源实体无效');
    if (!source.dataKeys?.length) errors.push('每个数据源至少选择一个字段');
    if (!Array.isArray(source.dataKeys)) {
      errors.push('数据字段结构无效');
      continue;
    }
    for (const key of source.dataKeys || []) {
      if (!key.name?.trim() || !['timeseries', 'attribute'].includes(key.type)) errors.push('数据字段无效');
      if (['valueChart', 'timeseries', 'table'].includes(options.family) && key.type !== 'timeseries')
        errors.push('历史部件仅支持遥测字段');
      if (key.decimals != null && (!Number.isInteger(key.decimals) || key.decimals < 0 || key.decimals > 8))
        errors.push('小数位必须为 0–8');
    }
  }
  if (!Number.isFinite(options.min) || !Number.isFinite(options.max) || options.min >= options.max)
    errors.push('量程上限必须大于下限');
  if (
    options.window.realtime
      ? !(options.window.durationMs >= 60000 && options.window.durationMs <= 31 * 86400000)
      : !(
          Number(options.window.startTs) < Number(options.window.endTs) &&
          Number(options.window.endTs) - Number(options.window.startTs) <= 31 * 86400000
        )
  )
    errors.push('时间范围须有效且不超过 31 天');
  if (!(options.pollMs >= 5000 && options.pollMs <= 300000)) errors.push('刷新间隔应为 5–300 秒');
  if (!(options.window.intervalMs >= 1000)) errors.push('聚合间隔至少 1 秒');
  if (!['NONE', 'AVG', 'MIN', 'MAX', 'SUM', 'COUNT'].includes(options.window.aggregation)) errors.push('聚合方式无效');
  if (
    options.thresholds.some(
      (t) =>
        (t.from != null && !Number.isFinite(t.from)) ||
        (t.to != null && !Number.isFinite(t.to)) ||
        (t.from != null && t.to != null && t.from > t.to),
    )
  )
    errors.push('阈值区间无效');
  return [...new Set(errors)];
}
