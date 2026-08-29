import { getDeviceInfoById, type DeviceInfo } from '/@/api/tb/device';
import { getVideoCameras, startVideoPlayback } from '/@/api/tb/video';
import { findRelationInfoListByFrom, findRelationInfoListByTo, type EntityRelationInfo } from '/@/api/tb/relation';
import { getAttributes, getLatestTimeseries, type TsKvEntity, type kvEntity } from '/@/api/tb/telemetry';
import { EntityType } from '/@/enums/entityTypeEnum';
import { normalizeSupportedRpcMethods } from './cameraRpcCapabilities';
import type { CameraRuntimeInfo } from '../types/mapPointTypes';

const CAMERA_ATTRIBUTE_KEYS = [
  'cameraId',
  'cameraCode',
  'cameraName',
  'cameraModel',
  'supportsLive',
  'supportsPlayback',
  'supportsPtz',
  'supportsZoom',
  'supportsPreset',
  'supportsAudio',
  'controlMode',
  'supportedRpcMethods',
  'rpcTargetDeviceId',
  'controlDeviceId',
  'gatewayDeviceId',
  'rpcTargetCameraId',
  'rpcDeviceName',
  'rpcGatewayMethod',
  'rpcTopic',
  'rpcPayloadMode',
  'rpcTargetMode',
  'rpcCallType',
  'rpcTimeout',
] as const;

const CAMERA_TELEMETRY_KEYS = [
  'online',
  'active',
  'status',
  'streamOnline',
  'streamAlive',
  'fps',
  'bitrate',
  'delayMs',
  'motion',
  'alarm',
  'recording',
  'videoLoss',
  'motionDetected',
  'tamperAlarm',
] as const;

function toStringValue(value: unknown): string | undefined {
  if (value === undefined || value === null || value === '') return undefined;
  return String(value);
}

function toBoolean(value: unknown): boolean | undefined {
  if (value === undefined || value === null || value === '') return undefined;
  if (typeof value === 'boolean') return value;
  if (typeof value === 'number') return value !== 0;

  const normalized = String(value).trim().toLowerCase();
  if (['true', '1', 'yes', 'online', 'on'].includes(normalized)) return true;
  if (['false', '0', 'no', 'offline', 'off'].includes(normalized)) return false;
  return undefined;
}

function toNumber(value: unknown): number | undefined {
  if (value === undefined || value === null || value === '') return undefined;
  const next = Number(value);
  return Number.isFinite(next) ? next : undefined;
}

function toRpcCallType(value: unknown): CameraRuntimeInfo['rpcCallType'] {
  const normalized = toStringValue(value)?.toLowerCase();
  if (normalized === 'twoway') return 'twoway';
  if (normalized === 'oneway') return 'oneway';
  return undefined;
}

function toRpcPayloadMode(value: unknown): CameraRuntimeInfo['rpcPayloadMode'] {
  const normalized = toStringValue(value)?.toLowerCase();
  if (normalized === 'gatewaytopic' || normalized === 'gateway-topic' || normalized === 'topic') return 'gatewayTopic';
  if (normalized === 'plain') return 'plain';
  return undefined;
}

function toRpcTargetMode(value: unknown): CameraRuntimeInfo['rpcTargetMode'] {
  const normalized = toStringValue(value)?.toLowerCase();
  if (normalized === 'gateway') return 'gateway';
  if (normalized === 'device') return 'device';
  return undefined;
}

function getRelationDeviceCandidateIds(relations: EntityRelationInfo[], sourceDeviceId: string) {
  return relations
    .flatMap((relation) => [relation.from, relation.to])
    .filter((entity): entity is EntityId<EntityType.DEVICE> => entity?.entityType === EntityType.DEVICE)
    .map((entity) => entity.id)
    .filter((deviceId) => deviceId && deviceId !== sourceDeviceId);
}

async function findRelatedGatewayDevice(sourceDeviceId: string): Promise<DeviceInfo | null> {
  const relationResults = await Promise.allSettled([
    findRelationInfoListByFrom({ fromId: sourceDeviceId, fromType: EntityType.DEVICE }),
    findRelationInfoListByTo({ toId: sourceDeviceId, toType: EntityType.DEVICE }),
  ]);

  const relations = relationResults.flatMap((result) => (result.status === 'fulfilled' ? result.value || [] : []));
  const candidateIds = Array.from(new Set(getRelationDeviceCandidateIds(relations, sourceDeviceId)));

  if (!candidateIds.length) return null;

  const deviceResults = await Promise.allSettled(candidateIds.map((deviceId) => getDeviceInfoById(deviceId)));
  const devices = deviceResults
    .map((result) => (result.status === 'fulfilled' ? result.value : null))
    .filter((device): device is DeviceInfo => Boolean(device?.id?.id));

  return devices.find((device) => device.additionalInfo?.gateway === true) || null;
}

