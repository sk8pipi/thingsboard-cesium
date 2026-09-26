import { validateStateSettings } from './nativeStateCore';
import { validateLiquidSettings } from './nativeLiquidCore';
import { validateIndicatorSettings } from './nativeIndicatorCore';
import { nativeInputSpec } from './nativeInputCore';
import { locationKeysValid, nativeLocationSpec } from './nativeLocationInputCore';
import { nativePhotoSpec, validateNativePhotoSettings } from './nativePhotoInputCore';
import { nativeLedSpec, validateNativeLedSettings } from './nativeLedCore';
import { validateWindSettings } from './nativeWindCore';
import { validateRpcButtonSettings } from './nativeRpcButtonCore';
import { nativeControlKind, validateNativeControlSettings } from './nativeControlCore';
import {
  advancedControlNeedsDevice,
  nativeAdvancedControlMode,
  validateNativeAdvancedControlSettings,
} from './nativeAdvancedControlCore';
import { validateMultiInputKey, validateMultiInputSettings } from './nativeMultiInputCore';
import { validateNativeCount } from './nativeCountCore';
import generated from './nativeWidgetCatalog.generated.json';
import type { NativeFamily, NativeOptions, NativeSource } from './nativeWidgetTypes';
import type { DashboardWidget } from '../types';
import { nativeSeriesSettings, withNativeSettings } from './nativeWidgetSettings';

