import {
  rpcSendOneway,
  rpcSendServerSideOneway,
  rpcSendServerSideTwoway,
  rpcSendTwoway,
  type ServerSideRpcRequest,
} from '/@/api/tb/rpc';

export interface SendCameraRpcOptions {
  entityId: string;
  method: string;
  params?: Record<string, any>;
  oneWay?: boolean;
  timeout?: number;
  fallbackToLegacyApi?: boolean;
}

const CAMERA_RPC_DEFAULT_PARAMS: Record<string, Record<string, any>> = {
  'ptz.up': { method: 'ptz.up', speed: 30 },
  'ptz.down': { method: 'ptz.down', speed: 30 },
  'ptz.left': { method: 'ptz.left', speed: 30 },
  'ptz.right': { method: 'ptz.right', speed: 30 },
  'zoom.in': { method: 'zoom.in', speed: 1 },
  'zoom.out': { method: 'zoom.out', speed: 1 },
  'preset.call': { method: 'preset.call', presetId: 1 },
  'preset.save': { method: 'preset.save', presetId: 1 },
};

export function getDefaultCameraRpcParams(method: string) {
  const defaults = CAMERA_RPC_DEFAULT_PARAMS[method];
  return defaults ? { ...defaults } : {};
}

export async function sendCameraRpc(options: SendCameraRpcOptions) {
  const entityId = String(options.entityId || '').trim();
  const method = String(options.method || '').trim();

  if (!entityId) {
    throw new Error('Camera RPC requires an entityId.');
  }

  if (!method) {
    throw new Error('Camera RPC requires a method.');
  }

  const rawParams = options.params ?? getDefaultCameraRpcParams(method);
  const payloadParams =
    rawParams && typeof rawParams === 'object' && !Array.isArray(rawParams)
      ? { ...rawParams }
      : rawParams;

  if (payloadParams && typeof payloadParams === 'object' && !Array.isArray(payloadParams) && !('method' in payloadParams)) {
    payloadParams.method = method;
  }

  const payload: ServerSideRpcRequest = {
    method,
    params: payloadParams as any,
  };

  if (options.oneWay !== false) {
    try {
      return await rpcSendServerSideOneway(entityId, payload);
    } catch (error) {
      if (!options.fallbackToLegacyApi || !shouldFallbackToLegacyRpc(error)) {
        throw normalizeRpcError(error);
      }
      return rpcSendOneway(entityId, {
        method,
        params: payload.params as any,
        timeout: options.timeout ?? 10000,
      } as any).catch((legacyError) => {
        throw normalizeRpcError(legacyError);
      });
    }
  }

  payload.timeout = options.timeout ?? 10000;
  try {
    return await rpcSendServerSideTwoway(entityId, payload);
  } catch (error) {
    if (!options.fallbackToLegacyApi || !shouldFallbackToLegacyRpc(error)) {
      throw normalizeRpcError(error);
    }
    return rpcSendTwoway(entityId, {
      method,
      params: payload.params as any,
      timeout: payload.timeout,
    } as any).catch((legacyError) => {
      throw normalizeRpcError(legacyError);
    });
  }
}

function getErrorStatus(error: any) {
  return Number(error?.response?.status || error?.status || error?.code || 0);
}

function shouldFallbackToLegacyRpc(error: unknown) {
  return [408, 409].includes(getErrorStatus(error));
}

function normalizeRpcError(error: any) {
  const status = getErrorStatus(error);
  const serverMessage = error?.response?.data?.message || error?.response?.data?.error || error?.message;

  if (status === 409) {
    return new Error(
      `RPC 发送冲突：设备当前没有可用的 ThingsBoard 连接，或 RPC 目标设备配置不正确。请确认摄像头是否需要通过网关设备接收控制命令。${serverMessage ? `（${serverMessage}）` : ''}`,
    );
  }

  if (status === 408) {
    return new Error(
      `RPC 请求超时：设备或网关没有在超时时间内处理控制命令。请确认设备在线、网关连接正常，或调大 rpcTimeout。${serverMessage ? `（${serverMessage}）` : ''}`,
    );
  }

  return error instanceof Error ? error : new Error(serverMessage || '摄像头 RPC 发送失败');
}
