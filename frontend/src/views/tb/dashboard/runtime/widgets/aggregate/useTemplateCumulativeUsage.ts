import { computed, onBeforeUnmount, ref, shallowRef, watch, type Ref } from 'vue';
import { fetchUsageSummary, type UsageSummary } from './resourceUsage';
import { CumulativeUsageAccumulator } from './cumulativeUsageAccumulator';
import { readCumulativeUsageCache, writeCumulativeUsageCache } from './cumulativeUsageCache';
import {
  type TelemetrySubscriptionHandle,
  type TemplateTelemetryHub,
  type TemplateTelemetryHubEvent,
} from './templateTelemetryHub';

export type CumulativeUsageDevice = {
  id: string;
  name: string;
};

export interface UseTemplateCumulativeUsageOptions {
  key: Ref<string>;
  devices: Ref<CumulativeUsageDevice[]>;
  hub: Ref<TemplateTelemetryHub | null>;
}

type PendingLatest = {
  device: CumulativeUsageDevice;
  event: Extract<TemplateTelemetryHubEvent, { type: 'value' }>;
};

const PROGRESS_THROTTLE_MS = 120;
const PERSIST_THROTTLE_MS = 1000;
const sessionsByHub = new WeakMap<TemplateTelemetryHub, Map<string, CumulativeUsageSession>>();
const standaloneSessions = new Map<string, CumulativeUsageSession>();
let nextSessionId = 0;

function normalizedDevices(devices: CumulativeUsageDevice[]) {
  return Array.from(
    new Map(
      devices
        .map((device) => ({ id: String(device.id || '').trim(), name: String(device.name || device.id || '').trim() }))
        .filter((device) => device.id)
        .map((device) => [device.id, device]),
    ).values(),
  ).sort((left, right) => left.id.localeCompare(right.id));
}

function sessionSignature(key: string, devices: CumulativeUsageDevice[]) {
  return key + '::' + devices.map((device) => device.id).join(',');
}

function registryFor(hub: TemplateTelemetryHub | null) {
  if (!hub) return standaloneSessions;
  let registry = sessionsByHub.get(hub);
  if (!registry) {
    registry = new Map<string, CumulativeUsageSession>();
    sessionsByHub.set(hub, registry);
  }
  return registry;
}

class CumulativeUsageSession {
  readonly summary = ref<UsageSummary | null>(null);
  readonly loading = ref(true);
  readonly error = ref('');
  readonly connected = ref(false);

  private readonly deviceMap: Map<string, CumulativeUsageDevice>;
  private readonly pendingLatest = new Map<string, PendingLatest>();
  private readonly consumerId = 'cumulative-usage:' + ++nextSessionId;
  private accumulator: CumulativeUsageAccumulator | null = null;
  private handle: TelemetrySubscriptionHandle | null = null;
  private boundaryTimer: number | undefined;
  private progressTimer: number | undefined;
  private persistTimer: number | undefined;
  private pendingProgress: UsageSummary | null = null;
  private reloadPromise: Promise<void> | null = null;
  private consumers = 0;
  private started = false;
  private destroyed = false;
  private disconnectedAfterLoad = false;

  constructor(
    private readonly hub: TemplateTelemetryHub | null,
    private readonly key: string,
    private readonly devices: CumulativeUsageDevice[],
    private readonly cacheKey: string,
    private readonly onEmpty: () => void,
  ) {
    this.deviceMap = new Map(devices.map((device) => [device.id, device]));
  }

  acquire() {
    this.consumers += 1;
    if (!this.started) this.start();
    return () => this.release();
  }

  private start() {
    this.started = true;
    this.scheduleBoundary();
    void this.hydrateAndReload();
  }

  private async hydrateAndReload() {
    try {
      const cached = await readCumulativeUsageCache(this.cacheKey);
      if (this.destroyed) return;
      if (cached) {
        const accumulator = new CumulativeUsageAccumulator(cached);
        const advanced = accumulator.advanceTo(Date.now());
        this.accumulator = accumulator;
        this.summary.value = accumulator.snapshot();
        this.loading.value = false;
        if (advanced) this.schedulePersist();
      }
      await this.reload(false);
    } finally {
      this.registerHub();
    }
  }

  private registerHub() {
    if (!this.hub || this.handle || this.destroyed) return;
    this.handle = this.hub.registerRequirement(
      {
        consumerId: this.consumerId,
        entityType: 'DEVICE',
        entityIds: this.devices.map((device) => device.id),
        keys: [this.key],
      },
      (event) => this.handleHubEvent(event),
    );
  }

  private release() {
    this.consumers = Math.max(0, this.consumers - 1);
    if (this.consumers) return;
    const snapshot = this.summary.value;
    this.destroyed = true;
    this.handle?.unregister();
    this.handle = null;
    if (this.boundaryTimer) window.clearTimeout(this.boundaryTimer);
    if (this.progressTimer) window.clearTimeout(this.progressTimer);
    if (this.persistTimer) window.clearTimeout(this.persistTimer);
    this.boundaryTimer = undefined;
    this.progressTimer = undefined;
    this.persistTimer = undefined;
    this.pendingProgress = null;
    this.pendingLatest.clear();
    if (snapshot) void writeCumulativeUsageCache(this.cacheKey, snapshot);
    this.onEmpty();
  }