export const nativeWidgetCatalog = generated;
export const nativeFamilyLabels: Record<NativeFamily, string> = {
  value: '数值卡片',
  valueChart: '数值曲线',
  progress: '进度条',
  gauge: '仪表',
  timeseries: '时序图',
  pie: '饼图',
  bar: '带标签时序柱形图',
  latestBar: '最新值柱形图',
  radar: '雷达图',
  polar: '极区图',
  range: '范围图',
  aggregate: '聚合数值卡',
  liquid: '液位容器',
  state: '状态图',
  table: '历史表格',
  battery: '电池电量',
  signal: '信号强度',
  wind: '风速风向',
  rpcButton: 'RPC 按钮',
  control: '设备控制',
  advancedControl: '控制、RPC 与 GPIO',
  multiInput: '多属性更新',
  count: '实体与告警计数',
  attributeCard: '属性卡片',
  alarmTable: '告警表格',
  deviceClaim: '设备认领',
  entityHierarchy: '实体层级',
  entityTable: '实体表格',
  input: '属性与遥测输入',
  locationInput: '位置输入',
  photoInput: '拍照输入',
  ledIndicator: 'LED 指示灯',
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
    copy.config.native = withNativeSettings(copy.config.native);
    copy.appearance ||= { surface: 'clear-glass', backgroundOpacity: 0.04, blurPx: 0 };
    return copy;
  }
  const entry = getNativeCatalogEntry(source)!;
  const preset: any = entry.preset;
  const native = withNativeSettings({
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
  } as NativeOptions);
  native.presentation.layout = preset.layout === 'horizontal' ? 'horizontal' : 'vertical';
  native.presentation.labelPosition = ['top', 'bottom', 'left'].includes(preset.labelPosition)
    ? preset.labelPosition
    : 'top';
  native.presentation.dateFormat = preset.dateFormat?.lastUpdateAgo ? 'relative' : 'locale';
  native.pie.innerRadius = preset.innerRadius ?? 0;
  native.pie.showPercent = preset.showPercent ?? native.pie.showPercent;
  native.chart.stack = preset.stack ?? native.chart.stack;
  if (entry.family === 'aggregate') {
    const now = new Date();
    native.window = {
      realtime: false,
      calendar: 'month',
      durationMs: 3600000,
      startTs: Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1),
      endTs: now.getTime(),
      intervalMs: 43200000,
      aggregation: 'AVG',
    };
    const base = {
      label: '',
      aggregationType: 'AVG' as const,
      comparisonEnabled: true,
      timeForComparison: 'month' as const,
      comparisonCustomIntervalValue: 86400000,
      comparisonResultType: 'DELTA_ABSOLUTE' as const,
      units: preset.units || '',
      decimals: 1,
      showArrow: false,
      fontSize: 16,
      color: '#dae9f6',
    };
    native.aggregate.slots = [
      {
        ...base,
        id: 'primary',
        position: 'center',
        aggregationType: 'NONE',
        comparisonEnabled: false,
        decimals: 0,
        fontSize: 36,
      },
      {
        ...base,
        id: 'percent',
        position: 'rightTop',
        comparisonResultType: 'DELTA_PERCENT',
        units: '%',
        decimals: 0,
        showArrow: true,
      },
      { ...base, id: 'delta', position: 'rightBottom' },
    ];
  }
  if (entry.family === 'state') {
    native.state.states = JSON.parse(JSON.stringify(preset.states || native.state.states));
    native.chart.dataZoom = true;
    native.chart.legendPosition = 'right';
  }
  if (entry.family === 'liquid') native.liquid = { ...native.liquid, ...preset.liquid };
  if (entry.family === 'battery') native.battery = { ...native.battery, ...preset.battery };
  if (entry.family === 'signal') native.signal = { ...native.signal, ...preset.signal };
  if (entry.family === 'wind') native.wind = { ...native.wind, ...preset.wind };
  if (entry.family === 'rpcButton') native.rpcButton = { ...native.rpcButton, ...preset.rpcButton };
  if (entry.family === 'control') native.control = { ...native.control, ...preset.control };
  if (entry.family === 'advancedControl')
    native.advancedControl = { ...native.advancedControl, ...preset.advancedControl };
  if (entry.family === 'input') native.input = { ...native.input, ...preset.input };
  if (entry.family === 'locationInput') native.locationInput = { ...native.locationInput, ...preset.locationInput };
  if (entry.family === 'photoInput') native.photoInput = { ...native.photoInput, ...preset.photoInput };
  if (entry.family === 'ledIndicator') native.ledIndicator = { ...native.ledIndicator, ...preset.ledIndicator };
  if (entry.family === 'count') native.count = { ...native.count, ...preset.count };
  if (entry.family === 'alarmTable') native.alarmTable = { ...native.alarmTable, ...preset.alarmTable };
  if (entry.family === 'deviceClaim') native.deviceClaim = { ...native.deviceClaim, ...preset.deviceClaim };
  if (entry.family === 'entityHierarchy')
    native.entityHierarchy = { ...native.entityHierarchy, ...preset.entityHierarchy };
  if (entry.family === 'entityTable') native.entityTable = { ...native.entityTable, ...preset.entityTable };
  if (entry.family === 'range') {
    native.range = { ...native.range, ...preset.range };
    native.chart.dataZoom = true;
  }
  if (entry.family === 'radar') native.showLabel = false;
  if (entry.family === 'polar') native.radial.showTickLabels = true;
  if (['doughnut', 'horizontal_doughnut'].includes(entry.fqn)) {
    native.pie.clockwise = false;
    native.showLabel = false;
    native.chart.legendPosition = entry.fqn === 'horizontal_doughnut' ? 'right' : 'bottom';
  }
  if (preset.gaugeType === 'thermometer') {
    native.gauge.type = 'thermometer';
    native.gauge.direction = 'vertical';
    native.gauge.width = 28;
    native.gauge.showPointer = false;
  } else if (['horizontalBar', 'verticalBar'].includes(preset.gaugeType)) {
    native.gauge.type = 'linear';
    native.gauge.direction = preset.gaugeType === 'verticalBar' ? 'vertical' : 'horizontal';
    native.gauge.width = 20;
    native.gauge.showPointer = false;
  } else if (['arc', 'donut'].includes(preset.gaugeType)) {
    native.gauge.type = 'arc';
    native.gauge.showPointer = false;
    native.gauge.startAngle = preset.gaugeType === 'donut' ? 90 : 180;
    native.gauge.endAngle = preset.gaugeType === 'donut' ? -270 : 0;
  }
  return {
    id: `native-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`,
    category: ['valueChart', 'timeseries', 'bar', 'table', 'range', 'aggregate', 'state'].includes(native.family)
      ? 'timeseries'
      : 'latest',
    widgetKey: support.localWidgetKey!,
    type: support.localWidgetKey!,
    definitionVersion: 1,
    typeFullFqn: `system.${entry.fqn}`,
    title: source?.name || entry.name,
    config: {
      title: source?.name || entry.name,
      ...(['label_value_card', 'cards.simple_card', 'entity_count', 'alarm_count'].includes(entry.fqn)
        ? { showTitle: false }
        : {}),
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
  if (
    !sources.length &&
    !['count', 'alarmTable', 'deviceClaim', 'entityTable', 'advancedControl'].includes(options.family)
  )
    errors.push('请选择至少一个设备或资产');
  if (options.family === 'count' && (sources.length || !['entity_count', 'alarm_count'].includes(options.fqn)))
    errors.push('计数部件使用筛选条件，不绑定遥测数据源');
  if (options.family === 'alarmTable' && (sources.length || options.fqn !== 'alarm_widgets.alarms_table'))
    errors.push('告警表格使用筛选条件，不绑定遥测数据源');
  if (options.family === 'deviceClaim' && (sources.length || options.fqn !== 'input_widgets.device_claiming_widget'))
    errors.push('设备认领不绑定遥测数据源');
  const entityTableFqns = [
    'cards.entities_table',
    'entity_admin_widgets.asset_admin_table',
    'entity_admin_widgets.device_admin_table',
  ];
  if (options.family === 'entityTable' && (sources.length || !entityTableFqns.includes(options.fqn)))
    errors.push('实体表格使用实体筛选，不绑定遥测数据源');
  if (sources.length > 8) errors.push('每个部件最多选择 8 个数据源');
  if (sources.some((source) => !source || !Array.isArray(source.dataKeys) || source.dataKeys.some((key) => !key)))
    return ['数据源或字段结构无效'];
  const keyCount = sources.reduce((count, ds) => count + (ds.dataKeys?.length || 0), 0);
  if (options.family === 'aggregate' && (sources.length !== 1 || keyCount !== 1))
    errors.push('聚合卡需要一个实体和一个遥测字段');
  if (options.family === 'liquid' && (sources.length !== 1 || keyCount !== 1))
    errors.push('液位容器需要一个实体和一个字段');
  if (['battery', 'signal'].includes(options.family) && (sources.length !== 1 || keyCount !== 1))
    errors.push('状态指示器需要一个实体和一个字段');
  if (options.family === 'wind' && (sources.length !== 1 || keyCount < 1 || keyCount > 2))
    errors.push('风速风向部件需要一个实体、一个风向字段和可选风速字段');
  if (options.family === 'rpcButton' && (sources.length !== 1 || sources[0]?.entityType !== 'DEVICE' || keyCount !== 0))
    errors.push('RPC 按钮需要一个设备，不需要数据字段');
  if (options.family === 'control') {
    if (
      !nativeControlKind(options.fqn) ||
      sources.length !== 1 ||
      sources[0]?.entityType !== 'DEVICE' ||
      keyCount !== 0
    )
      errors.push('控制部件需要一个设备，不需要数据字段');
    if (!options.control) errors.push('控制配置缺失');
    else errors.push(...validateNativeControlSettings(options.control));
  }
  if (options.family === 'advancedControl') {
    const expectedMode = nativeAdvancedControlMode(options.fqn);
    const settings = options.advancedControl;
    if (!expectedMode || !settings || settings.mode !== expectedMode) errors.push('高级控制部件类型与原生定义不一致');
    if (keyCount !== 0) errors.push('控制、RPC 与 GPIO 部件不使用数据字段');
    if (settings && advancedControlNeedsDevice(settings.mode)) {
      if (sources.length !== 1 || sources[0]?.entityType !== 'DEVICE') errors.push('此控制部件需要一个目标设备');
    } else if (sources.length > 1 || (sources[0] && sources[0].entityType !== 'DEVICE')) {
      errors.push('此控制部件最多绑定一个可选设备');
    }
    if (settings) errors.push(...validateNativeAdvancedControlSettings(settings));
  }
  if (
    options.family === 'entityHierarchy' &&
    (options.fqn !== 'cards.entities_hierarchy' || sources.length !== 1 || keyCount !== 0)
  )
    errors.push('实体层级需要一个设备或资产作为根节点，不需要数据字段');
  if (options.family === 'multiInput' && keyCount < 1) errors.push('多属性更新至少需要一个字段');
  const inputSpec = options.family === 'input' ? nativeInputSpec(options.fqn, options.input) : null;
  if (options.family === 'input') {
    if (!inputSpec || sources.length !== 1 || keyCount !== 1) errors.push('输入部件需要一个实体和一个字段');
    if (inputSpec?.scope === 'SHARED_SCOPE' && sources[0]?.entityType !== 'DEVICE')
      errors.push('共享属性输入仅支持设备');
    const key = (sources[0] as NativeSource | undefined)?.dataKeys?.[0];
    if (
      inputSpec &&
      key &&
      (key.type !== inputSpec.mode || (inputSpec.mode === 'attribute' && key.scope !== inputSpec.scope))
    )
      errors.push('字段类型或属性范围与原生输入部件不一致');
  }
  if (options.family === 'locationInput') {
    const spec = nativeLocationSpec(options.fqn);
    const settings = options.locationInput;
    if (!spec || sources.length !== 1 || keyCount !== 2) errors.push('位置输入需要一个实体和经纬度两个字段');
    if (spec?.scope === 'SHARED_SCOPE' && sources[0]?.entityType !== 'DEVICE') errors.push('共享位置属性仅支持设备');
    if (!settings || !locationKeysValid(settings) || !['row', 'column'].includes(settings.inputFieldsAlignment))
      errors.push('经纬度字段或输入排列无效');
    const keys = (sources[0] as NativeSource | undefined)?.dataKeys || [];
    if (
      spec &&
      settings &&
      locationKeysValid(settings) &&
      [settings.latKeyName, settings.lngKeyName].some(
        (name) =>
          !keys.some(
            (key) =>
              key.name === name && key.type === spec.mode && (spec.mode === 'timeseries' || key.scope === spec.scope),
          ),
      )
    )
      errors.push('经纬度字段类型或属性范围与原生部件不一致');
  }
  if (options.family === 'photoInput') {
    if (!nativePhotoSpec(options.fqn) || sources.length !== 1 || keyCount !== 1)
      errors.push('拍照输入需要一个实体和一个照片字段');
    const key = (sources[0] as NativeSource | undefined)?.dataKeys?.[0];
    if (key && !(key.type === 'timeseries' || (key.type === 'attribute' && key.scope === 'SERVER_SCOPE')))
      errors.push('拍照字段只支持遥测或服务端属性');
    if (!options.photoInput) errors.push('拍照配置缺失');
    else errors.push(...validateNativePhotoSettings(options.photoInput));
  }
  if (options.family === 'ledIndicator') {
    if (!nativeLedSpec(options.fqn) || sources.length !== 1 || sources[0]?.entityType !== 'DEVICE' || keyCount !== 0)
      errors.push('LED 指示灯需要一个目标设备，不需要数据字段');
    if (!options.ledIndicator) errors.push('LED 配置缺失');
    else errors.push(...validateNativeLedSettings(options.ledIndicator));
  }
  if (options.family === 'range' && keyCount > 1) errors.push('原生范围图只支持一个遥测字段');
  if (keyCount > 32) errors.push('每个部件最多展示 32 个字段');
  if (options.family === 'gauge' && keyCount > 4) errors.push('仪表部件最多展示 4 个字段，请拆成多个部件');
  for (const source of sources) {
    if (!['DEVICE', 'ASSET'].includes(source.entityType || '') || !source.entityId) errors.push('数据源实体无效');
    if (
      !source.dataKeys?.length &&
      !['rpcButton', 'control', 'advancedControl', 'count', 'entityHierarchy', 'ledIndicator'].includes(options.family)
    )
      errors.push('每个数据源至少选择一个字段');
    if (!Array.isArray(source.dataKeys)) {
      errors.push('数据字段结构无效');
      continue;
    }
    for (const key of source.dataKeys || []) {
      if (!key.name?.trim() || !['timeseries', 'attribute'].includes(key.type)) errors.push('数据字段无效');
      if (
        ['valueChart', 'timeseries', 'bar', 'table', 'range', 'aggregate', 'state'].includes(options.family) &&
        key.type !== 'timeseries'
      )
        errors.push('历史部件仅支持遥测字段');
      if (key.decimals != null && (!Number.isInteger(key.decimals) || key.decimals < 0 || key.decimals > 8))
        errors.push('小数位必须为 0–8');
      if (options.family === 'multiInput') errors.push(...validateMultiInputKey(key, source.entityType || ''));
    }
  }
  if (
    ['gauge', 'progress'].includes(options.family) &&
    (!Number.isFinite(options.min) || !Number.isFinite(options.max) || options.min >= options.max)
  )
    errors.push('量程上限必须大于下限');
  if (
    options.window.realtime
      ? !(options.window.durationMs >= 60000 && options.window.durationMs <= 31 * 86400000)
      : options.window.calendar
        ? !['day', 'week', 'month'].includes(options.window.calendar)
        : !(
            Number.isFinite(options.window.startTs) &&
            Number.isFinite(options.window.endTs) &&
            Number(options.window.startTs) >= 0 &&
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
  const settings = withNativeSettings(options);
  if (settings.family === 'state') {
    errors.push(...validateStateSettings(settings.state));
    if (options.window.aggregation !== 'NONE') errors.push('状态图须使用无聚合的原始状态');
  }
  if (settings.family === 'liquid') errors.push(...validateLiquidSettings(settings.liquid));
  if (settings.family === 'battery') errors.push(...validateIndicatorSettings('battery', settings.battery));
  if (settings.family === 'signal') errors.push(...validateIndicatorSettings('signal', settings.signal));
  if (settings.family === 'wind') errors.push(...validateWindSettings(settings.wind));
  if (settings.family === 'rpcButton') errors.push(...validateRpcButtonSettings(settings.rpcButton));
  if (settings.family === 'control') errors.push(...validateNativeControlSettings(settings.control));
  if (settings.family === 'advancedControl')
    errors.push(...validateNativeAdvancedControlSettings(settings.advancedControl));
  if (settings.family === 'multiInput') errors.push(...validateMultiInputSettings(settings.multiInput));
  if (settings.family === 'count') errors.push(...validateNativeCount(settings.count, settings.fqn));
  if (
    settings.family === 'attributeCard' &&
    (!Number.isFinite(settings.attributeCard.labelWidth) ||
      settings.attributeCard.labelWidth < 10 ||
      settings.attributeCard.labelWidth > 90)
  )
    errors.push('属性卡片标签宽度须为 10–90%');
  if (
    settings.family === 'alarmTable' &&
    (!Number.isInteger(settings.alarmTable.defaultPageSize) ||
      settings.alarmTable.defaultPageSize < 1 ||
      settings.alarmTable.defaultPageSize > 100)
  )
    errors.push('告警表格每页条数必须为 1–100');
  if (
    settings.family === 'entityHierarchy' &&
    (typeof settings.entityHierarchy.relationType !== 'string' ||
      !settings.entityHierarchy.relationType.trim() ||
      !Number.isInteger(settings.entityHierarchy.maxDepth) ||
      settings.entityHierarchy.maxDepth < 1 ||
      settings.entityHierarchy.maxDepth > 5)
  )
    errors.push('实体层级关系类型不能为空，深度须为 1–5');
  if (settings.family === 'entityTable') {
    const table = settings.entityTable;
    const expectedEntityType = settings.fqn === 'entity_admin_widgets.asset_admin_table' ? 'ASSET' : 'DEVICE';
    if (!['DEVICE', 'ASSET'].includes(table.entityType)) errors.push('实体表格类型须为设备或资产');
    if (settings.fqn.startsWith('entity_admin_widgets.') && table.entityType !== expectedEntityType)
      errors.push('实体管理部件类型与原生定义不一致');
    if (settings.fqn.startsWith('entity_admin_widgets.') && !table.adminMode)
      errors.push('实体管理部件必须启用管理模式');
    if (settings.fqn === 'cards.entities_table' && table.adminMode) errors.push('普通实体表格不能启用管理模式');
    if (
      ['adminMode', 'allowCreate', 'allowEdit', 'allowDelete', 'editLocation'].some(
        (key) => typeof table[key as keyof typeof table] !== 'boolean',
      )
    )
      errors.push('实体管理权限配置无效');
    if (!Number.isInteger(table.pageSize) || table.pageSize < 1 || table.pageSize > 100)
      errors.push('实体表格每页条数须为 1–100');
    if (
      !Array.isArray(table.columns) ||
      table.columns.length > 16 ||
      table.columns.some(
        (column) =>
          !column ||
          typeof column.key !== 'string' ||
          !column.key.trim() ||
          !['TIME_SERIES', 'SERVER_ATTRIBUTE', 'CLIENT_ATTRIBUTE', 'SHARED_ATTRIBUTE'].includes(column.type),
      )
    )
      errors.push('实体表格字段配置无效或超过 16 列');
    else if (new Set(table.columns.map((column) => `${column.type}:${column.key}`)).size !== table.columns.length)
      errors.push('实体表格字段不能重复');
  }
  if (settings.family === 'input') {
    const input = settings.input;
    if (
      (input.min != null && !Number.isFinite(input.min)) ||
      (input.max != null && !Number.isFinite(input.max)) ||
      (input.min != null && input.max != null && input.min > input.max)
    )
      errors.push('输入范围无效');
  }
  if (settings.family === 'aggregate') {
    const slots = settings.aggregate.slots;
    if (
      !Array.isArray(slots) ||
      !slots.length ||
      slots.length > 5 ||
      slots.some(
        (slot) =>
          !slot ||
          !['center', 'leftTop', 'leftBottom', 'rightTop', 'rightBottom'].includes(slot.position) ||
          !slot.id ||
          !['NONE', 'AVG', 'MIN', 'MAX', 'SUM', 'COUNT'].includes(slot.aggregationType) ||
          !['PREVIOUS_VALUE', 'DELTA_ABSOLUTE', 'DELTA_PERCENT'].includes(slot.comparisonResultType) ||
          !['previousInterval', 'customInterval', 'day', 'week', 'month', 'year'].includes(slot.timeForComparison) ||
          !Number.isInteger(slot.decimals) ||
          slot.decimals < 0 ||
          slot.decimals > 8 ||
          !Number.isFinite(slot.fontSize) ||
          slot.fontSize < 10 ||
          slot.fontSize > 96 ||
          (slot.timeForComparison === 'customInterval' &&
            (!Number.isFinite(slot.comparisonCustomIntervalValue) || slot.comparisonCustomIntervalValue <= 0)),
      ) ||
      new Set(slots.map((slot) => slot.position)).size !== slots.length ||
      new Set(slots.map((slot) => slot.id)).size !== slots.length
    )
      errors.push('聚合数值位置须唯一，且聚合、比较、格式配置有效');
    if (options.window.realtime && Array.isArray(slots) && slots.some((slot) => slot?.comparisonEnabled))
      errors.push('实时浮动窗口不支持原生数据比较，请选择固定历史窗口或关闭比较');
  }
  if (
    settings.family === 'range' &&
    (!Number.isFinite(settings.range.fillOpacity) || settings.range.fillOpacity < 0 || settings.range.fillOpacity > 1)
  )
    errors.push('范围图填充透明度须为 0–1');
  if (['radar', 'polar'].includes(settings.family)) {
    const radial = settings.radial;
    if (
      (radial.min != null && !Number.isFinite(radial.min)) ||
      (radial.max != null && !Number.isFinite(radial.max)) ||
      (radial.min != null && radial.max != null && radial.min >= radial.max) ||
      !Number.isFinite(radial.startAngle) ||
      Math.abs(radial.startAngle) > 360 ||
      !Number.isInteger(radial.splitNumber) ||
      radial.splitNumber < 1 ||
      radial.splitNumber > 20 ||
      !Number.isFinite(radial.barWidth) ||
      radial.barWidth < 1 ||
      radial.barWidth > 100 ||
      !Number.isFinite(radial.lineWidth) ||
      radial.lineWidth < 0 ||
      radial.lineWidth > 20 ||
      !Number.isFinite(radial.pointSize) ||
      radial.pointSize < 0 ||
      radial.pointSize > 50 ||
      !Number.isFinite(radial.areaOpacity) ||
      radial.areaOpacity < 0 ||
      radial.areaOpacity > 1 ||
      !['polygon', 'circle'].includes(radial.shape) ||
      !['solid', 'dashed', 'dotted'].includes(radial.lineType) ||
      !['circle', 'rect', 'roundRect', 'triangle', 'diamond', 'pin', 'arrow'].includes(radial.pointShape)
    )
      errors.push('雷达图或极区图的范围、角度、尺寸或样式无效');
  }
  if (
    settings.family === 'latestBar' &&
    ((settings.latestBar.min != null && !Number.isFinite(settings.latestBar.min)) ||
      (settings.latestBar.max != null && !Number.isFinite(settings.latestBar.max)) ||
      (settings.latestBar.min != null &&
        settings.latestBar.max != null &&
        settings.latestBar.min >= settings.latestBar.max) ||
      !(
        Number.isFinite(settings.latestBar.barWidth) &&
        settings.latestBar.barWidth >= 1 &&
        settings.latestBar.barWidth <= 100
      ))
  )
    errors.push('柱图范围或柱宽无效');
  if (
    settings.family === 'pie' &&
    (!Number.isInteger(settings.pie.totalDecimals) || settings.pie.totalDecimals < 0 || settings.pie.totalDecimals > 8)
  )
    errors.push('合计小数位须为 0–8');
  if (!Number.isFinite(settings.fontSize) || settings.fontSize < 10 || settings.fontSize > 96)
    errors.push('数值字号须为 10–96');
  if (
    settings.family === 'gauge' &&
    ['radial', 'arc'].includes(settings.gauge.type) &&
    (![settings.gauge.startAngle, settings.gauge.endAngle].every(
      (value) => Number.isFinite(value) && Math.abs(value) <= 360,
    ) ||
      settings.gauge.startAngle === settings.gauge.endAngle)
  )
    errors.push('仪表起止角度须不同且在 -360–360 内');
  if (!(settings.presentation.labelFontSize >= 8 && settings.presentation.labelFontSize <= 96))
    errors.push('标签字号须为 8–96');
  if (!(settings.table.pageSize >= 1 && settings.table.pageSize <= 100 && Number.isInteger(settings.table.pageSize)))
    errors.push('每页条数须为 1–100 的整数');
  if (!(Number.isFinite(settings.pie.innerRadius) && settings.pie.innerRadius >= 0 && settings.pie.innerRadius < 70))
    errors.push('环形图内径须为 0–69%');
  if (
    !(
      settings.gauge.splitNumber >= 1 &&
      settings.gauge.splitNumber <= 50 &&
      Number.isInteger(settings.gauge.splitNumber)
    )
  )
    errors.push('仪表刻度数须为 1–50 的整数');
  if (!(settings.gauge.width >= 1 && settings.gauge.width <= 100)) errors.push('仪表宽度须为 1–100');
  const axes = settings.chart.axes;
  if (
    !Array.isArray(axes) ||
    !axes.length ||
    axes.length > 4 ||
    axes.some(
      (axis) =>
        !axis?.id?.trim() ||
        !['left', 'right'].includes(axis.position) ||
        (axis.min != null && !Number.isFinite(axis.min)) ||
        (axis.max != null && !Number.isFinite(axis.max)) ||
        (axis.min != null && axis.max != null && axis.min >= axis.max),
    ) ||
    new Set(axes.map((axis) => axis.id)).size !== axes.length
  )
    errors.push('坐标轴须有 1–4 个唯一标识，且上限大于下限');
  if (
    Array.isArray(axes) &&
    ['timeseries', 'valueChart', 'bar', 'range', 'aggregate', 'state'].includes(options.family)
  ) {
    for (const source of sources)
      for (const key of source.dataKeys || []) {
        const series = nativeSeriesSettings(key, options);
        if (!axes.some((axis) => axis.id === series.axisId)) errors.push('序列绑定的 Y 轴不存在');
        if (
          !['line', 'bar', 'scatter'].includes(series.type) ||
          !(Number.isFinite(series.lineWidth) && series.lineWidth >= 0 && series.lineWidth <= 20) ||
          !(Number.isFinite(series.pointSize) && series.pointSize >= 0 && series.pointSize <= 50)
        )
          errors.push('序列类型或尺寸无效');
      }
    if (
      settings.chart.thresholds.some(
        (threshold) => !Number.isFinite(threshold.value) || !axes.some((axis) => axis.id === threshold.axisId),
      )
    )
      errors.push('阈值线的数值或 Y 轴无效');
  }
  return [...new Set(errors)];
}
