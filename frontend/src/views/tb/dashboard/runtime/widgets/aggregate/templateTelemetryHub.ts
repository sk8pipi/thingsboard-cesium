import type { LatestTelemetryValue } from './aggregateMetricTypes';

export interface TelemetryRequirement {
  consumerId: string;
  entityType: 'DEVICE' | 'ASSET';
  entityIds: string[];
  keys: string[];
}

export interface EntityDataLatestSubscriptionOptions {
  entityType: string;
  entityIds: string[];
  keys: string[];
  onData: (message: unknown) => void;
}

export interface TemplateTelemetryClient {
  subscribeEntityDataLatest(options: EntityDataLatestSubscriptionOptions): number;
  unsubscribe(cmdId: number): void;
  onConnectionState(callback: (connected: boolean) => void): () => void;
}

export type FallbackTelemetryValue = LatestTelemetryValue & {
  entityId: string;
  key: string;
};

export interface TemplateTelemetryHubState {
  connected: boolean;
  loading: boolean;
  error: string | null;
  usingFallback: boolean;
}

export type TemplateTelemetryHubEvent =
  | {
      type: 'value';
      entityId: string;
      key: string;
      latest: LatestTelemetryValue;
    }
  | {
      type: 'state';
      state: TemplateTelemetryHubState;
    };

export interface TelemetrySubscriptionHandle {
  unregister(): void;
}

type RequirementRecord = {
  requirement: TelemetryRequirement;
  listener: (event: TemplateTelemetryHubEvent) => void;
};

export interface TemplateTelemetryHubOptions {
  maxEntitiesPerSubscription?: number;
  planDebounceMs?: number;
  initialFallbackDelayMs?: number;
  fallbackPollMs?: number;
  loadLatestFallback?: (
    entityType: 'DEVICE' | 'ASSET',
    entityIds: string[],
    keys: string[],
  ) => Promise<FallbackTelemetryValue[]>;
}

const DEFAULT_OPTIONS = {
  maxEntitiesPerSubscription: 50,
  planDebounceMs: 50,
  initialFallbackDelayMs: 5000,
  fallbackPollMs: 60000,
};

function normalizedList(values: string[]) {
  return Array.from(new Set(values.map((value) => String(value || '').trim()).filter(Boolean))).sort();
}

function chunk<T>(values: T[], size: number) {
  const result: T[][] = [];
  for (let index = 0; index < values.length; index += size) result.push(values.slice(index, index + size));
  return result;
}

function entityIdFromData(value: Record<string, unknown>) {
  const entityId = value.entityId;
  if (typeof entityId === 'string') return entityId;
  if (entityId && typeof entityId === 'object') {
    return String((entityId as Record<string, unknown>).id || '').trim();
  }
  return '';
}

function telemetryEntries(value: Record<string, unknown>) {
  const latest = value.latest && typeof value.latest === 'object' ? (value.latest as Record<string, unknown>) : {};
  const timeseries =
    latest.TIME_SERIES && typeof latest.TIME_SERIES === 'object'
      ? (latest.TIME_SERIES as Record<string, unknown>)
      : latest.TIMESERIES && typeof latest.TIMESERIES === 'object'
        ? (latest.TIMESERIES as Record<string, unknown>)
        : {};
  return Object.entries(timeseries).flatMap(([key, rawValue]) => {
    if (!rawValue || typeof rawValue !== 'object') return [];
    const point = rawValue as Record<string, unknown>;
    const ts = Number(point.ts);
    return Number.isFinite(ts) ? [{ key, latest: { ts, value: point.value } }] : [];
  });
}

function entityDataRows(message: unknown) {
  if (!message || typeof message !== 'object') return [];
  const root = message as Record<string, unknown>;
  const page = root.data && typeof root.data === 'object' ? (root.data as Record<string, unknown>) : undefined;
  const snapshot = Array.isArray(page?.data) ? page.data : [];
  const updates = Array.isArray(root.update) ? root.update : [];
  return [...snapshot, ...updates].filter((row): row is Record<string, unknown> =>
    Boolean(row && typeof row === 'object'),
  );
}

export class TemplateTelemetryHub {
  private readonly options: Required<Omit<TemplateTelemetryHubOptions, 'loadLatestFallback'>> &
    Pick<TemplateTelemetryHubOptions, 'loadLatestFallback'>;
  private readonly requirements = new Map<string, RequirementRecord>();
  private readonly requirementRefCounts = new Map<string, number>();
  private readonly cache = new Map<string, Map<string, LatestTelemetryValue>>();
  private readonly subscriptionCmdIds = new Set<number>();
  private connected = false;
  private loading = false;
  private error: string | null = null;
  private usingFallback = false;
  private planTimer?: number;
  private fallbackTimer?: number;
  private fallbackRunning = false;
  private generation = 0;
  private closed = false;
  private readonly removeConnectionListener: () => void;

