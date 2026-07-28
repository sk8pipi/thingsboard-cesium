import { defHttp } from '/@/utils/http/axios';

export interface VideoCameraInfo {
  cameraCode: string;
  name: string;
  sourceType: string;
  app: string;
  stream: string;
  enabled: boolean;
  online: boolean;
  hlsUrl: string;
  flvUrl: string;
}

export interface VideoPlaybackInfo {
  cameraCode: string;
  app: string;
  stream: string;
  online: boolean;
  hlsUrl: string;
  flvUrl: string;
  webRtcUrl: string;
}

export function getVideoCameras() {
  return defHttp.get<VideoCameraInfo[]>({ url: '/api/video/cameras' }, { errorMessageMode: 'none' });
}

export function startVideoPlayback(cameraCode: string) {
  return defHttp.post<VideoPlaybackInfo>(
    { url: `/api/video/cameras/${encodeURIComponent(cameraCode)}/play` },
    { errorMessageMode: 'none' },
  );
}
