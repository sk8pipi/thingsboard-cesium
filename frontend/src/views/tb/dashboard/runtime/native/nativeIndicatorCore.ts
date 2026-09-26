import type { NativeBatterySettings, NativeLiquidColor, NativeSignalSettings } from './nativeWidgetTypes';

export function indicatorNumber(value: unknown): number | null {
  if (value === null || value === undefined || typeof value === 'boolean' || String(value).trim() === '') return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

export function indicatorColor(setting: NativeLiquidColor, value: number | null): string {
  if (value !== null) {
    const range = setting.ranges?.find((item) =>
      item.from != null && item.from === item.to
        ? value === item.from
        : (item.from == null || value >= item.from) && (item.to == null || value < item.to),
    );
    if (range) return range.color;
  }
  return setting.color;
}

export function batteryLevel(value: unknown): number | null {
  const number = indicatorNumber(value);
  return number === null ? null : Math.max(0, Math.min(100, number));
}

export function batterySegments(value: unknown, count: number): boolean[] {
  const number = indicatorNumber(value);
  return Array.from({ length: count }, (_, index) => number !== null && number > (100 / count) * index);
}

export function signalBars(value: unknown, noSignal: number): boolean[] {
  const number = indicatorNumber(value);
  return [noSignal, -85, -70, -55].map((threshold, index) =>
    number === null || number <= noSignal ? false : index === 0 ? true : number >= threshold,
  );
}

function colorErrors(color: NativeLiquidColor | undefined): boolean {
  return (
    !color?.color ||
    !Array.isArray(color.ranges) ||
    color.ranges.some(
      (range) =>
        !range?.color ||
        (range.from != null && !Number.isFinite(range.from)) ||
        (range.to != null && !Number.isFinite(range.to)) ||
        (range.from != null && range.to != null && range.from > range.to),
    )
  );
}

export function validateIndicatorSettings(
  kind: 'battery' | 'signal',
  settings: NativeBatterySettings | NativeSignalSettings,
): string[] {
  if (kind === 'battery') {
    const battery = settings as NativeBatterySettings;
    if (
      !battery ||
      !['vertical_solid', 'horizontal_solid', 'vertical_divided', 'horizontal_divided'].includes(battery.layout) ||
      !Number.isInteger(battery.sectionsCount) ||
      battery.sectionsCount < 2 ||
      battery.sectionsCount > 12 ||
      !Number.isFinite(battery.valueFontSize) ||
      battery.valueFontSize < 10 ||
      battery.valueFontSize > 96 ||
      !Number.isFinite(battery.padding) ||
      battery.padding < 0 ||
      battery.padding > 48 ||
      colorErrors(battery.valueColor) ||
      colorErrors(battery.batteryLevelColor) ||
      colorErrors(battery.batteryShapeColor)
    )
      return ['电池部件配置无效'];
    return [];
  }
  const signal = settings as NativeSignalSettings;
  if (
    !signal ||
    !['wifi', 'cellular_bar'].includes(signal.layout) ||
    !Number.isFinite(signal.noSignalRssiValue) ||
    !signal.inactiveBarsColor ||
    !signal.dateColor ||
    !signal.tooltipValueColor ||
    !signal.tooltipDateColor ||
    !signal.tooltipBackgroundColor ||
    colorErrors(signal.activeBarsColor) ||
    !Number.isFinite(signal.padding) ||
    signal.padding < 0 ||
    signal.padding > 48 ||
    !Number.isFinite(signal.tooltipBackgroundBlur) ||
    signal.tooltipBackgroundBlur < 0 ||
    signal.tooltipBackgroundBlur > 32 ||
    [signal.dateFontSize, signal.tooltipValueFontSize, signal.tooltipDateFontSize].some(
      (size) => !Number.isFinite(size) || size < 10 || size > 96,
    ) ||
    !['locale', 'date', 'time', 'iso', 'relative'].includes(signal.dateFormat) ||
    !['locale', 'date', 'time', 'iso', 'relative'].includes(signal.tooltipDateFormat)
  )
    return ['信号部件配置无效'];
  return [];
}
