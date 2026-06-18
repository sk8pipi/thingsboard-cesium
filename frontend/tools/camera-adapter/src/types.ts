export type CameraStreamType = 'hls' | 'http-flv' | 'http-ts' | 'webrtc';

export type CameraAlarmLevel = 'none' | 'info' | 'warning' | 'critical';

export interface PreviewCameraAttributesPayload {
  cameraId: string;
  name: string;
  manufacturer: string;
  model: string;
  ip: string;
  lng: number;
  lat: number;
  alt?: number;
  customerId?: string;
  siteId?: string;
  streamType: CameraStreamType;
  streamUrlMain: string;
  streamUrlSub?: string;
  previewOnly: true;
}

export interface PreviewCameraStatePayload {
  cameraId: string;
  online: boolean;
  playerError: string;
  previewOpenCount: number;
  previewLastOpenTs: number;
  alarmText: string;
  alarmLevel: CameraAlarmLevel;
  ts: number;
}

export interface PreviewCameraHealthPayload {
  cameraId: string;
  online: boolean;
  streamAlive: boolean;
  bitrateKbps: number;
  lastHeartbeatTs: number;
  ts: number;
}

export interface CameraAdapterCameraConfig extends PreviewCameraAttributesPayload {
  hlsRootDir: string;
  streamAliveThresholdMs: number;
  normalBitrateKbps: number;
  defaultAlarmText?: string;
  defaultAlarmLevel?: CameraAlarmLevel;
}

export interface CameraAdapterConfig {
  mqtt: {
    brokerUrl: string;
    username?: string;
    password?: string;
    clientId: string;
    topicPrefix: string;
    qos: 0 | 1 | 2;
    retainMeta: boolean;
  };
  publishIntervalMs: number;
  cameras: CameraAdapterCameraConfig[];
}

