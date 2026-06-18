import { normalizeSupportedRpcMethods } from './services/cameraRpcCapabilities';

export type CameraProtocol = 'hls' | 'http-flv' | 'http-ts' | 'webrtc';

export type CameraStatus = 'online' | 'offline' | 'warning' | 'error';

export type CameraAlarmLevel = 'none' | 'info' | 'warning' | 'critical';

export type CameraAlarmStatus = 'normal' | 'warning' | 'critical';

export type CameraControlMode = 'none' | 'thingsboardRpc' | 'mediaServerProxy' | 'gatewayRpc';

export type CameraDataSource = 'mock' | 'thingsboard' | 'merged';

export type PtzCommand = 'up' | 'down' | 'left' | 'right' | 'stop' | 'zoomIn' | 'zoomOut';

export interface CameraDeviceAttributes {
  deviceId?: string;
  entityId?: string;
  cameraId?: string;
  cameraCode: string;
  cameraName: string;
  name?: string;
  deviceName?: string;
  manufacturer?: string;
  model?: string;
  ip?: string;
  longitude: number;
  latitude: number;
  height?: number;
  altitude?: number;
  lng?: number;
  lat?: number;
  alt?: number;
  rtspUrl?: string;
  hlsUrl?: string;
  webRtcUrl?: string;
  flvUrl?: string;
  monitorPageUrl?: string;
  streamType?: CameraProtocol;
  streamUrlMain?: string;
  streamUrlSub?: string;
  supportsLive?: boolean;
  supportsPlayback?: boolean;
  supportsPtz?: boolean;
  supportsZoom?: boolean;
  supportsPreset?: boolean;
  supportsAudio?: boolean;
  controlMode?: CameraControlMode;
  supportedRpcMethods?: string[] | string;
  customerId?: string;
  siteId?: string;
  locationText?: string;
  posterUrl?: string;
  description?: string;
  previewOnly?: true;
}

export interface CameraDeviceTelemetry {
  online?: boolean;
  streamOnline?: boolean;
  streamAlive?: boolean;
  fps?: number;
  bitrate?: number;
  bitrateKbps?: number;
  delayMs?: number;
  lastHeartbeatTs?: number;
  playerError?: string;
  previewOpenCount?: number;
  previewLastOpenTs?: number;
  alarmText?: string;
  alarmStatus?: CameraAlarmStatus;
  alarmLevel?: CameraAlarmLevel;
  videoLoss?: boolean;
  motionDetected?: boolean;
  tamperAlarm?: boolean;
}

export interface CameraDevice extends CameraDeviceAttributes, CameraDeviceTelemetry {
  id: string;
  name: string;
  streamUrl: string;
  protocol: CameraProtocol;
  status: CameraStatus;
  dataSource?: CameraDataSource;
  metadata?: Record<string, unknown>;
}

export type PreviewCameraAttributes = CameraDeviceAttributes;

export type PreviewCameraTelemetry = CameraDeviceTelemetry;

export type CameraPoint = CameraDevice;

export const CAMERA_ATTRIBUTE_KEYS = [
  'cameraId',
  'cameraCode',
  'cameraName',
  'name',
  'deviceName',
  'manufacturer',
  'model',
  'ip',
  'longitude',
  'latitude',
  'height',
  'lng',
  'lat',
  'alt',
  'rtspUrl',
  'hlsUrl',
  'webRtcUrl',
  'flvUrl',
  'monitorPageUrl',
  'streamType',
  'streamUrlMain',
  'streamUrlSub',
  'supportsLive',
  'supportsPlayback',
  'supportsPtz',
  'supportsZoom',
  'supportsPreset',
  'supportsAudio',
  'controlMode',
  'supportedRpcMethods',
  'customerId',
  'siteId',
  'locationText',
  'posterUrl',
  'description',
  'previewOnly',
] as const;

export const CAMERA_TELEMETRY_KEYS = [
  'online',
  'streamOnline',
  'streamAlive',
  'fps',
  'bitrate',
  'bitrateKbps',
  'delayMs',
  'lastHeartbeatTs',
  'playerError',
  'previewOpenCount',
  'previewLastOpenTs',
  'alarmText',
  'alarmStatus',
  'alarmLevel',
  'videoLoss',
  'motionDetected',
  'tamperAlarm',
] as const;

export function toCameraAlarmLevel(value: unknown): CameraAlarmLevel {
  const normalized = String(value || 'none')
    .trim()
    .toLowerCase();
  if (normalized === 'critical') return 'critical';
  if (normalized === 'warning') return 'warning';
  if (normalized === 'info') return 'info';
  if (normalized === 'normal') return 'none';
  return 'none';
}

export function toCameraAlarmStatus(value: unknown): CameraAlarmStatus {
  const normalized = String(value || 'normal')
    .trim()
    .toLowerCase();
  if (normalized === 'critical') return 'critical';
  if (normalized === 'warning') return 'warning';
  return 'normal';
}

