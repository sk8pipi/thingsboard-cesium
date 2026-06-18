import axios from 'axios';
import { runParseFunction, runTransformFunction } from './controlFunctions';

export interface ControlGetValueSettings {
  enabled?: boolean;
  source?: 'latestTelemetry' | 'sharedAttribute' | 'clientAttribute' | 'serverAttribute' | 'rpc';
  key?: string;
  rpcMethod?: string;
  rpcTimeout?: number;
  rpcCallType?: 'oneway' | 'twoway';
  parseFunction?: string;
}

export interface ControlSetValueSettings {
  enabled?: boolean;
  mode?: 'rpc' | 'sharedAttribute' | 'clientAttribute';
  key?: string;
  rpcMethod?: string;
  rpcTimeout?: number;
  rpcCallType?: 'oneway' | 'twoway';
  transformFunction?: string;
}

export interface ControlSwitchSettings {
  title?: string;
  targetDeviceId?: string;
  getValue?: ControlGetValueSettings;
  setValue?: ControlSetValueSettings;
  valueSettings?: {
    onLabel?: string;
    offLabel?: string;
    optimistic?: boolean;
    disabledWhenOffline?: boolean;
  };
}

function getTbAuthHeaders() {
  const directToken =
    localStorage.getItem('jwt_token') ||
    localStorage.getItem('accessToken') ||
    localStorage.getItem('token');

  if (directToken) {
    return {
      'Content-Type': 'application/json',
      'X-Authorization': directToken.startsWith('Bearer ')
        ? directToken
        : `Bearer ${directToken}`,
    };
  }

  try {
    const userInfoRaw =
      localStorage.getItem('USER_INFO') ||
      localStorage.getItem('userInfo') ||
      localStorage.getItem('auth') ||
      localStorage.getItem('AUTH');

    if (userInfoRaw) {
      const parsed = JSON.parse(userInfoRaw);
      const nestedToken =
        parsed?.token ||
        parsed?.accessToken ||
        parsed?.jwt_token ||
        parsed?.userInfo?.token ||
        parsed?.userInfo?.accessToken;

      if (nestedToken) {
        return {
          'Content-Type': 'application/json',
          'X-Authorization': nestedToken.startsWith('Bearer ')
            ? nestedToken
            : `Bearer ${nestedToken}`,
        };
      }
    }
  } catch (err) {
    console.warn('[controlExecutor] parse localStorage token failed', err);
  }

  return {
    'Content-Type': 'application/json',
  };
}

function buildRpcBody(method: string, params: any, timeout?: number, callType?: 'oneway' | 'twoway') {
  const body: Record<string, any> = {
    method,
    params,
  };

  if ((callType || 'twoway') === 'twoway' && timeout !== undefined) {
    body.timeout = timeout;
  }

  return body;
}

export async function executeGetValue(
  deviceId: string,
  settings: ControlSwitchSettings,
  latestValues?: Record<string, any>,
): Promise<boolean> {
  const getValue = settings.getValue || {};
  const source = getValue.source || 'latestTelemetry';

  if (source === 'latestTelemetry') {
    const raw = latestValues?.[getValue.key || 'value'];
    return runParseFunction(getValue.parseFunction, raw);
  }

  if (source === 'rpc') {
    const rpcCallType = getValue.rpcCallType || 'twoway';
    const rpcMethod = getValue.rpcMethod || 'getValue';
    const rpcTimeout = getValue.rpcTimeout ?? 5000;

    const body = buildRpcBody(rpcMethod, null, rpcTimeout, rpcCallType);
    const headers = getTbAuthHeaders();

    const res = await axios.post(`/api/plugins/rpc/${rpcCallType}/${deviceId}`, body, {
      headers,
    });

    return runParseFunction(getValue.parseFunction, res.data);
  }

  if (source === 'sharedAttribute' || source === 'clientAttribute' || source === 'serverAttribute') {
    const raw = latestValues?.[getValue.key || 'value'];
    return runParseFunction(getValue.parseFunction, raw);
  }

  return false;
}

export async function executeSetValue(
  deviceId: string,
  settings: ControlSwitchSettings,
  value: boolean,
): Promise<any> {
  const setValue = settings.setValue || {};
  const mode = setValue.mode || 'rpc';
  const payloadValue = runTransformFunction(setValue.transformFunction, value);

  if (mode === 'rpc') {
    const rpcCallType = setValue.rpcCallType || 'twoway';
    const rpcMethod = setValue.rpcMethod || 'setValue';
    const rpcTimeout = setValue.rpcTimeout ?? 5000;

    const body = buildRpcBody(rpcMethod, payloadValue, rpcTimeout, rpcCallType);
    const headers = getTbAuthHeaders();

    const res = await axios.post(`/api/plugins/rpc/${rpcCallType}/${deviceId}`, body, {
      headers,
    });

    return res.data;
  }

  if (mode === 'sharedAttribute') {
    const key = setValue.key || 'value';
    const body = {
      [key]: payloadValue,
    };
    const headers = getTbAuthHeaders();

    const res = await axios.post(`/api/plugins/telemetry/DEVICE/${deviceId}/SHARED_SCOPE`, body, {
      headers,
    });

    return res.data;
  }

  if (mode === 'clientAttribute') {
    const key = setValue.key || 'value';
    const body = {
      [key]: payloadValue,
    };
    const headers = getTbAuthHeaders();

    const res = await axios.post(`/api/plugins/telemetry/DEVICE/${deviceId}/CLIENT_SCOPE`, body, {
      headers,
    });

    return res.data;
  }

  throw new Error(`不支持的 setValue.mode: ${mode}`);
}