  private handleHubEvent(event: TemplateTelemetryHubEvent) {
    if (this.destroyed) return;
    if (event.type === 'state') {
      const wasConnected = this.connected.value;
      this.connected.value = event.state.connected;
      if (!event.state.connected && this.summary.value) this.disconnectedAfterLoad = true;
      if (event.state.connected && !wasConnected && this.disconnectedAfterLoad) {
        this.disconnectedAfterLoad = false;
        void this.reload(true);
      }
      if (event.state.error && !this.summary.value) this.error.value = event.state.error;
      return;
    }

    const device = this.deviceMap.get(event.entityId);
    if (!device || event.key !== this.key) return;
    const pending = this.pendingLatest.get(event.entityId);
    if (!pending || pending.event.latest.ts <= event.latest.ts) {
      this.pendingLatest.set(event.entityId, { device, event });
    }
    if (this.accumulator?.applyLatest(device, this.key, event.latest)) {
      this.summary.value = this.accumulator.snapshot();
      this.schedulePersist();
    }
  }

  private async reload(force: boolean) {
    if (this.destroyed) return;
    if (this.reloadPromise) return this.reloadPromise;
    const showProgress = !this.summary.value;
    this.loading.value = showProgress;
    this.reloadPromise = fetchUsageSummary(this.devices, this.key, {
      force,
      onProgress: showProgress ? (summary) => this.queueProgress(summary) : undefined,
    })
      .then((summary) => {
        if (this.destroyed) return;
        this.clearProgress();
        const accumulator = new CumulativeUsageAccumulator(summary);
        Array.from(this.pendingLatest.values())
          .sort((left, right) => left.event.latest.ts - right.event.latest.ts)
          .forEach(({ device, event }) => accumulator.applyLatest(device, this.key, event.latest));
        this.pendingLatest.clear();
        this.accumulator = accumulator;
        this.summary.value = accumulator.snapshot();
        this.error.value = '';
        this.schedulePersist();
      })
      .catch((reason) => {
        if (!this.destroyed) this.error.value = reason instanceof Error ? reason.message : String(reason);
      })
      .finally(() => {
        if (!this.destroyed) this.loading.value = false;
        this.reloadPromise = null;
      });
    return this.reloadPromise;
  }

  private queueProgress(summary: UsageSummary) {
    if (this.destroyed) return;
    this.pendingProgress = summary;
    if (!this.summary.value) {
      this.flushProgress();
      return;
    }
    if (this.progressTimer) return;
    this.progressTimer = window.setTimeout(() => {
      this.progressTimer = undefined;
      this.flushProgress();
    }, PROGRESS_THROTTLE_MS);
  }

  private flushProgress() {
    if (this.destroyed || !this.pendingProgress) return;
    const accumulator = new CumulativeUsageAccumulator(this.pendingProgress);
    this.pendingProgress = null;
    this.accumulator = accumulator;
    this.summary.value = accumulator.snapshot();
  }

  private clearProgress() {
    if (this.progressTimer) window.clearTimeout(this.progressTimer);
    this.progressTimer = undefined;
    this.pendingProgress = null;
  }

  private schedulePersist() {
    if (this.destroyed || this.persistTimer || !this.summary.value) return;
    this.persistTimer = window.setTimeout(() => {
      this.persistTimer = undefined;
      const snapshot = this.summary.value;
      if (snapshot) void writeCumulativeUsageCache(this.cacheKey, snapshot);
    }, PERSIST_THROTTLE_MS);
  }

  private scheduleBoundary() {
    if (this.destroyed) return;
    const now = Date.now();
    const nextHour = new Date(now);
    nextHour.setMinutes(60, 0, 100);
    this.boundaryTimer = window.setTimeout(
      () => {
        this.boundaryTimer = undefined;
        if (this.accumulator?.advanceTo(Date.now())) {
          this.summary.value = this.accumulator.snapshot();
          this.schedulePersist();
        }
        this.scheduleBoundary();
      },
      Math.max(1000, nextHour.getTime() - now),
    );
  }
}

function acquireSession(hub: TemplateTelemetryHub | null, key: string, devices: CumulativeUsageDevice[]) {
  const registry = registryFor(hub);
  const signature = sessionSignature(key, devices);
  let session = registry.get(signature);
  if (!session) {
    session = new CumulativeUsageSession(hub, key, devices, signature, () => registry.delete(signature));
    registry.set(signature, session);
  }
  return { session, release: session.acquire() };
}

export function useTemplateCumulativeUsage(options: UseTemplateCumulativeUsageOptions) {
  const activeSession = shallowRef<CumulativeUsageSession | null>(null);
  const normalizedKey = computed(() => String(options.key.value || '').trim());
  const selectedDevices = computed(() => normalizedDevices(options.devices.value));
  const signature = computed(() => sessionSignature(normalizedKey.value, selectedDevices.value));
  let release: (() => void) | null = null;

  function bind() {
    release?.();
    release = null;
    activeSession.value = null;
    if (!normalizedKey.value || !selectedDevices.value.length) return;
    const acquired = acquireSession(options.hub.value, normalizedKey.value, selectedDevices.value);
    activeSession.value = acquired.session;
    release = acquired.release;
  }

  watch([signature, options.hub], bind, { immediate: true });
  onBeforeUnmount(() => {
    release?.();
    release = null;
    activeSession.value = null;
  });

  return {
    summary: computed(() => activeSession.value?.summary.value || null),
    loading: computed(() => activeSession.value?.loading.value || false),
    error: computed(() => activeSession.value?.error.value || ''),
    connected: computed(() => activeSession.value?.connected.value || false),
  };
}
