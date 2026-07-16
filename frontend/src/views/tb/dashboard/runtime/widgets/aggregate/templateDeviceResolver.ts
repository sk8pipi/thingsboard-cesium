import type { TemplateDeviceSelector } from './aggregateMetricTypes';

export type TemplateRuntimeDevices = Record<string, Record<string, unknown>>;

export interface TemplatePointLike {
  type?: unknown;
  entityType?: unknown;
  entityId?: unknown;
  entityName?: unknown;
  name?: unknown;
  deviceCategory?: unknown;
  deviceProfile?: unknown;
  deviceType?: unknown;
  sensorType?: unknown;
  telemetryKeys?: unknown;
  datasource?: unknown;
}

export interface TemplateDeviceBinding {
  deviceId: string;
  deviceName?: string;
  deviceCategory?: string;
  deviceProfile?: string;
  deviceType?: string;
  pointType?: string;
  telemetryKeys: string[];
  runtime: Record<string, unknown>;
}

function optionalString(...values: unknown[]) {
  for (const value of values) {
    const normalized = String(value ?? '').trim();
    if (normalized) return normalized;
  }
  return undefined;
}

function normalizeKeyList(value: unknown) {
  if (!Array.isArray(value)) return [];
  return value
    .map((item) => {
      if (typeof item === 'string') return item.trim();
      if (item && typeof item === 'object') return String((item as Record<string, unknown>).name || '').trim();
      return '';
    })
    .filter(Boolean);
}

function pointTelemetryKeys(point?: TemplatePointLike) {
  if (!point) return [];
  const datasource =
    point.datasource && typeof point.datasource === 'object'
      ? (point.datasource as Record<string, unknown>)
      : undefined;
  return [...normalizeKeyList(point.telemetryKeys), ...normalizeKeyList(datasource?.keys)];
}

function normalizeIdentity(value: unknown) {
  return String(value ?? '')
    .trim()
    .toLowerCase();
}

function matchesSelector(binding: TemplateDeviceBinding, selector: TemplateDeviceSelector, telemetryKey: string) {
  if (selector.type === 'all-template-devices') return true;
  if (selector.type === 'explicit-devices') return selector.deviceIds.includes(binding.deviceId);
  if (selector.type === 'device-profile') {
    return normalizeIdentity(binding.deviceProfile) === normalizeIdentity(selector.deviceProfile);
  }

  const expected = normalizeIdentity(selector.deviceCategory);
  if (binding.deviceCategory) return normalizeIdentity(binding.deviceCategory) === expected;
  if ([binding.deviceProfile, binding.deviceType].some((value) => normalizeIdentity(value) === expected)) return true;
  if (!binding.telemetryKeys.length && binding.pointType !== 'camera') return true;
  return (
    binding.telemetryKeys.includes(telemetryKey) || Object.prototype.hasOwnProperty.call(binding.runtime, telemetryKey)
  );
}

export function resolveTemplateDevices(options: {
  runtimeDevices?: TemplateRuntimeDevices | null;
  templatePoints?: TemplatePointLike[] | null;
  selector: TemplateDeviceSelector;
  telemetryKey: string;
}): TemplateDeviceBinding[] {
  const runtimeDevices = options.runtimeDevices || {};
  const pointsByDevice = new Map<string, TemplatePointLike>();
  (options.templatePoints || []).forEach((point) => {
    if (String(point.entityType || 'DEVICE').toUpperCase() !== 'DEVICE') return;
    const deviceId = String(point.entityId || '').trim();
    if (deviceId && !pointsByDevice.has(deviceId)) pointsByDevice.set(deviceId, point);
  });

  const deviceIds = new Set([...Object.keys(runtimeDevices), ...pointsByDevice.keys()]);
  return Array.from(deviceIds)
    .map((deviceId): TemplateDeviceBinding => {
      const runtime = runtimeDevices[deviceId] || {};
      const point = pointsByDevice.get(deviceId);
      const telemetryKeys = Array.from(
        new Set([...pointTelemetryKeys(point), ...normalizeKeyList(runtime.telemetryKeys)]),
      );
      return {
        deviceId,
        deviceName: optionalString(runtime.entityName, runtime.deviceName, point?.entityName, point?.name, deviceId),
        deviceCategory: optionalString(runtime.deviceCategory, point?.deviceCategory),
        deviceProfile: optionalString(runtime.deviceProfile, runtime.deviceProfileName, point?.deviceProfile),
        deviceType: optionalString(runtime.tbDeviceType, runtime.deviceType, point?.deviceType, point?.sensorType),
        pointType: optionalString(point?.type),
        telemetryKeys,
        runtime,
      };
    })
    .filter((binding) => matchesSelector(binding, options.selector, options.telemetryKey))
    .sort((left, right) => left.deviceId.localeCompare(right.deviceId));
}
