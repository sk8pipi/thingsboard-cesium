import { defHttp } from '/@/utils/http/axios';

export type VideoStreamStatus = 'offline' | 'starting' | 'ready' | 'degraded' | 'stopping' | 'failed';

export interface VideoCameraInfo {
  tbDeviceId: string;
  cameraCode: string;
  name: string;
  provider: string;
  sourceType: string;
  app: string;
  stream: string;
  enabled: boolean;
  online: boolean;
  hlsUrl: string;
  flvUrl: string;
}

export interface VideoCameraStatus {
  tbDeviceId: string;
  cameraCode: string;
  provider: string;
  app: string;
  stream: string;
  status: VideoStreamStatus;
  online: boolean;
  readerCount: number;
  activeSessions: number;
  message?: string;
  updatedAt: number;
  scheduledStopAt?: number;
}

export interface VideoCameraDetails {
  tbDeviceId: string;
  cameraCode: string;
  provider: string;
  providerDeviceId?: string;
  providerChannelId?: string;
  mediaServerId?: string;
  app: string;
  stream: string;
  preferredProtocol: string;
  enabled: boolean;
  status: VideoCameraStatus;
}

export interface VideoCameraBinding {
  id: string;
  createdTime: number;
  updatedTime: number;
  tenantId: string;
  tbDeviceId: string;
  cameraCode: string;
  provider: string;
  providerDeviceId?: string;
  providerChannelId?: string;
  mediaServerId?: string;
  streamApp: string;
  streamId: string;
  preferredProtocol: string;
  enabled: boolean;
}

export interface VideoCameraBindingRequest {
  cameraCode: string;
  provider?: string;
  providerDeviceId?: string;
  providerChannelId?: string;
  mediaServerId?: string;
  streamApp?: string;
  streamId?: string;
  preferredProtocol?: 'hls';
  enabled?: boolean;
}

export interface VideoPlaybackAlternates {
  webRtc: string;
  flv: string;
}

export interface VideoPlaybackInfo {
  tbDeviceId: string;
  cameraCode: string;
  provider: string;
  app: string;
  stream: string;
  online: boolean;
  hlsUrl: string;
  protocol: string;
  url: string;
  flvUrl: string;
  webRtcUrl: string;
  sessionId: string;
  status: VideoStreamStatus;
  activeSessions: number;
  expiresAt: number;
  alternates: VideoPlaybackAlternates;
}

export interface VideoPlayRequest {
  protocol?: 'hls';
  streamProfile?: 'main';
}

export interface VideoStopRequest {
  sessionId?: string;
  force?: boolean;
}

export interface VideoStopResult {
  tbDeviceId: string;
  cameraCode: string;
  sessionId?: string;
  status: VideoStreamStatus;
  activeSessions: number;
  scheduledStopAt?: number;
}

export type VideoPtzCommand =
  | 'ptz.up'
  | 'ptz.down'
  | 'ptz.left'
  | 'ptz.right'
  | 'ptz.up-left'
  | 'ptz.up-right'
  | 'ptz.down-left'
  | 'ptz.down-right'
  | 'ptz.stop'
  | 'zoom.in'
  | 'zoom.out'
  | 'preset.call'
  | 'preset.save'
  | 'preset.delete';

export interface VideoPtzRequest {
  command: VideoPtzCommand;
  speed?: number;
  durationMs?: number;
  presetId?: number;
}

export interface VideoPtzResult {
  tbDeviceId: string;
  cameraCode: string;
  provider: string;
  transport: string;
  command: VideoPtzCommand;
  accepted: boolean;
  requestId?: string;
  requestedAt: number;
}

export interface VideoRecordingItem {
  recordingId: string;
  startTime: number;
  endTime: number;
  durationMs: number;
  fileSize?: number;
  recordType?: string;
}

export interface VideoRecordingList {
  tbDeviceId: string;
  cameraCode: string;
  startTime: number;
  endTime: number;
  total: number;
  recordings: VideoRecordingItem[];
}

export interface VideoRecordingPlayRequest {
  startTime: number;
  endTime: number;
  protocol?: 'hls';
}

export interface VideoRecordingPlaybackInfo {
  tbDeviceId: string;
  cameraCode: string;
  provider: string;
  sessionId: string;
  app: string;
  stream: string;
  protocol: string;
  url: string;
  online: boolean;
  startTime: number;
  endTime: number;
  expiresAt: number;
}

export type VideoRecordingControlAction = 'pause' | 'resume' | 'seek' | 'speed';

export interface VideoRecordingControlRequest {
  sessionId: string;
  action: VideoRecordingControlAction;
  positionSeconds?: number;
  speed?: number;
}

