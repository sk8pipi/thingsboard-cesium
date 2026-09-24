import shapes from './nativeLiquidShapes.generated.json';
import type { NativeLiquidSettings, NativeLiquidColor, NativeSource } from './nativeWidgetTypes';
import type { NativeDataApi } from './nativeWidgetDataCore';

export const liquidShapes = shapes;
// Units per liter, following the repository ThingsBoard liquid-level model (US customary units).
export const liquidUnits: Record<string, number> = {
  L: 1,
  'mm³': 1e6,
  'cm³': 1e3,
  'm³': 1e-3,
  'km³': 1e-15,
  mL: 1e3,
  hl: 0.01,
  'in³': 61.0237,
  'ft³': 1 / 28.3168,
  'yd³': 1 / 764.555,
  'fl-oz': 33.814,
  pt: 1 / 0.473176,
  qt: 1 / 0.946353,
  gal: 1 / 3.78541,
  bbl: 1 / 158.987,
};
export const liquidBindingKeys = ['shape', 'capacity', 'capacityUnits', 'displayUnits'] as const;
export function liquidNeedsCapacity(settings: NativeLiquidSettings) {
  return (
    settings.datasourceUnits !== '%' ||
    settings.layout === 'absolute' ||
    (settings.showTooltip && settings.tooltipUnits !== '%')
  );
}
export function liquidActiveBindings(settings: NativeLiquidSettings) {
  return liquidBindingKeys.filter(
    (key) =>
      key === 'shape' || (key === 'displayUnits' ? settings.layout === 'absolute' : liquidNeedsCapacity(settings)),
  );
}
export const liquidColorKeys = ['tankColor', 'liquidColor', 'valueColor', 'backgroundOverlayColor'] as const;
export const isLiquidUnit = (unit: string, percent = true) =>
  (percent && unit === '%') || Object.hasOwn(liquidUnits, unit);
const number = (value: unknown) =>
  (typeof value === 'number' || typeof value === 'string') && String(value).trim() && Number.isFinite(Number(value))
    ? Number(value)
    : null;
