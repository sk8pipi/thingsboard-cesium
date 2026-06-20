import { defHttp } from '/@/utils/http/axios';
import { getToken } from '/@/utils/auth';
import type { MapTemplateState } from '../mapTemplateConfig';

export type MapTemplateRuntimeDevices = Record<string, Record<string, unknown>>;

export interface MapTemplateRuntimeResponse {
  dashboardId: string;
  version: number;
  updatedTime: number;
  template?: Partial<MapTemplateState> | null;
  devices?: MapTemplateRuntimeDevices;
}

export interface MapTemplateRuntimeEvent extends MapTemplateRuntimeResponse {
  type: 'snapshot' | 'templateUpdated' | 'runtimeUpdated';
}

export function getAssignedMapTemplateRuntime(dashboardId: string) {
  return defHttp.get<MapTemplateRuntimeResponse>({
    url: `/api/map-template/${dashboardId}/runtime`,
  });
}

export function subscribeAssignedMapTemplateRuntimeEvents(
  dashboardId: string,
  onUpdate: (event: MapTemplateRuntimeEvent) => void,
) {
  const normalizedDashboardId = String(dashboardId || '').trim();
  const controller = new AbortController();
  let stopped = false;
  let retryTimer: number | undefined;

  const clearRetry = () => {
    if (retryTimer) {
      window.clearTimeout(retryTimer);
      retryTimer = undefined;
    }
  };

  const scheduleReconnect = () => {
    if (stopped) return;
    clearRetry();
    retryTimer = window.setTimeout(connect, 5000);
  };

  const shouldRetry = (status: number) => ![401, 403, 404, 406].includes(status);

  const dispatchEvent = (rawEvent: string) => {
    const lines = rawEvent.split(/\r?\n/);
    let eventName = 'message';
    const dataLines: string[] = [];

    lines.forEach((line) => {
      if (line.startsWith('event:')) {
        eventName = line.slice(6).trim();
      } else if (line.startsWith('data:')) {
        dataLines.push(line.slice(5).trim());
      }
    });

    if (eventName !== 'mapTemplateRuntime' || !dataLines.length) {
      return;
    }

    try {
      onUpdate(JSON.parse(dataLines.join('\n')) as MapTemplateRuntimeEvent);
    } catch (error) {
      console.warn('[mapTemplateRuntimeService] Failed to parse map template runtime event:', error);
    }
  };

  const readStream = async (response: Response) => {
    const reader = response.body?.getReader();
    if (!reader) return;

    const decoder = new TextDecoder();
    let buffer = '';

    while (!stopped) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      let separatorIndex = buffer.search(/\r?\n\r?\n/);
      while (separatorIndex >= 0) {
        const rawEvent = buffer.slice(0, separatorIndex);
        buffer = buffer.slice(separatorIndex + (buffer[separatorIndex] === '\r' ? 4 : 2));
        dispatchEvent(rawEvent);
        separatorIndex = buffer.search(/\r?\n\r?\n/);
      }
    }
  };

  async function connect() {
    if (stopped || !normalizedDashboardId) return;

    try {
      const token = getToken();
      const response = await fetch(`/api/map-template/${normalizedDashboardId}/runtime/events`, {
        method: 'GET',
        headers: token
          ? {
              'X-Authorization': String(token).startsWith('Bearer ') ? String(token) : `Bearer ${token}`,
              Accept: 'text/event-stream, application/json, */*',
            }
          : {
              Accept: 'text/event-stream, application/json, */*',
            },
        signal: controller.signal,
      });

      if (!response.ok) {
        if (!shouldRetry(response.status)) {
          stopped = true;
        }
        throw new Error(`Map template runtime stream failed with status ${response.status}`);
      }

      await readStream(response);
      scheduleReconnect();
    } catch (error: any) {
      if (stopped || error?.name === 'AbortError') return;
      console.warn('[mapTemplateRuntimeService] Map template runtime stream disconnected:', error);
      scheduleReconnect();
    }
  }

  void connect();

  return () => {
    stopped = true;
    clearRetry();
    controller.abort();
  };
}
