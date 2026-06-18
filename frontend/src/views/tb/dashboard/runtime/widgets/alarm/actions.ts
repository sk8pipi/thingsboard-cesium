import { ackAlarm, clearAlarm } from './api';
import type { AlarmActionContext, AlarmItem } from './types';

export async function handleAckAlarm(item: AlarmItem, _ctx?: AlarmActionContext) {
  if (!item?.id) return;
  await ackAlarm(item.id);
}

export async function handleClearAlarm(item: AlarmItem, _ctx?: AlarmActionContext) {
  if (!item?.id) return;
  await clearAlarm(item.id);
}

export function handleOpenAlarmDetail(item: AlarmItem, ctx?: AlarmActionContext) {
  const widgetCtx = ctx?.ctx;
  if (widgetCtx?.emit) {
    widgetCtx.emit('alarm-detail', item);
    return;
  }

  // 预留扩展：你后面可以改成打开你的详情弹窗或侧边栏
  // 这里先不做任何强依赖动作
  console.log('[alarm-detail]', item);
}
