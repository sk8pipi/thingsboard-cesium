import { computed, onBeforeUnmount, onMounted, ref, watch, type Ref } from 'vue';
import { EntityType } from '/@/enums/entityTypeEnum';
import { CumulativeUsageAccumulator } from './cumulativeUsageAccumulator';
import { readCumulativeUsageCache, writeCumulativeUsageCache } from './cumulativeUsageCache';
import { fetchUsageReadingsSince, fetchUsageSummary, type UsageSummary } from './resourceUsage';

type UsageEntity = {
  id: string;
  name: string;
};

export interface UsePersistentUsageSummaryOptions {
  key: Ref<string>;
  entities: Ref<UsageEntity[]>;
  entityType: Ref<EntityType>;
  pollMs: Ref<number>;
}

const PERSIST_DELAY_MS = 500;

function normalizeEntities(entities: UsageEntity[]) {
  return Array.from(
    new Map(
      entities
        .map((entity) => ({
          id: String(entity.id || '').trim(),
          name: String(entity.name || entity.id || '').trim(),
        }))
        .filter((entity) => entity.id)
        .map((entity) => [entity.id, entity]),
    ).values(),
  ).sort((left, right) => left.id.localeCompare(right.id));
}

function timezoneSignature() {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || `utc-offset-${new Date().getTimezoneOffset()}`;
  } catch {
    return `utc-offset-${new Date().getTimezoneOffset()}`;
  }
}

function buildCacheKey(entityType: EntityType, key: string, entities: UsageEntity[]) {
  return [
    'persistent-cumulative-usage-v1',
    timezoneSignature(),
    entityType,
    key,
    entities.map((entity) => entity.id).join(','),
  ].join('::');
}

function incrementalStart(summary: UsageSummary) {
  if (!summary.latestDeviceReadings.length) return null;
  return Math.min(...summary.latestDeviceReadings.map((reading) => reading.ts));
}

export function usePersistentUsageSummary(options: UsePersistentUsageSummaryOptions) {
  const summary = ref<UsageSummary | null>(null);
  const loading = ref(false);
  const error = ref('');
  const normalizedKey = computed(() => String(options.key.value || '').trim());
  const selectedEntities = computed(() => normalizeEntities(options.entities.value));
  const signature = computed(() =>
    buildCacheKey(options.entityType.value, normalizedKey.value, selectedEntities.value),
  );

  let accumulator: CumulativeUsageAccumulator | null = null;
  let timer: number | undefined;
  let persistTimer: number | undefined;
  let requestGeneration = 0;
  let running = false;
  let rerun = false;
  let stopped = false;

  function schedulePersist(cacheKey: string) {
    if (persistTimer) window.clearTimeout(persistTimer);
    persistTimer = window.setTimeout(() => {
      persistTimer = undefined;
      const snapshot = summary.value;
      if (snapshot && cacheKey === signature.value) void writeCumulativeUsageCache(cacheKey, snapshot);
    }, PERSIST_DELAY_MS);
  }

  async function refresh(generation = requestGeneration) {
    if (stopped || generation !== requestGeneration) return;
    if (running) {
      rerun = true;
      return;
    }

    const key = normalizedKey.value;
    const entities = selectedEntities.value.slice();
    const entityType = options.entityType.value;
    const cacheKey = signature.value;
    if (!key || !entities.length) return;

    running = true;
    try {
      do {
        rerun = false;
        loading.value = !summary.value;
        try {
          const startTs = summary.value ? incrementalStart(summary.value) : null;
          if (accumulator && startTs !== null) {
            const readings = await fetchUsageReadingsSince(entities, key, startTs, Date.now(), entityType);
            if (stopped || generation !== requestGeneration) return;
            readings.forEach((reading) => {
              const entity = entities.find((item) => item.id === reading.deviceId);
              if (entity) accumulator?.applyLatest(entity, key, reading);
            });
            accumulator.advanceTo(Date.now());
            summary.value = accumulator.snapshot();
          } else {
            const initialSummary = await fetchUsageSummary(entities, key, {}, entityType);
            if (stopped || generation !== requestGeneration) return;
            accumulator = new CumulativeUsageAccumulator(initialSummary);
            summary.value = accumulator.snapshot();
          }
          error.value = '';
          schedulePersist(cacheKey);
        } catch (reason: any) {
          if (stopped || generation !== requestGeneration) return;
          error.value = reason?.message || String(reason);
        } finally {
          if (!stopped && generation === requestGeneration) loading.value = false;
        }
      } while (rerun && !stopped && generation === requestGeneration);
    } finally {
      running = false;
    }
  }

  async function bind() {
    const generation = ++requestGeneration;
    accumulator = null;
    summary.value = null;
    error.value = '';

    const key = normalizedKey.value;
    const entities = selectedEntities.value;
    if (!key || !entities.length) {
      loading.value = false;
      return;
    }

    loading.value = true;
    const cacheKey = signature.value;
    const cached = await readCumulativeUsageCache(cacheKey);
    if (stopped || generation !== requestGeneration) return;
    if (cached) {
      accumulator = new CumulativeUsageAccumulator(cached);
      accumulator.advanceTo(Date.now());
      summary.value = accumulator.snapshot();
      loading.value = false;
    }
    await refresh(generation);
  }

  watch(signature, () => void bind(), { immediate: true });
  onMounted(() => {
    timer = window.setInterval(() => void refresh(), Math.max(15000, Number(options.pollMs.value || 60000)));
  });
  onBeforeUnmount(() => {
    stopped = true;
    requestGeneration += 1;
    if (timer) window.clearInterval(timer);
    if (persistTimer) window.clearTimeout(persistTimer);
    const snapshot = summary.value;
    if (snapshot) void writeCumulativeUsageCache(signature.value, snapshot);
  });

  return { summary, loading, error, refresh };
}