export function liquidColor(color: NativeLiquidColor, value: number | null) {
  return (
    (value == null
      ? null
      : (Array.isArray(color?.ranges) ? color.ranges : []).find((r) =>
          r.from != null && r.from === r.to
            ? value === r.from
            : (r.from == null || value >= r.from) && (r.to == null || value < r.to),
        )?.color) ||
    color?.color ||
    'currentColor'
  );
}
export function validateLiquidSettings(settings: NativeLiquidSettings): string[] {
  const errors: string[] = [];
  if (!settings || !settings.bindings || typeof settings.bindings !== 'object') return ['液位配置结构无效'];
  if (!Object.hasOwn(shapes, settings.shape)) errors.push('液位容器形状无效');
  if (!['simple', 'percentage', 'absolute'].includes(settings.layout)) errors.push('液位布局无效');
  if (liquidNeedsCapacity(settings) && !(Number.isFinite(settings.capacity) && settings.capacity >= 0.1))
    errors.push('容器容量至少为 0.1');
  if (
    !isLiquidUnit(settings.datasourceUnits) ||
    (liquidNeedsCapacity(settings) && !isLiquidUnit(settings.capacityUnits, false)) ||
    (settings.layout === 'absolute' && !isLiquidUnit(settings.displayUnits)) ||
    (settings.showTooltip && !isLiquidUnit(settings.tooltipUnits))
  )
    errors.push('液位单位无效');
  if (
    settings.showTooltip &&
    (!Number.isInteger(settings.tooltipDecimals) || settings.tooltipDecimals < 0 || settings.tooltipDecimals > 8)
  )
    errors.push('液位提示精度应为 0–8');
  if (settings.layout === 'absolute' && !(settings.volumeFontSize >= 10 && settings.volumeFontSize <= 96))
    errors.push('容量字号应为 10–96');
  for (const key of liquidActiveBindings(settings)) {
    const binding = settings.bindings[key];
    if (binding && (!binding.name?.trim() || !['CLIENT_SCOPE', 'SERVER_SCOPE', 'SHARED_SCOPE'].includes(binding.scope)))
      errors.push('液位属性绑定无效');
  }
  for (const key of liquidColorKeys) {
    if (
      (key === 'valueColor' && settings.layout === 'simple') ||
      (key === 'backgroundOverlayColor' && (settings.layout === 'simple' || !settings.showOverlay))
    )
      continue;
    const color = settings[key];
    if (
      !color ||
      !Array.isArray(color.ranges) ||
      color.ranges.some(
        (r) =>
          (r.from != null && !Number.isFinite(r.from)) ||
          (r.to != null && !Number.isFinite(r.to)) ||
          (r.from != null && r.to != null && r.from > r.to),
      )
    )
      errors.push('液位颜色区间无效');
  }
  return errors;
}
export function liquidValues(raw: unknown, settings: NativeLiquidSettings) {
  const input = number(raw);
  if (input === null || validateLiquidSettings(settings).length) return null;
  const capacityLiters = liquidNeedsCapacity(settings) ? settings.capacity / liquidUnits[settings.capacityUnits] : 100;
  const percent =
    settings.datasourceUnits === '%' ? input : (input / liquidUnits[settings.datasourceUnits] / capacityLiters) * 100;
  const convert = (units: string) =>
    units === '%' ? percent : ((capacityLiters * percent) / 100) * liquidUnits[units];
  const shape = shapes[settings.shape as keyof typeof shapes];
  const result = {
    percent,
    y: shape.empty + (Math.max(0, Math.min(100, percent)) / 100) * (shape.full - shape.empty),
    value: settings.layout !== 'absolute' ? percent : convert(settings.displayUnits),
    capacity:
      settings.layout !== 'absolute' || settings.displayUnits === '%'
        ? 100
        : capacityLiters * liquidUnits[settings.displayUnits],
    units: settings.layout !== 'absolute' ? '%' : settings.displayUnits,
    tooltip: settings.showTooltip ? convert(settings.tooltipUnits) : percent,
  };
  return [result.percent, result.y, result.value, result.capacity, result.tooltip].every(Number.isFinite)
    ? result
    : null;
}
export async function loadLiquidSettings(
  source: NativeSource,
  settings: NativeLiquidSettings,
  attributes: NativeDataApi['attributes'],
) {
  const resolved = JSON.parse(JSON.stringify(settings)) as NativeLiquidSettings;
  const errors: string[] = validateLiquidSettings(settings);
  if (errors.length) return { settings: resolved, errors };
  const groups = new Map<string, (typeof liquidBindingKeys)[number][]>();
  for (const key of liquidActiveBindings(settings)) {
    const binding = settings.bindings[key];
    if (binding) groups.set(binding.scope, [...(groups.get(binding.scope) || []), key]);
  }
  await Promise.all(
    [...groups].map(async ([scope, keys]) => {
      try {
        const response = await attributes(
          source,
          scope as 'SERVER_SCOPE',
          [...new Set(keys.map((key) => settings.bindings[key]!.name))].join(','),
        );
        for (const key of keys) {
          const name = settings.bindings[key]!.name;
          const value = Array.isArray(response) ? response.find((item) => item.key === name)?.value : undefined;
          if (key === 'capacity') {
            const capacity = number(value);
            if (capacity == null || capacity < 0.1) errors.push(`容量属性 ${name} 无效`);
            else resolved.capacity = capacity;
          } else if (
            typeof value !== 'string' ||
            (key === 'shape' ? !Object.hasOwn(shapes, value) : !isLiquidUnit(value.trim(), key === 'displayUnits'))
          )
            errors.push(`属性 ${name} 缺失或无效`);
          else resolved[key] = value.trim();
        }
      } catch {
        errors.push('液位配置属性读取失败');
      }
    }),
  );
  return { settings: resolved, errors };
}
