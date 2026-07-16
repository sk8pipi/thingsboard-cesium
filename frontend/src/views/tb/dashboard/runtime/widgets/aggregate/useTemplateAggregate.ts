import { computed, onBeforeUnmount, ref, watch, type Ref } from 'vue';
import type { AggregateMetricWidgetConfig, AggregateResult } from './aggregateMetricTypes';
import { IncrementalAggregation } from './incrementalAggregation';
import { resolveTemplateDevices, type TemplatePointLike, type TemplateRuntimeDevices } from './templateDeviceResolver';
import {
  type TelemetrySubscriptionHandle,
  type TemplateTelemetryHub,
  type TemplateTelemetryHubState,
} from './templateTelemetryHub';

const EMPTY_RESULT: AggregateResult = {
  value: null,
  validEntityCount: 0,
  totalEntityCount: 0,
  missingEntityCount: 0,
  latestTimestamp: null,
};

export interface UseTemplateAggregateOptions {
  consumerId: string;
  config: Ref<AggregateMetricWidgetConfig>;
  runtimeDevices: Ref<TemplateRuntimeDevices>;
  templatePoints: Ref<TemplatePointLike[]>;
  hub: Ref<TemplateTelemetryHub | null>;
}

export function useTemplateAggregate(options: UseTemplateAggregateOptions) {
  const aggregateResult = ref<AggregateResult>({ ...EMPTY_RESULT });
  const loading = ref(false);
  const error = ref<string | null>(null);
  const connected = ref(false);
  const usingFallback = ref(false);
  const stale = ref(false);
  let aggregation: IncrementalAggregation | null = null;
  let subscription: TelemetrySubscriptionHandle | null = null;
  let renderTimer: number | undefined;
  let staleTimer: number | undefined;

  const deviceBindings = computed(() => {
    const config = options.config.value;
    if (config.aggregationSource === 'PRECOMPUTED_ENTITY') return [];
    return resolveTemplateDevices({
      runtimeDevices: options.runtimeDevices.value,
      templatePoints: options.templatePoints.value,
      selector: config.dataSource.selector,
      telemetryKey: config.dataSource.telemetryKey,
    });
  });
  const subscriptionSignature = computed(() => {
    const config = options.config.value;
    const source = config.precomputedEntity;
    return JSON.stringify({
      source: config.aggregationSource,
      entityType: source?.entityType || config.dataSource.entityType,
      entityId: source?.entityId || '',
      key: source?.telemetryKey || config.dataSource.telemetryKey,
      aggregation: config.aggregation,
      devices: deviceBindings.value.map((device) => device.deviceId),
    });
  });

  const formattedValue = computed(() => {
    const value = aggregateResult.value.value;
    if (value === null || !Number.isFinite(value)) return '-';
    const display = options.config.value.display;
    const formatted = new Intl.NumberFormat('zh-CN', {
      minimumFractionDigits: 0,
      maximumFractionDigits: display.decimals ?? 2,
    }).format(value);
    return `${display.prefix || ''}${formatted}${display.suffix || ''}`;
  });

  function currentTarget() {
    const config = options.config.value;
    if (config.aggregationSource === 'PRECOMPUTED_ENTITY') {
      const source = config.precomputedEntity;
      return {
        entityType: source?.entityType || 'DEVICE',
        entityIds: source?.entityId ? [source.entityId] : [],
        key: source?.telemetryKey || config.dataSource.telemetryKey,
      };
    }
    return {
      entityType: config.dataSource.entityType,
      entityIds: deviceBindings.value.map((device) => device.deviceId),
      key: config.dataSource.telemetryKey,
    };
  }

  function bind() {
    subscription?.unregister();
    subscription = null;
    clearRenderTimer();
    clearStaleTimer();
    aggregation = null;
    aggregateResult.value = { ...EMPTY_RESULT };
    stale.value = false;

    const hub = options.hub.value;
    const config = options.config.value;
    const target = currentTarget();
    if (!target.entityIds.length) {
      loading.value = false;
      error.value = null;
      return;
    }
    if (!hub) {
      loading.value = false;
      error.value = 'Shared template telemetry runtime is unavailable';
      return;
    }

    aggregation = new IncrementalAggregation(config.aggregation.function, config.aggregation.missingValueStrategy);
    aggregation.replaceEntities(target.entityIds, (entityId) => hub.getLatest(entityId, target.key));
    flushResult();
    loading.value = true;
    error.value = null;
    subscription = hub.registerRequirement(
      {
        consumerId: options.consumerId,
        entityType: target.entityType,
        entityIds: target.entityIds,
        keys: [target.key],
      },
      (event) => {
        if (event.type === 'state') {
          applyHubState(event.state);
          return;
        }
        if (event.key !== target.key || !aggregation?.apply(event.entityId, event.latest)) return;
        scheduleResult();
      },
    );
  }

  function applyHubState(state: TemplateTelemetryHubState) {
    connected.value = state.connected;
    loading.value = state.loading && aggregateResult.value.latestTimestamp === null;
    error.value = state.error;
    usingFallback.value = state.usingFallback;
  }

  function scheduleResult() {
    const delay = Math.max(0, Number(options.config.value.refresh.renderThrottleMs || 0));
    if (!delay) {
      flushResult();
      return;
    }
    if (renderTimer) return;
    renderTimer = window.setTimeout(() => {
      renderTimer = undefined;
      flushResult();
    }, delay);
  }

  function flushResult() {
    if (!aggregation) return;
    aggregateResult.value = aggregation.result();
    loading.value = false;
    scheduleStaleState();
  }

  function scheduleStaleState() {
    clearStaleTimer();
    const latestTimestamp = aggregateResult.value.latestTimestamp;
    const staleAfterMs = Math.max(0, Number(options.config.value.refresh.staleAfterMs || 0));
    if (!latestTimestamp || !staleAfterMs) {
      stale.value = false;
      return;
    }
    const delay = latestTimestamp + staleAfterMs - Date.now();
    if (delay <= 0) {
      stale.value = true;
      return;
    }
    stale.value = false;
    staleTimer = window.setTimeout(() => {
      staleTimer = undefined;
      stale.value = true;
    }, delay);
  }

  function clearRenderTimer() {
    if (renderTimer) window.clearTimeout(renderTimer);
    renderTimer = undefined;
  }

  function clearStaleTimer() {
    if (staleTimer) window.clearTimeout(staleTimer);
    staleTimer = undefined;
  }

  watch([subscriptionSignature, options.hub], bind, { immediate: true });
  onBeforeUnmount(() => {
    subscription?.unregister();
    subscription = null;
    clearRenderTimer();
    clearStaleTimer();
  });

  return {
    value: computed(() => aggregateResult.value.value),
    formattedValue,
    loading,
    error,
    connected,
    usingFallback,
    stale,
    validEntityCount: computed(() => aggregateResult.value.validEntityCount),
    totalEntityCount: computed(() => aggregateResult.value.totalEntityCount),
    missingEntityCount: computed(() => aggregateResult.value.missingEntityCount),
    latestTimestamp: computed(() => aggregateResult.value.latestTimestamp),
  };
}