export interface VideoRecordingControlResult {
  tbDeviceId: string;
  cameraCode: string;
  sessionId: string;
  action: VideoRecordingControlAction;
  accepted: boolean;
  updatedAt: number;
}

export interface VideoRecordingStopResult {
  tbDeviceId: string;
  cameraCode: string;
  sessionId: string;
  stopped: boolean;
}

export function getVideoCameras() {
  return defHttp.get<VideoCameraInfo[]>({ url: '/api/video/cameras' }, { errorMessageMode: 'none' });
}

export function getVideoCameraDetails(tbDeviceId: string) {
  return defHttp.get<VideoCameraDetails>(
    { url: `/api/video/cameras/${encodeURIComponent(tbDeviceId)}` },
    { errorMessageMode: 'none' },
  );
}

export function getVideoCameraStatus(tbDeviceId: string) {
  return defHttp.get<VideoCameraStatus>(
    { url: `/api/video/cameras/${encodeURIComponent(tbDeviceId)}/status` },
    { errorMessageMode: 'none' },
  );
}

export function startVideoPlayback(
  tbDeviceId: string,
  request: VideoPlayRequest = { protocol: 'hls', streamProfile: 'main' },
) {
  return defHttp.postJson<VideoPlaybackInfo>(
    {
      url: `/api/video/cameras/${encodeURIComponent(tbDeviceId)}/play`,
      data: request,
    },
    { errorMessageMode: 'none' },
  );
}

export function stopVideoPlayback(tbDeviceId: string, request?: VideoStopRequest) {
  return defHttp.postJson<VideoStopResult>(
    {
      url: `/api/video/cameras/${encodeURIComponent(tbDeviceId)}/stop`,
      data: request,
    },
    { errorMessageMode: 'none' },
  );
}

export function controlVideoPtz(tbDeviceId: string, request: VideoPtzRequest) {
  return defHttp.postJson<VideoPtzResult>(
    {
      url: `/api/video/cameras/${encodeURIComponent(tbDeviceId)}/ptz`,
      data: request,
    },
    { errorMessageMode: 'none' },
  );
}

export function getVideoSnapshot(tbDeviceId: string) {
  return defHttp.get<Blob>(
    {
      url: `/api/video/cameras/${encodeURIComponent(tbDeviceId)}/snapshot`,
      responseType: 'blob',
    },
    { errorMessageMode: 'none' },
  );
}

export function getVideoRecordings(tbDeviceId: string, startTime: number, endTime: number) {
  return defHttp.get<VideoRecordingList>(
    {
      url: `/api/video/cameras/${encodeURIComponent(tbDeviceId)}/recordings`,
      params: { startTime, endTime },
    },
    { errorMessageMode: 'none' },
  );
}

export function startVideoRecordingPlayback(tbDeviceId: string, request: VideoRecordingPlayRequest) {
  return defHttp.postJson<VideoRecordingPlaybackInfo>(
    {
      url: `/api/video/cameras/${encodeURIComponent(tbDeviceId)}/recordings/play`,
      data: request,
    },
    { errorMessageMode: 'none' },
  );
}

export function controlVideoRecordingPlayback(tbDeviceId: string, request: VideoRecordingControlRequest) {
  return defHttp.postJson<VideoRecordingControlResult>(
    {
      url: `/api/video/cameras/${encodeURIComponent(tbDeviceId)}/recordings/control`,
      data: request,
    },
    { errorMessageMode: 'none' },
  );
}

export function stopVideoRecordingPlayback(tbDeviceId: string, sessionId: string) {
  return defHttp.postJson<VideoRecordingStopResult>(
    {
      url: `/api/video/cameras/${encodeURIComponent(tbDeviceId)}/recordings/stop`,
      data: { sessionId },
    },
    { errorMessageMode: 'none' },
  );
}

export function getVideoCameraBinding(tbDeviceId: string) {
  return defHttp.get<VideoCameraBinding>(
    { url: `/api/video/devices/${encodeURIComponent(tbDeviceId)}/binding` },
    { errorMessageMode: 'none' },
  );
}

export function saveVideoCameraBinding(tbDeviceId: string, request: VideoCameraBindingRequest) {
  return defHttp.put<VideoCameraBinding>(
    {
      url: `/api/video/devices/${encodeURIComponent(tbDeviceId)}/binding`,
      data: request,
      headers: { 'content-type': 'application/json' },
    },
    { errorMessageMode: 'none' },
  );
}

export function deleteVideoCameraBinding(tbDeviceId: string) {
  return defHttp.delete<void>(
    { url: `/api/video/devices/${encodeURIComponent(tbDeviceId)}/binding` },
    { errorMessageMode: 'none' },
  );
}