export function resolveCameraStatus(input: {
  online?: boolean;
  streamOnline?: boolean;
  streamAlive?: boolean;
  alarmLevel?: CameraAlarmLevel;
}): CameraStatus {
  if (!input.online) {
    return 'offline';
  }

  if (input.alarmLevel === 'critical') {
    return 'error';
  }

  if (input.streamOnline === false || input.streamAlive === false) {
    return 'warning';
  }

  if (input.alarmLevel === 'warning' || input.alarmLevel === 'info') {
    return 'warning';
  }

  return 'online';
}

export function buildCameraPoint(
  input: Partial<CameraPoint> & {
    cameraCode?: string;
    cameraName?: string;
    name?: string;
    longitude?: number;
    latitude?: number;
  },
): CameraPoint {
  const cameraCode = String(input.cameraCode || input.cameraId || input.id || '').trim();
  const cameraName = String(input.cameraName || input.name || cameraCode || '未命名摄像头');
  const longitude = Number(input.longitude ?? input.lng ?? 0);
  const latitude = Number(input.latitude ?? input.lat ?? 0);
  const height = input.height ?? input.altitude ?? input.alt ?? 0;
  const hlsUrl = input.hlsUrl || input.streamUrlMain || input.streamUrl || '';
  const streamOnline = input.streamOnline ?? input.streamAlive ?? input.online ?? false;
  const alarmLevel = input.alarmLevel ?? toCameraAlarmLevel(input.alarmStatus);

  return {
    id: String(input.id || cameraCode),
    deviceId: input.deviceId,
    entityId: input.entityId,
    cameraId: String(input.cameraId || cameraCode),
    cameraCode,
    cameraName,
    name: cameraName,
    deviceName: input.deviceName || cameraName,
    manufacturer: input.manufacturer || '',
    model: input.model || '',
    ip: input.ip || '',
    longitude,
    latitude,
    height,
    altitude: input.altitude ?? input.height ?? input.alt ?? 0,
    lng: input.lng ?? longitude,
    lat: input.lat ?? latitude,
    alt: input.alt ?? input.altitude ?? input.height ?? 0,
    rtspUrl: input.rtspUrl || '',
    hlsUrl,
    webRtcUrl: input.webRtcUrl || '',
    flvUrl: input.flvUrl || '',
    monitorPageUrl: input.monitorPageUrl || '',
    streamType: input.streamType || input.protocol || 'hls',
    streamUrlMain: input.streamUrlMain || hlsUrl,
    streamUrlSub: input.streamUrlSub || '',
    supportsLive: input.supportsLive ?? true,
    supportsPlayback: input.supportsPlayback ?? false,
    supportsPtz: input.supportsPtz ?? false,
    supportsZoom: input.supportsZoom ?? false,
    supportsPreset: input.supportsPreset ?? false,
    supportsAudio: input.supportsAudio ?? false,
    controlMode: input.controlMode || 'none',
    supportedRpcMethods: normalizeSupportedRpcMethods(input.supportedRpcMethods),
    customerId: input.customerId || '',
    siteId: input.siteId || '',
    locationText: input.locationText || '',
    posterUrl: input.posterUrl || '',
    description: input.description || '',
    previewOnly: input.previewOnly === true ? true : undefined,
    online: input.online ?? false,
    streamOnline,
    streamAlive: input.streamAlive ?? streamOnline,
    fps: input.fps ?? 0,
    bitrate: input.bitrate ?? input.bitrateKbps ?? 0,
    bitrateKbps: input.bitrateKbps ?? input.bitrate ?? 0,
    delayMs: input.delayMs ?? 0,
    lastHeartbeatTs: input.lastHeartbeatTs ?? 0,
    playerError: input.playerError || '',
    previewOpenCount: input.previewOpenCount ?? 0,
    previewLastOpenTs: input.previewLastOpenTs ?? 0,
    alarmText: input.alarmText || '',
    alarmStatus:
      input.alarmStatus ?? (alarmLevel === 'critical' ? 'critical' : alarmLevel === 'warning' ? 'warning' : 'normal'),
    alarmLevel,
    videoLoss: input.videoLoss ?? false,
    motionDetected: input.motionDetected ?? false,
    tamperAlarm: input.tamperAlarm ?? false,
    streamUrl: input.streamUrl || hlsUrl || input.webRtcUrl || input.flvUrl || '',
    protocol: input.protocol || input.streamType || (input.webRtcUrl && !hlsUrl ? 'webrtc' : 'hls'),
    status:
      input.status ||
      resolveCameraStatus({
        online: input.online ?? false,
        streamOnline,
        streamAlive: input.streamAlive ?? streamOnline,
        alarmLevel,
      }),
    dataSource: input.dataSource || 'mock',
    metadata: input.metadata || {},
  };
}
