import { onBeforeUnmount, shallowRef, watch, type Ref } from 'vue';
import { getAttributesByScope, getLatestTimeseries, getTimeseries } from '/@/api/tb/telemetry';
import { EntityType } from '/@/enums/entityTypeEnum';
import { Scope } from '/@/enums/telemetryEnum';
import {
  createNativeDataClient,
  createNativePoller,
  type NativeDataConfig,
  type NativeSnapshot,
} from './nativeWidgetDataCore';

const client = createNativeDataClient({
  latest: (source, keys) =>
    getLatestTimeseries({ entityType: source.entityType as EntityType, id: source.entityId }, keys),
  attributes: (source, scope, keys) =>
    getAttributesByScope({ entityType: source.entityType as EntityType, id: source.entityId }, scope as Scope, {
      keys,
    }),
  history: (query) => getTimeseries({ ...query, entityType: query.entityType as EntityType }),
});

export function useNativeWidgetData(config: Ref<NativeDataConfig | null>) {
  const data = shallowRef<NativeSnapshot>({ series: [], updatedAt: 0, loading: false, errors: [] });
  const poller = createNativePoller(client.load, (snapshot) => {
    data.value = snapshot;
  });
  watch(
    () => JSON.stringify(config.value),
    () => {
      if (config.value) poller.update(config.value);
      else {
        poller.pause();
        data.value = { series: [], updatedAt: 0, loading: false, errors: ['部件配置不完整'] };
      }
    },
    { immediate: true },
  );
  onBeforeUnmount(() => poller.stop());
  return data;
}
