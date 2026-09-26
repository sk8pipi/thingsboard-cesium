import { indicatorColor, indicatorNumber } from './nativeIndicatorCore';
import type { NativeWindSettings } from './nativeWidgetTypes';

const directions = ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'];

export function windTickLabel(degrees: number, names: boolean): string {
  return names ? directions[(((degrees / 45) % 8) + 8) % 8] || 'N' : String(degrees);
}

export function windReading(
  direction: unknown,
  speed: unknown,
  hasSpeed: boolean,
  decimals: number,
  units: string,
  settings: NativeWindSettings,
) {
  const directionNumber = indicatorNumber(direction);
  const speedNumber = indicatorNumber(speed);
  const angle = directionNumber === null ? null : ((directionNumber % 360) + 360) % 360;
  const value = hasSpeed ? speedNumber : directionNumber;
  const digits = Number.isInteger(decimals) ? Math.max(0, Math.min(8, decimals)) : 0;
  return {
    angle,
    text: value === null ? 'N/A' : hasSpeed ? value.toFixed(digits) : `${value.toFixed(0)}°`,
    units: !hasSpeed || value === null ? '' : units,
    color: indicatorColor(settings.centerValueColor, value),
  };
}

export function validateWindSettings(settings: NativeWindSettings): string[] {
  if (!settings || !['default', 'advanced', 'simplified'].includes(settings.layout)) return ['风向布局无效'];
  const sizes = [settings.centerValueFontSize, settings.majorTicksFontSize, settings.minorTicksFontSize];
  if (sizes.some((size) => !Number.isFinite(size) || size < 8 || size > 96)) return ['风向文字字号应为 8–96'];
  if (!Number.isFinite(settings.padding) || settings.padding < 0 || settings.padding > 48) return ['风向留白应为 0–48'];
  if (!Number.isFinite(settings.overlayBlur) || settings.overlayBlur < 0 || settings.overlayBlur > 24)
    return ['背景模糊应为 0–24'];
  if (!['color', 'image'].includes(settings.backgroundType)) return ['背景类型无效'];
  if (
    !settings.centerValueColor?.color ||
    !Array.isArray(settings.centerValueColor.ranges) ||
    settings.centerValueColor.ranges.some(
      (range) =>
        !range?.color ||
        (range.from != null && !Number.isFinite(range.from)) ||
        (range.to != null && !Number.isFinite(range.to)) ||
        (range.from != null && range.to != null && range.from > range.to),
    )
  )
    return ['风向中心颜色范围无效'];
  return [];
}
