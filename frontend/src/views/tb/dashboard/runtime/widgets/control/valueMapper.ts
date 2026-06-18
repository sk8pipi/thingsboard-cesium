import type { ControlWidgetSettings } from './types';

export function mapUiValueToPayload(value: boolean, settings: ControlWidgetSettings) {
  return value ? (settings.onValue ?? true) : (settings.offValue ?? false);
}

export function normalizeRawStateToBoolean(raw: any, settings: ControlWidgetSettings): boolean {
  const onValue = settings.onValue ?? true;
  const offValue = settings.offValue ?? false;

  if (raw === true || raw === false) return raw;

  if (raw === onValue) return true;
  if (raw === offValue) return false;

  if (typeof raw === 'number') return raw !== 0;
  if (typeof raw === 'string') {
    const v = raw.trim().toLowerCase();
    if (['true', '1', 'on', 'open', 'enabled'].includes(v)) return true;
    if (['false', '0', 'off', 'close', 'closed', 'disabled'].includes(v)) return false;
  }

  return Boolean(raw);
}
