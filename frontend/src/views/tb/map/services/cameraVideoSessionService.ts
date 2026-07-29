import { stopVideoPlayback } from '/@/api/tb/video';
import type { CameraRuntimeInfo } from '../types/mapPointTypes';

export interface CameraVideoSession {
  tbDeviceId: string;
  sessionId: string;
}

const releasedSessions = new Set<string>();
const releaseRequests = new Map<string, Promise<void>>();
const RELEASE_DEDUP_TTL_MS = 60_000;

export function resolveCameraVideoSession(runtimeInfo?: CameraRuntimeInfo | null): CameraVideoSession | null {
  const tbDeviceId = String(runtimeInfo?.entityId || '').trim();
  const sessionId = String(runtimeInfo?.playbackSessionId || '').trim();
  if (!tbDeviceId || !sessionId) {
    return null;
  }
  return { tbDeviceId, sessionId };
}

export function isSameCameraVideoSession(left?: CameraVideoSession | null, right?: CameraVideoSession | null) {
  return left?.tbDeviceId === right?.tbDeviceId && left?.sessionId === right?.sessionId;
}

export function releaseCameraVideoSession(
  sessionOrRuntime?: CameraVideoSession | CameraRuntimeInfo | null,
): Promise<void> {
  const session =
    sessionOrRuntime && 'sessionId' in sessionOrRuntime
      ? sessionOrRuntime
      : resolveCameraVideoSession(sessionOrRuntime as CameraRuntimeInfo | null);
  if (!session) {
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

  const request = stopVideoPlayback(session.tbDeviceId, { sessionId: session.sessionId })
    .then(() => {
      releasedSessions.add(key);
      globalThis.setTimeout(() => releasedSessions.delete(key), RELEASE_DEDUP_TTL_MS);
    })
    .catch((error) => {
      console.warn('[cameraVideoSessionService] Failed to release playback session; backend TTL will clean it up.', {
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