  constructor(
    private readonly client: TemplateTelemetryClient,
    options: TemplateTelemetryHubOptions = {},
  ) {
    this.options = { ...DEFAULT_OPTIONS, ...options };
    this.removeConnectionListener = client.onConnectionState((connected) => {
      this.connected = connected;
      if (!connected && this.requirements.size) this.scheduleFallback(this.options.initialFallbackDelayMs);
      this.notifyState();
    });
  }

  registerRequirement(
    requirement: TelemetryRequirement,
    listener: (event: TemplateTelemetryHubEvent) => void,
  ): TelemetrySubscriptionHandle {
    const normalized: TelemetryRequirement = {
      consumerId: String(requirement.consumerId || '').trim(),
      entityType: requirement.entityType,
      entityIds: normalizedList(requirement.entityIds),
      keys: normalizedList(requirement.keys),
    };
    if (!normalized.consumerId) throw new Error('Telemetry consumerId is required');

    this.requirements.set(normalized.consumerId, { requirement: normalized, listener });
    listener({ type: 'state', state: this.state() });
    normalized.entityIds.forEach((entityId) => {
      normalized.keys.forEach((key) => {
        const latest = this.getLatest(entityId, key);
        if (latest) listener({ type: 'value', entityId, key, latest });
      });
    });
    this.schedulePlan();

    let active = true;
    return {
      unregister: () => {
        if (!active) return;
        active = false;
        if (this.requirements.get(normalized.consumerId)?.listener === listener) {
          this.requirements.delete(normalized.consumerId);
          this.schedulePlan();
        }
      },
    };
  }

  getLatest(entityId: string, key: string) {
    return this.cache.get(entityId)?.get(key);
  }

  getRequirementRefCount(entityType: string, entityId: string, key: string) {
    return this.requirementRefCounts.get(this.refKey(entityType, entityId, key)) || 0;
  }

  close() {
    if (this.closed) return;
    this.closed = true;
    this.generation += 1;
    this.clearPlanTimer();
    this.clearFallbackTimer();
    this.clearSubscriptions();
    this.removeConnectionListener();
    this.requirements.clear();
    this.requirementRefCounts.clear();
    this.cache.clear();
  }

  private schedulePlan() {
    if (this.closed) return;
    this.clearPlanTimer();
    this.planTimer = window.setTimeout(() => {
      this.planTimer = undefined;
      this.rebuildPlan();
    }, this.options.planDebounceMs);
  }

  private rebuildPlan() {
    const generation = ++this.generation;
    this.clearSubscriptions();
    this.clearFallbackTimer();
    this.requirementRefCounts.clear();

    const entityTypes = new Map<string, { entityIds: Set<string>; keys: Set<string> }>();
    this.requirements.forEach(({ requirement }) => {
      const plan = entityTypes.get(requirement.entityType) || { entityIds: new Set<string>(), keys: new Set<string>() };
      requirement.entityIds.forEach((entityId) => {
        plan.entityIds.add(entityId);
        requirement.keys.forEach((key) => {
          plan.keys.add(key);
          const refKey = this.refKey(requirement.entityType, entityId, key);
          this.requirementRefCounts.set(refKey, (this.requirementRefCounts.get(refKey) || 0) + 1);
        });
      });
      entityTypes.set(requirement.entityType, plan);
    });

    if (!entityTypes.size) {
      this.loading = false;
      this.error = null;
      this.usingFallback = false;
      this.notifyState();
      return;
    }

    this.loading = true;
    this.error = null;
    this.usingFallback = false;
    entityTypes.forEach((plan, entityType) => {
      const keys = Array.from(plan.keys).sort();
      chunk(Array.from(plan.entityIds).sort(), this.options.maxEntitiesPerSubscription).forEach((entityIds) => {
        if (!entityIds.length || !keys.length) return;
        const cmdId = this.client.subscribeEntityDataLatest({
          entityType,
          entityIds,
          keys,
          onData: (message) => this.onEntityDataMessage(message, generation),
        });
        this.subscriptionCmdIds.add(cmdId);
      });
    });
    this.scheduleFallback(this.options.initialFallbackDelayMs);
    this.notifyState();
  }

