import { getVideoCameras, startVideoPlayback, type VideoPlaybackInfo } from '/@/api/tb/video';
import { buildCameraPoint, type CameraDevice, type CameraPoint } from '../cameraTypes';
import { mockVirtualCameras } from '../mockVirtualCameras';

function fallbackCameras(): CameraDevice[] {
  return mockVirtualCameras.map((camera) => buildCameraPoint(camera));
}

export async function loadCameraDevices(): Promise<CameraDevice[]> {
  try {
    const videoCameras = await getVideoCameras();
    if (!videoCameras.length) {
      return fallbackCameras();
    }

    return videoCameras.map((camera) => {
      const seed = mockVirtualCameras.find((item) => item.cameraCode === camera.cameraCode);
      return buildCameraPoint({
        ...seed,
        id: camera.tbDeviceId,
        deviceId: camera.tbDeviceId,
        entityId: camera.tbDeviceId,
        cameraId: camera.cameraCode,
        cameraCode: camera.cameraCode,
        cameraName: camera.name,
        name: camera.name,
        hlsUrl: camera.hlsUrl,
        flvUrl: camera.flvUrl,
        streamUrl: camera.hlsUrl,
        streamUrlMain: camera.hlsUrl,
        protocol: 'hls',
        streamType: 'hls',
        online: camera.enabled,
        streamOnline: camera.online,
        streamAlive: camera.online,
        dataSource: seed ? 'merged' : 'thingsboard',
        metadata: {
          ...(seed?.metadata || {}),
          provider: camera.provider,
          sourceType: camera.sourceType,
          app: camera.app,
          stream: camera.stream,
        },
      });
    });
  } catch {
    return fallbackCameras();
  }
}

export async function startCameraPlayback(tbDeviceId: string): Promise<VideoPlaybackInfo> {
  return startVideoPlayback(tbDeviceId);
}

export async function loadCameraPoints(): Promise<CameraPoint[]> {
  const devices = await loadCameraDevices();
  return devices.map((camera) => buildCameraPoint(camera));
}