function extractLastValue(value: unknown): unknown {
  if (value === undefined || value === null) return undefined;

  if (Array.isArray(value)) {
    if (!value.length) return undefined;
    return extractLastValue(value[value.length - 1]);
  }

  if (typeof value === 'object') {
    const record = value as Record<string, unknown>;
    if ('value' in record) return record.value;
    if ('latestValue' in record) return record.latestValue;
    if ('v' in record) return record.v;
    if ('data' in record) return extractLastValue(record.data);
  }

  return value;
}

function attributesToObject(list: kvEntity[]) {
  return (list || []).reduce<Record<string, unknown>>((result, item) => {
    const key = String(item?.key || '').trim();
    if (key) {
      result[key] = item?.value;
    }
    return result;
  }, {});
}

function telemetryToObject(input: TsKvEntity | Record<string, unknown>) {
  return CAMERA_TELEMETRY_KEYS.reduce<Record<string, unknown>>((result, key) => {
    const value = extractLastValue((input as Record<string, unknown>)?.[key]);
    if (value !== undefined) {
      result[key] = value;
    }
    return result;
  }, {});
}

function normalizeCameraIdentity(value: unknown) {
  return String(value || '')
    .trim()
    .toLowerCase();
}

function getCameraIdentityVariants(value: unknown) {
  const normalized = normalizeCameraIdentity(value);
  if (!normalized) return [];

  const withoutPointPrefix = normalized.replace(/^(?:video-?camera|camera|device)[-_:]/, '');
  return withoutPointPrefix && withoutPointPrefix !== normalized ? [normalized, withoutPointPrefix] : [normalized];
}

async function resolveCanonicalCameraEntityId(entityId: string, identityCandidates: string[]) {
  try {
    const cameras = await getVideoCameras();
    const exactCamera = cameras.find((camera) => camera.tbDeviceId === entityId);
    if (exactCamera) return exactCamera.tbDeviceId;

    let sourceDeviceStatus = 200;
    try {
      await getDeviceInfoById(entityId);
    } catch (error: any) {
      sourceDeviceStatus = Number(error?.response?.status || error?.status || 0);
    }
    if (sourceDeviceStatus === 200) return entityId;

    const identities = new Set(identityCandidates.flatMap(getCameraIdentityVariants));
    const matchedDeviceIds = Array.from(
      new Set(
        cameras
          .filter(
            (camera) =>
              identities.has(normalizeCameraIdentity(camera.cameraCode)) ||
              identities.has(normalizeCameraIdentity(camera.name)),
          )
          .map((camera) => String(camera.tbDeviceId || '').trim())
          .filter(Boolean),
      ),
    );

    if (matchedDeviceIds.length === 1) return matchedDeviceIds[0];

    const accessibleCameraDeviceIds = Array.from(
      new Set(cameras.map((camera) => String(camera.tbDeviceId || '').trim()).filter(Boolean)),
    );
    if (accessibleCameraDeviceIds.length !== 1) return entityId;

    if (sourceDeviceStatus === 403 || sourceDeviceStatus === 404) return accessibleCameraDeviceIds[0];

    return entityId;
  } catch (error: any) {
    console.warn('[cameraDeviceRuntimeService] Failed to resolve canonical camera entity id:', {
      entityId,
      status: Number(error?.response?.status || 0) || undefined,
    });
    return entityId;
  }
}