  private onEntityDataMessage(message: unknown, generation: number) {
    if (this.closed || generation !== this.generation) return;
    const root = message && typeof message === 'object' ? (message as Record<string, unknown>) : {};
    const errorCode = Number(root.errorCode || 0);
    if (errorCode) {
      this.error = String(root.errorMsg || 'ThingsBoard telemetry subscription failed');
      this.loading = false;
      this.scheduleFallback(0);
      this.notifyState();
      return;
    }

    this.clearFallbackTimer();
    this.loading = false;
    this.error = null;
    this.usingFallback = false;
    entityDataRows(message).forEach((row) => {
      const entityId = entityIdFromData(row);
      if (!entityId) return;
      telemetryEntries(row).forEach(({ key, latest }) => this.setLatest(entityId, key, latest));
    });
    this.notifyState();
  }

  private setLatest(entityId: string, key: string, latest: LatestTelemetryValue) {
    const entityCache = this.cache.get(entityId) || new Map<string, LatestTelemetryValue>();
    const previous = entityCache.get(key);
    if (previous && previous.ts > latest.ts) return false;
    entityCache.set(key, latest);
    this.cache.set(entityId, entityCache);
    this.requirements.forEach(({ requirement, listener }) => {
      if (requirement.entityIds.includes(entityId) && requirement.keys.includes(key)) {
        listener({ type: 'value', entityId, key, latest });
      }
    });
    return true;
  }

  private scheduleFallback(delay: number) {
    if (!this.options.loadLatestFallback || this.closed || !this.requirements.size) return;
    this.clearFallbackTimer();
    this.fallbackTimer = window.setTimeout(
      () => {
        this.fallbackTimer = undefined;
        void this.runFallback(this.generation);
      },
      Math.max(0, delay),
    );
  }

  private async runFallback(generation: number) {
    if (this.fallbackRunning || !this.options.loadLatestFallback || generation !== this.generation) return;
    const plans = new Map<'DEVICE' | 'ASSET', { entityIds: Set<string>; keys: Set<string> }>();
    this.requirements.forEach(({ requirement }) => {
      const plan = plans.get(requirement.entityType) || { entityIds: new Set<string>(), keys: new Set<string>() };
      requirement.entityIds.forEach((entityId) => plan.entityIds.add(entityId));
      requirement.keys.forEach((key) => plan.keys.add(key));
      plans.set(requirement.entityType, plan);
    });
    if (!plans.size) return;

    this.fallbackRunning = true;
    try {
      const batches = await Promise.all(
        Array.from(plans, ([entityType, plan]) =>
          this.options.loadLatestFallback!(entityType, Array.from(plan.entityIds).sort(), Array.from(plan.keys).sort()),
        ),
      );
      if (this.closed || generation !== this.generation) return;
      batches.flat().forEach(({ entityId, key, ts, value }) => this.setLatest(entityId, key, { ts, value }));
      this.loading = false;
      this.error = null;
      this.usingFallback = true;
      this.notifyState();
    } catch (reason) {
      if (this.closed || generation !== this.generation) return;
      this.loading = false;
      this.error = reason instanceof Error ? reason.message : String(reason);
      this.notifyState();
    } finally {
      this.fallbackRunning = false;
      if (this.connected && (this.usingFallback || this.error) && generation === this.generation) {
        this.scheduleFallback(this.options.fallbackPollMs);
      }
      if (!this.connected && generation === this.generation) this.scheduleFallback(this.options.fallbackPollMs);
    }
  }

  private state(): TemplateTelemetryHubState {
    return {
      connected: this.connected,
      loading: this.loading,
      error: this.error,
      usingFallback: this.usingFallback,
    };
  }

  private notifyState() {
    const state = this.state();
    this.requirements.forEach(({ listener }) => listener({ type: 'state', state }));
  }

  private clearSubscriptions() {
    this.subscriptionCmdIds.forEach((cmdId) => this.client.unsubscribe(cmdId));
    this.subscriptionCmdIds.clear();
  }

  private clearPlanTimer() {
    if (this.planTimer) window.clearTimeout(this.planTimer);
    this.planTimer = undefined;
  }

  private clearFallbackTimer() {
    if (this.fallbackTimer) window.clearTimeout(this.fallbackTimer);
    this.fallbackTimer = undefined;
  }

  private refKey(entityType: string, entityId: string, key: string) {
    return `${entityType}:${entityId}:TIME_SERIES:${key}`;
  }
}
