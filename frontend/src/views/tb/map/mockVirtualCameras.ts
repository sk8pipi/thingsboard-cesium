import { buildCameraPoint, type CameraPoint } from './cameraTypes';

const streamBaseUrl = (import.meta.env.VITE_CAMERA_STREAM_BASE_URL || '/video-stream/live').replace(/\/+$/, '');

const virtualOilwellCameraCode = 'virtual-oilwell-cam-001';

export const mockVirtualCameras: CameraPoint[] = [
  buildCameraPoint({
    id: virtualOilwellCameraCode,
    cameraId: virtualOilwellCameraCode,
    cameraCode: virtualOilwellCameraCode,
    cameraName: '虚拟油井摄像头-001',
    deviceName: '虚拟油井摄像头-001',
    manufacturer: 'Virtual',
    model: 'FFmpeg-TestSrc',
    longitude: 127.00055,
    latitude: 37.50036,
    height: 20,
    rtspUrl: `rtsp://localhost:8554/${virtualOilwellCameraCode}`,
    hlsUrl: `${streamBaseUrl}/${virtualOilwellCameraCode}/hls.m3u8`,
    monitorPageUrl: '',
    webRtcUrl: '',
    streamUrl: `${streamBaseUrl}/${virtualOilwellCameraCode}/hls.m3u8`,
    streamUrlMain: `${streamBaseUrl}/${virtualOilwellCameraCode}/hls.m3u8`,
    protocol: 'hls',
    streamType: 'hls',
    online: true,
    streamOnline: true,
    streamAlive: true,
    fps: 25,
    bitrate: 2048,
    bitrateKbps: 2048,
    delayMs: 300,
    supportsLive: true,
    supportsPlayback: false,
    supportsPtz: false,
    supportsZoom: false,
    supportsPreset: false,
    supportsAudio: true,
    controlMode: 'none',
    alarmStatus: 'normal',
    alarmLevel: 'none',
    previewOnly: true,
    dataSource: 'mock',
    locationText: 'Cesium 测试井场 / 虚拟监控点位',
    description: 'TODO: Replace with ThingsBoard attributes and telemetry; media playback uses WVP/ZLMediaKit HLS.',
    metadata: {
      streamProfile: 'main',
      mediaSource: 'wvp-zlmediakit',
    },
  }),
];

export const cameraMockList = mockVirtualCameras;
