import { stopVideoRecordingPlayback } from '/@/api/tb/video';

export interface CameraRecordingSession {
  tbDeviceId: string;
  sessionId: string;
}

const releasedSessions = new Set<string>();
const releaseRequests = new Map<string, Promise<void>>();
const RELEASE_DEDUP_TTL_MS = 60_000;

export function isSameCameraRecordingSession(
  left?: CameraRecordingSession | null,
  right?: CameraRecordingSession | null,
) {
  return left?.tbDeviceId === right?.tbDeviceId && left?.sessionId === right?.sessionId;
}

export function releaseCameraRecordingSession(session?: CameraRecordingSession | null): Promise<void> {
  if (!session?.tbDeviceId || !session.sessionId) {
    return Promise.resolve();
  }

  const key = `${session.tbDeviceId}:${session.sessionId}`;
  if (releasedSessions.has(key)) {
    return Promise.resolve();
  }

  const pendingRequest = releaseRequests.get(key);
  if (pendingRequest) {
    return pendingRequest;
  }

  const request = stopVideoRecordingPlayback(session.tbDeviceId, session.sessionId)
    .then(() => {
      releasedSessions.add(key);
      globalThis.setTimeout(() => releasedSessions.delete(key), RELEASE_DEDUP_TTL_MS);
    })
    .catch((error) => {
      console.warn('[cameraRecordingSessionService] Failed to release recording playback session.', {
        tbDeviceId: session.tbDeviceId,
        sessionId: session.sessionId,
        error,
      });
    })
    .finally(() => {
      releaseRequests.delete(key);
    });
  releaseRequests.set(key, request);
  return request;
}
