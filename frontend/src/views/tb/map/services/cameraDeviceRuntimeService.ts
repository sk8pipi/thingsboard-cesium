import { getDeviceInfoById, type DeviceInfo } from '/@/api/tb/device';
import { startVideoPlayback } from '/@/api/tb/video';
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
  'hlsUrl',
  'streamUrlMain',
  'streamUrl',
  'webRtcUrl',
  'rtspUrl',
  'flvUrl',
  'streamType',
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

function resolvePreferredHlsUrl(raw: { hlsUrl?: string; streamUrlMain?: string; streamUrl?: string }) {
  return raw.hlsUrl || raw.streamUrlMain || raw.streamUrl;
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

export async function loadCameraRuntimeInfo(entityId: string, entityName: string): Promise<CameraRuntimeInfo> {
  const normalizedEntityId = String(entityId || '').trim();
  const normalizedEntityName = String(entityName || '').trim();

  if (!normalizedEntityId) {
    throw new Error('Camera entityId is required.');
  }

  const [deviceResult, attributesResult, telemetryResult, playbackResult] = await Promise.allSettled([
    getDeviceInfoById(normalizedEntityId),
    getAttributes({ entityType: EntityType.DEVICE, id: normalizedEntityId } as any, CAMERA_ATTRIBUTE_KEYS.join(',')),
    getLatestTimeseries(
      { entityType: EntityType.DEVICE, id: normalizedEntityId } as any,
      CAMERA_TELEMETRY_KEYS.join(','),
      true,
    ),
    startVideoPlayback(normalizedEntityId),
  ]);

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

  const rawHlsUrl = toStringValue(attributeState.hlsUrl);
  const rawStreamUrlMain = toStringValue(attributeState.streamUrlMain);
  const rawStreamUrl = toStringValue(attributeState.streamUrl);
  const webRtcUrl = playback?.webRtcUrl || toStringValue(attributeState.webRtcUrl);
  const rtspUrl = toStringValue(attributeState.rtspUrl);
  const legacyHlsUrl = resolvePreferredHlsUrl({
    hlsUrl: rawHlsUrl,
    streamUrlMain: rawStreamUrlMain,
    streamUrl: rawStreamUrl,
  });
  const playbackUrl = playback?.url || playback?.hlsUrl;
  const hlsUrl = playbackUrl || legacyHlsUrl;
  const streamUrl = playbackUrl || rawStreamUrl || rawStreamUrlMain || rawHlsUrl;
  const deviceActive = typeof device?.active === 'boolean' ? device.active : undefined;
  const telemetryOnline = toBoolean(telemetryState.online ?? telemetryState.status);
  const telemetryActive = toBoolean(telemetryState.active);
  const online = deviceActive === false ? false : (telemetryOnline ?? deviceActive ?? telemetryActive ?? false);
  const telemetryStreamOnline = toBoolean(telemetryState.streamOnline ?? telemetryState.streamAlive);
  const streamOnline =
    online === false ? false : (playback?.online ?? telemetryStreamOnline ?? (hlsUrl || streamUrl ? true : undefined));
  const motion = toBoolean(telemetryState.motion);
  const motionDetected = toBoolean(telemetryState.motionDetected) ?? motion;
  const configuredRpcTargetDeviceId =
    toStringValue(attributeState.rpcTargetDeviceId) ||
    toStringValue(attributeState.controlDeviceId) ||
    toStringValue(attributeState.gatewayDeviceId);
  const relatedGatewayDevice = configuredRpcTargetDeviceId ? null : await findRelatedGatewayDevice(normalizedEntityId);
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

  if (playback || rawHlsUrl || rawStreamUrlMain || rawStreamUrl || webRtcUrl || rtspUrl) {
    console.info('[cameraDeviceRuntimeService] Resolved camera transport:', {
      entityId: normalizedEntityId,
      entityName: normalizedEntityName || device?.name,
      source: playback ? 'video-api' : 'thingsboard-attribute-fallback',
      cameraId: attributeState.cameraId,
      cameraCode: playback?.cameraCode || attributeState.cameraCode,
      hlsUrl,
      streamUrlMain: rawStreamUrlMain,
      streamUrl: rawStreamUrl,
      webRtcUrl,
      rtspUrl,
    });
  }

  const runtimeInfo: CameraRuntimeInfo = {
    entityId: normalizedEntityId,
    entityName: toStringValue(device?.name) || normalizedEntityName || normalizedEntityId,
    cameraId: toStringValue(attributeState.cameraId),
    cameraCode:
      playback?.cameraCode || toStringValue(attributeState.cameraCode) || toStringValue(attributeState.cameraId),
    cameraName:
      toStringValue(attributeState.cameraName) ||
      normalizedEntityName ||
      toStringValue(device?.name) ||
      normalizedEntityId,
    cameraModel: toStringValue(attributeState.cameraModel),
    hlsUrl,
    streamUrl,
    webRtcUrl,
    rtspUrl,
    flvUrl: playback?.flvUrl || toStringValue(attributeState.flvUrl),
    streamType: playback ? 'hls' : toStringValue(attributeState.streamType),
    playbackSessionId: playback?.sessionId,
    playbackExpiresAt: playback?.expiresAt,
    playbackStatus: playback?.status,
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

  console.log('[Camera RPC] raw supportedRpcMethods:', attributeState.supportedRpcMethods);
  console.log(
    '[Camera RPC] normalized supportedRpcMethods:',
    normalizeSupportedRpcMethods(attributeState.supportedRpcMethods),
  );
  console.log('[Camera RPC] supports:', {
    supportsPtz: runtimeInfo.supportsPtz,
    supportsZoom: runtimeInfo.supportsZoom,
    supportsPreset: runtimeInfo.supportsPreset,
    supportsAudio: runtimeInfo.supportsAudio,
    controlMode: runtimeInfo.controlMode,
    rpcTargetDeviceId: runtimeInfo.rpcTargetDeviceId,
    rpcTargetDeviceName: runtimeInfo.rpcTargetDeviceName,
    rpcTargetCameraId: runtimeInfo.rpcTargetCameraId,
    rpcGatewayMethod: runtimeInfo.rpcGatewayMethod,
    rpcTopic: runtimeInfo.rpcTopic,
    rpcPayloadMode: runtimeInfo.rpcPayloadMode,
    rpcTargetMode: runtimeInfo.rpcTargetMode,
  });
  console.info('[cameraDeviceRuntimeService] Resolved camera runtime info:', runtimeInfo);

  return runtimeInfo;
}
