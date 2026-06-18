import { BASE_MODEL_CENTER, DEVICE_POINT_COMPACT_LAYOUT } from '../mapSceneConfig';
import type { CameraMapPoint, MapPoint, SensorMapPoint } from '../types/mapPointTypes';

type CompactLayoutOptions = {
  center?: {
    longitude: number;
    latitude: number;
  };
  sensorSpacingMeters?: number;
  cameraRadiusMeters?: number;
  defaultSensorHeight?: number;
  defaultCameraHeight?: number;
};

function metersToDegrees(centerLatitude: number, eastMeters: number, northMeters: number) {
  const metersPerDegreeLatitude = 111_320;
  const metersPerDegreeLongitude = metersPerDegreeLatitude * Math.cos((centerLatitude * Math.PI) / 180);

  return {
    longitudeOffset: eastMeters / Math.max(metersPerDegreeLongitude, 1),
    latitudeOffset: northMeters / metersPerDegreeLatitude,
  };
}

function offsetPoint<T extends MapPoint>(
  point: T,
  eastMeters: number,
  northMeters: number,
  defaultHeight: number,
  options: Required<CompactLayoutOptions>,
): T {
  const offset = metersToDegrees(options.center.latitude, eastMeters, northMeters);
  return {
    ...point,
    longitude: options.center.longitude + offset.longitudeOffset,
    latitude: options.center.latitude + offset.latitudeOffset,
    height: defaultHeight,
    heightMode: 'relativeToGround',
  };
}

function layoutSensors(points: SensorMapPoint[], options: Required<CompactLayoutOptions>) {
  if (!points.length) return [];

  const columns = Math.max(1, Math.ceil(Math.sqrt(points.length)));
  const rows = Math.ceil(points.length / columns);
  const spacing = options.sensorSpacingMeters;

  return points.map((point, index) => {
    const row = Math.floor(index / columns);
    const column = index % columns;
    const eastMeters = (column - (columns - 1) / 2) * spacing;
    const northMeters = ((rows - 1) / 2 - row) * spacing;

    return offsetPoint(point, eastMeters, northMeters, options.defaultSensorHeight, options);
  });
}

function layoutCameras(points: CameraMapPoint[], options: Required<CompactLayoutOptions>) {
  if (!points.length) return [];

  const radius = options.cameraRadiusMeters;
  const angleOffset = -Math.PI / 2;

  return points.map((point, index) => {
    const angle = angleOffset + (index / points.length) * Math.PI * 2;
    const eastMeters = Math.cos(angle) * radius;
    const northMeters = Math.sin(angle) * radius;

    return offsetPoint(point, eastMeters, northMeters, options.defaultCameraHeight, options);
  });
}

export function applyCompactModelLayout(points: MapPoint[], inputOptions: CompactLayoutOptions = {}) {
  const options: Required<CompactLayoutOptions> = {
    center: inputOptions.center || BASE_MODEL_CENTER,
    sensorSpacingMeters: inputOptions.sensorSpacingMeters || DEVICE_POINT_COMPACT_LAYOUT.sensorSpacingMeters,
    cameraRadiusMeters: inputOptions.cameraRadiusMeters || DEVICE_POINT_COMPACT_LAYOUT.cameraRadiusMeters,
    defaultSensorHeight: inputOptions.defaultSensorHeight || DEVICE_POINT_COMPACT_LAYOUT.defaultSensorHeight,
    defaultCameraHeight: inputOptions.defaultCameraHeight || DEVICE_POINT_COMPACT_LAYOUT.defaultCameraHeight,
  };

  const sensors = points.filter((point): point is SensorMapPoint => point.type === 'sensor');
  const cameras = points.filter((point): point is CameraMapPoint => point.type === 'camera');

  return [...layoutSensors(sensors, options), ...layoutCameras(cameras, options)];
}
