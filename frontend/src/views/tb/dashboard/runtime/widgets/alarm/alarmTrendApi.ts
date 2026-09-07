import { defHttp } from '/@/utils/http/axios';
import { parseAlarmTrendResponse, type AlarmTrendMode, type AlarmTrendResponse } from './alarmTrend';

export async function fetchAlarmTrend(mode: AlarmTrendMode): Promise<AlarmTrendResponse> {
  const result = await defHttp.get<unknown>({
    url: '/api/alarm/statistics/trend',
    params: { mode },
  });
  return parseAlarmTrendResponse(result, mode);
}
