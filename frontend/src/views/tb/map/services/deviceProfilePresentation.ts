import type { MapPoint } from '../types/mapPointTypes';
import {
  normalizeSensorType,
  resolveSensorDeviceType,
  resolveSensorPointStyle,
  type BuiltInSensorType,
  type SensorPointStyleOverride,
} from './sensorPointStyleService';

export interface DeviceProfileMetadata {
  deviceProfileId: string;
  deviceProfileName: string;
  deviceProfileImage?: string;
}
export interface DeviceProfileRule extends SensorPointStyleOverride {
  profileName?: string;
  preset?: BuiltInSensorType;
  pointKind?: 'sensor' | 'camera';
}
export type DeviceProfileRules = Record<string, DeviceProfileRule>;
export const UNKNOWN_PROFILE = '__unknown_profile__';

function text(value: unknown): string {
  if (value && typeof value === 'object') return text((value as any).id ?? (value as any).value);
  return typeof value === 'string' ? value.trim() : '';
}

/** Only device entity metadata and explicit profile snapshots participate; telemetry deviceType never does. */
export function readDeviceProfile(source?: any, fallback?: any): DeviceProfileMetadata {
  const metadata = source?.entityMetadata;
  const current = metadata && typeof metadata === 'object' ? metadata : source;
  const id = text(current?.deviceProfileId);
  if (metadata || id)
    return {
      deviceProfileId: id,
      deviceProfileName: text(current?.deviceProfileName),
      deviceProfileImage: text(current?.deviceProfileImage) || undefined,
    };
  if (fallback) return readDeviceProfile(fallback);
  return {
    deviceProfileId: '',
    deviceProfileName: text(current?.deviceProfileName ?? current?.deviceProfile),
    deviceProfileImage: undefined,
  };
}

export function profileKey(profile: DeviceProfileMetadata) {
  return profile.deviceProfileId || UNKNOWN_PROFILE;
}
export function profileLabel(source?: any, fallback?: any) {
  const profile = readDeviceProfile(source, fallback);
  return profile.deviceProfileName || (profile.deviceProfileId ? '设备配置名称暂不可用' : '设备配置暂不可用');
}

export function defaultProfileRule(profile: DeviceProfileMetadata): DeviceProfileRule {
  const name = profile.deviceProfileName.toLowerCase();
  return {
    profileName: profile.deviceProfileName,
    preset: name === 'camera' ? 'camera' : normalizeSensorType(name),
    pointKind: name === 'camera' ? 'camera' : 'sensor',
  };
}

export function resolveProfileRule(profile: DeviceProfileMetadata, rules: DeviceProfileRules = {}) {
  return { ...defaultProfileRule(profile), ...rules[profileKey(profile)] };
}

export function hydrateProfilePoint<T extends MapPoint>(point: T, runtime?: any, rules: DeviceProfileRules = {}): T {
  const profile = readDeviceProfile(runtime, point);
  const rule = resolveProfileRule(profile, rules);
  const { entityMetadata: _oldMetadata, ...snapshot } = point as T & { entityMetadata?: unknown };
  return { ...snapshot, ...profile, type: profile.deviceProfileId ? rule.pointKind : point.type } as T;
}

export function resolveProfilePointStyle(point: any, rules: DeviceProfileRules = {}) {
  const profile = readDeviceProfile(point);
  const rule = resolveProfileRule(profile, rules);
  const override = { ...rule, ...(point.sensorStyleOverride || {}), ...(point.pointStyleOverride || {}) };
  const preset = profile.deviceProfileId ? rule.preset : point.type === 'camera' ? 'camera' : 'default';
  return {
    ...resolveSensorPointStyle({ deviceType: preset, override }),
    image: override.icon ? undefined : safeProfileImage(profile.deviceProfileImage),
  };
}

export function safeProfileImage(value?: string): string | undefined {
  if (!value) return undefined;
  value = value.replace(/^tb-image;/, '');
  // Same-origin resources and embedded images only; never fetch arbitrary upstream infrastructure.
  if (/^\/(?!\/)/.test(value) || /^data:image\/(png|jpeg|webp|gif|svg\+xml)[;,]/i.test(value)) return value;
  return undefined;
}

export interface ProfileMigrationConflict {
  profileId: string;
  profileName: string;
  legacyKeys: string[];
}
export function migrateProfileRules(
  points: MapPoint[],
  runtimes: Record<string, any>,
  existing: DeviceProfileRules,
  legacy: Record<string, SensorPointStyleOverride>,
) {
  const rules: DeviceProfileRules = JSON.parse(JSON.stringify(existing || {}));
  const candidates = new Map<string, Map<string, SensorPointStyleOverride>>();
  const missing: string[] = [];
  for (const point of points) {
    const profile = readDeviceProfile(runtimes[point.entityId], point);
    if (!profile.deviceProfileId) {
      missing.push(point.name);
      continue;
    }
    if (existing[profile.deviceProfileId]) continue;
    rules[profile.deviceProfileId] = defaultProfileRule(profile);
    const oldKey =
      resolveSensorDeviceType(runtimes[point.entityId]) ||
      resolveSensorDeviceType(point) ||
      text((point as any).sensorType) ||
      '__unknown_device_type__';
    const style = legacy[oldKey] || (oldKey === '__unknown_device_type__' ? legacy.__unset_deviceType : undefined);
    if (style) {
      const group = candidates.get(profile.deviceProfileId) || new Map();
      group.set(oldKey, style);
      candidates.set(profile.deviceProfileId, group);
    }
  }
  const conflicts: ProfileMigrationConflict[] = [];
  for (const [id, group] of candidates) {
    const styles = [...group.values()];
    if (new Set(styles.map((style) => JSON.stringify(Object.entries(style).sort()))).size > 1) {
      conflicts.push({ profileId: id, profileName: rules[id].profileName || id, legacyKeys: [...group.keys()] });
      delete rules[id];
    } else rules[id] = { ...rules[id], ...styles[0] };
  }
  return { rules, conflicts, missing };
}
