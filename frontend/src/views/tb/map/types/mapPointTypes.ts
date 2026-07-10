export type MapPointType = 'sensor' | 'camera';

export type MapPointEntityType = 'DEVICE' | 'ASSET';

export type MapEditorMode =
  | 'view'
  | 'editing'
  | 'pickingPoint'
  | 'selectingPointType'
  | 'configuringSensorPoint'
  | 'configuringCameraPoint';

export interface MapPointLocation {
  longitude: number;
  latitude: number;
  height?: number;
  heightMode?: 'absolute' | 'relativeToGround';
}

export interface BaseMapPoint extends MapPointLocation {
  id: string;
  type: MapPointType;
  name: string;
  entityType: MapPointEntityType;
  entityId: string;
  entityName: string;
  online?: boolean;
  statusText?: string;
  source?: 'manual' | 'device';
  locationSource?: 'deviceInfo' | 'attribute' | 'telemetry' | 'manual';
  createdAt: number;
  updatedAt: number;
}

export interface SensorDatasourceKey {
  name: string;
  type: 'timeseries' | 'attribute' | 'entityField' | 'alarmField';
  label?: string;
  units?: string;
  color?: string;
}

export interface SensorMapPoint extends BaseMapPoint {
  type: 'sensor';
  deviceType?: string;
  sensorType?: string;
  sensorStyleOverride?: {
    color?: string;
    iconColor?: string;
    offlineColor?: string;
    offlineIconColor?: string;
    ringColor?: string;
    offlineRingColor?: string;
    icon?: {
      viewBox: string;
      paths: string[];
    };
  };
  datasource?: {
    entityType: MapPointEntityType;
    entityId: string;
    entityName?: string;
    keys: SensorDatasourceKey[];
    pollMs?: number;
  };
  popupWidgetIds?: string[];
  color?: string;
  description?: string;
}

export interface CameraMapPoint extends BaseMapPoint {
  type: 'camera';
  entityType: 'DEVICE';
  color?: string;
  description?: string;
}

export type MapPoint = SensorMapPoint | CameraMapPoint;

export interface DevicePointBindingInfo {
  deviceId: string;
  deviceName?: string;
  pointId: string;
  pointName: string;
  pointType: MapPointType;
}

export interface CameraRuntimeInfo {
  entityId: string;
  entityName: string;
  cameraId?: string;
  cameraCode?: string;
  cameraName?: string;
  cameraModel?: string;
  hlsUrl?: string;
  streamUrl?: string;
  webRtcUrl?: string;
  rtspUrl?: string;
  flvUrl?: string;
  streamType?: string;
  supportsLive?: boolean;
  supportsPlayback?: boolean;
  supportsPtz?: boolean;
  supportsZoom?: boolean;
  supportsPreset?: boolean;
  supportsAudio?: boolean;
  controlMode?: 'none' | 'thingsboardRpc' | 'gatewayRpc' | 'mediaServerProxy';
  supportedRpcMethods?: string[] | string;
  rpcTargetDeviceId?: string;
  rpcTargetDeviceName?: string;
  rpcTargetCameraId?: string;
  rpcGatewayMethod?: string;
  rpcTopic?: string;
  rpcPayloadMode?: 'plain' | 'gatewayTopic';
  rpcTargetMode?: 'device' | 'gateway';
  rpcCallType?: 'oneway' | 'twoway';
  rpcTimeout?: number;
  online?: boolean;
  streamOnline?: boolean;
  fps?: number;
  bitrate?: number;
  delayMs?: number;
  motion?: boolean;
  alarm?: boolean;
  recording?: boolean;
  videoLoss?: boolean;
  motionDetected?: boolean;
  tamperAlarm?: boolean;
}