export async function loadCameraRuntimeInfo(
  entityId: string,
  entityName: string,
  identityCandidates: string[] = [],
): Promise<CameraRuntimeInfo> {
  const normalizedEntityId = String(entityId || '').trim();
  const normalizedEntityName = String(entityName || '').trim();

  if (!normalizedEntityId) {
    throw new Error('Camera entityId is required.');
  }

  const canonicalEntityId = await resolveCanonicalCameraEntityId(normalizedEntityId, [
    normalizedEntityName,
    ...identityCandidates,
  ]);

  const [deviceResult, attributesResult, telemetryResult, playbackResult] = await Promise.allSettled([
    getDeviceInfoById(canonicalEntityId),
    getAttributes({ entityType: EntityType.DEVICE, id: canonicalEntityId } as any, CAMERA_ATTRIBUTE_KEYS.join(',')),
    getLatestTimeseries(
      { entityType: EntityType.DEVICE, id: canonicalEntityId } as any,
      CAMERA_TELEMETRY_KEYS.join(','),
      true,
    ),
    startVideoPlayback(canonicalEntityId),
  ]);

  if (playbackResult.status === 'rejected') {
    const playbackError = playbackResult.reason as any;
    const responseData = playbackError?.response?.data;
    console.error(
      `[cameraDeviceRuntimeService] Failed to start camera playback: ${JSON.stringify({
        requestedEntityId: normalizedEntityId,
        canonicalEntityId,
        status: Number(playbackError?.response?.status || playbackError?.status || 0) || undefined,
        errorCode: responseData?.errorCode,
        message: responseData?.message || playbackError?.message || 'Unknown playback error',
      })}`,
    );
  }

  if (
    deviceResult.status === 'rejected' &&
    attributesResult.status === 'rejected' &&
    telemetryResult.status === 'rejected' &&
    playbackResult.status === 'rejected'
  ) {
    throw new Error('读取摄像头设备信息失败');
  }

  const device = deviceResult.status === 'fulfilled' ? deviceResult.value : null;
  const attributeState = attributesToObject(attributesResult.status === 'fulfilled' ? attributesResult.value : []);
  const telemetryState = telemetryToObject(telemetryResult.status === 'fulfilled' ? telemetryResult.value : {});
  const playback = playbackResult.status === 'fulfilled' ? playbackResult.value : null;

  const playbackUrl = playback?.url;
  const deviceActive = typeof device?.active === 'boolean' ? device.active : undefined;
  const telemetryOnline = toBoolean(telemetryState.online ?? telemetryState.status);
  const telemetryActive = toBoolean(telemetryState.active);
  const online = deviceActive === false ? false : (telemetryOnline ?? deviceActive ?? telemetryActive ?? false);
  const telemetryStreamOnline = toBoolean(telemetryState.streamOnline ?? telemetryState.streamAlive);
  const streamOnline = online === false ? false : (playback?.online ?? telemetryStreamOnline);
  const motion = toBoolean(telemetryState.motion);
  const motionDetected = toBoolean(telemetryState.motionDetected) ?? motion;
  const configuredRpcTargetDeviceId =
    toStringValue(attributeState.rpcTargetDeviceId) ||
    toStringValue(attributeState.controlDeviceId) ||
    toStringValue(attributeState.gatewayDeviceId);
  const relatedGatewayDevice = configuredRpcTargetDeviceId ? null : await findRelatedGatewayDevice(canonicalEntityId);
  const rpcTargetDeviceId = configuredRpcTargetDeviceId || relatedGatewayDevice?.id?.id;
  const rpcTargetDeviceName = relatedGatewayDevice?.name;
  const controlMode = (toStringValue(attributeState.controlMode) as CameraRuntimeInfo['controlMode']) || 'none';
  const rpcTargetCameraId =
    toStringValue(attributeState.rpcTargetCameraId) ||
    toStringValue(attributeState.rpcDeviceName) ||
    toStringValue(attributeState.cameraId) ||
    toStringValue(attributeState.cameraCode) ||
    toStringValue(device?.name) ||
    normalizedEntityName;
  const configuredRpcTopic = toStringValue(attributeState.rpcTopic);
  const rpcPayloadMode =
    toRpcPayloadMode(attributeState.rpcPayloadMode) || (controlMode === 'gatewayRpc' ? 'gatewayTopic' : 'plain');
  const rpcTopic =
    configuredRpcTopic ||
    (rpcPayloadMode === 'gatewayTopic' && rpcTargetCameraId ? `camera/rpc/${rpcTargetCameraId}` : undefined);

  const runtimeInfo: CameraRuntimeInfo = {
    entityId: canonicalEntityId,
    entityName: toStringValue(device?.name) || normalizedEntityName || canonicalEntityId,
    cameraId: toStringValue(attributeState.cameraId),
    cameraCode:
      playback?.cameraCode || toStringValue(attributeState.cameraCode) || toStringValue(attributeState.cameraId),
    cameraName:
      toStringValue(attributeState.cameraName) ||
      normalizedEntityName ||
      toStringValue(device?.name) ||
      canonicalEntityId,
    cameraModel: toStringValue(attributeState.cameraModel),
    hlsUrl: playbackUrl,
    streamUrl: playbackUrl,
    streamType: playback ? 'hls' : undefined,
    playbackSessionId: playback?.sessionId,
    playbackExpiresAt: playback?.expiresAt,
    playbackStatus: playback?.status || (playbackResult.status === 'rejected' ? 'failed' : undefined),
    playbackProtocol: playback?.protocol === 'hls' ? 'hls' : undefined,
    supportsLive: toBoolean(attributeState.supportsLive),
    supportsPlayback: toBoolean(attributeState.supportsPlayback),
    supportsPtz: toBoolean(attributeState.supportsPtz),
    supportsZoom: toBoolean(attributeState.supportsZoom),
    supportsPreset: toBoolean(attributeState.supportsPreset),
    supportsAudio: toBoolean(attributeState.supportsAudio),
    controlMode,
    supportedRpcMethods: normalizeSupportedRpcMethods(attributeState.supportedRpcMethods),
    rpcTargetDeviceId,
    rpcTargetDeviceName,
    rpcTargetCameraId,
    rpcGatewayMethod: toStringValue(attributeState.rpcGatewayMethod),
    rpcTopic,
    rpcPayloadMode,
    rpcTargetMode: toRpcTargetMode(attributeState.rpcTargetMode) || 'device',
    rpcCallType: toRpcCallType(attributeState.rpcCallType),
    rpcTimeout: toNumber(attributeState.rpcTimeout),
    online,
    streamOnline,
    fps: toNumber(telemetryState.fps),
    bitrate: toNumber(telemetryState.bitrate),
    delayMs: toNumber(telemetryState.delayMs),
    motion,
    alarm: toBoolean(telemetryState.alarm),
    recording: toBoolean(telemetryState.recording),
    videoLoss: toBoolean(telemetryState.videoLoss),
    motionDetected,
    tamperAlarm: toBoolean(telemetryState.tamperAlarm),
  };

  return runtimeInfo;
}
