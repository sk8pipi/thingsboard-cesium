import { buildCameraPoint, type CameraDevice, type CameraPoint } from '../cameraTypes';
import { mockVirtualCameras } from '../mockVirtualCameras';

export async function loadCameraDevices(): Promise<CameraDevice[]> {
  // TODO: 后续替换为 ThingsBoard Device attributes / latest telemetry 数据源。
  return mockVirtualCameras.map((camera) => buildCameraPoint(camera));
}

export async function loadCameraPoints(): Promise<CameraPoint[]> {
  const devices = await loadCameraDevices();
  return devices.map((camera) => buildCameraPoint(camera));
}
