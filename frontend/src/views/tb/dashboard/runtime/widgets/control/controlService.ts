import { defHttp } from '/@/utils/http/axios';
import type { ControlWidgetSettings } from './types';
import { mapUiValueToControlPayload } from './valueMapper';

export async function executeControl(settings: ControlWidgetSettings, value: any) {
  if (!settings.targetDeviceId) {
    throw new Error('缺少 targetDeviceId');
  }

  switch (settings.mode) {
    case 'rpc':
      return sendRpc(settings, value);
    case 'shared-attribute':
      return saveSharedAttribute(settings, value);
    case 'client-attribute':
      return saveClientAttribute(settings, value);
    default:
      throw new Error(`不支持的控制模式: ${settings.mode}`);
  }
}

async function sendRpc(settings: ControlWidgetSettings, value: any) {
  const callType = settings.rpcCallType ?? 'twoway';
  const params = mapUiValueToControlPayload(value, settings);

  if (!settings.rpcMethod) {
    throw new Error('rpc 模式缺少 rpcMethod');
  }

  return defHttp.post({
    url: `/api/plugins/rpc/${callType}/${settings.targetDeviceId}`,
    data: {
      method: settings.rpcMethod,
      params,
      timeout: settings.rpcTimeout ?? 10000,
    },
  });
}

async function saveSharedAttribute(settings: ControlWidgetSettings, value: any) {
  if (!settings.stateKey) {
    throw new Error('shared-attribute 模式缺少 stateKey');
  }

  const payloadValue = mapUiValueToControlPayload(value, settings);

  return defHttp.post({
    url: `/api/plugins/telemetry/DEVICE/${settings.targetDeviceId}/SHARED_SCOPE`,
    data: {
      [settings.stateKey]: payloadValue,
    },
  });
}

async function saveClientAttribute(settings: ControlWidgetSettings, value: any) {
  if (!settings.stateKey) {
    throw new Error('client-attribute 模式缺少 stateKey');
  }

  const payloadValue = mapUiValueToControlPayload(value, settings);

  return defHttp.post({
    url: `/api/plugins/telemetry/DEVICE/${settings.targetDeviceId}/CLIENT_SCOPE`,
    data: {
      [settings.stateKey]: payloadValue,
    },
  });
}
