import type {
  AggregateFunction,
  AggregateMetricWidgetConfig,
  AggregateResult,
  LatestTelemetryValue,
} from './aggregateMetricTypes';

type Contribution = {
  ts: number;
  value: number | null;
  valid: boolean;
};

function finiteNumber(value: unknown) {
  if (value === null || value === undefined || value === '') return null;
  const normalized = Number(value);
  return Number.isFinite(normalized) ? normalized : null;
}

export class IncrementalAggregation {
  private readonly contributions = new Map<string, Contribution>();
  private readonly entityIds = new Set<string>();
  private sum = 0;
  private validCount = 0;
  private minimum: number | null = null;
  private maximum: number | null = null;

  constructor(
    private readonly aggregateFunction: AggregateFunction,
    private readonly missingValueStrategy: AggregateMetricWidgetConfig['aggregation']['missingValueStrategy'],
  ) {}

  replaceEntities(entityIds: string[], getLatest?: (entityId: string) => LatestTelemetryValue | undefined) {
    this.entityIds.clear();
    this.contributions.clear();
    this.sum = 0;
    this.validCount = 0;
    this.minimum = null;
    this.maximum = null;
    entityIds.forEach((entityId) => {
      this.entityIds.add(entityId);
      const latest = getLatest?.(entityId);
      if (latest) this.apply(entityId, latest);
    });
  }

  apply(entityId: string, latest: LatestTelemetryValue) {
    if (!this.entityIds.has(entityId) || !Number.isFinite(latest.ts)) return false;
    const previous = this.contributions.get(entityId);
    if (previous && previous.ts > latest.ts) return false;

    const parsed = finiteNumber(latest.value);
    const next: Contribution = {
      ts: latest.ts,
      value: parsed ?? (this.missingValueStrategy === 'ZERO' ? 0 : null),
      valid: parsed !== null,
    };
    this.removeContribution(previous);
    this.contributions.set(entityId, next);
    this.addContribution(next);
    this.refreshExtrema(previous, next);
    return true;
  }

  removeEntity(entityId: string) {
    if (!this.entityIds.delete(entityId)) return false;
    const previous = this.contributions.get(entityId);
    this.removeContribution(previous);
    this.contributions.delete(entityId);
    if (previous?.value === this.minimum || previous?.value === this.maximum) this.recalculateExtrema();
    return true;
  }

  result(): AggregateResult {
    const totalEntityCount = this.entityIds.size;
    const denominator = this.missingValueStrategy === 'ZERO' ? totalEntityCount : this.validCount;
    let value: number | null;
    if (this.aggregateFunction === 'COUNT') value = this.validCount;
    else if (!denominator) value = null;
    else if (this.aggregateFunction === 'AVG') value = this.sum / denominator;
    else if (this.aggregateFunction === 'MIN') value = this.minimum;
    else if (this.aggregateFunction === 'MAX') value = this.maximum;
    else value = this.sum;

    return {
      value,
      validEntityCount: this.validCount,
      totalEntityCount,
      missingEntityCount: Math.max(0, totalEntityCount - this.validCount),
      latestTimestamp: this.latestTimestamp(),
    };
  }

  private addContribution(contribution: Contribution) {
    if (contribution.value !== null) this.sum += contribution.value;
    if (contribution.valid) this.validCount += 1;
  }

  private removeContribution(contribution?: Contribution) {
    if (!contribution) return;
    if (contribution.value !== null) this.sum -= contribution.value;
    if (contribution.valid) this.validCount -= 1;
  }

  private refreshExtrema(previous: Contribution | undefined, next: Contribution) {
    if (
      previous &&
      (previous.value === this.minimum || previous.value === this.maximum) &&
      previous.value !== next.value
    ) {
      this.recalculateExtrema();
      return;
    }
    if (next.value === null) return;
    this.minimum = this.minimum === null ? next.value : Math.min(this.minimum, next.value);
    this.maximum = this.maximum === null ? next.value : Math.max(this.maximum, next.value);
  }

  private recalculateExtrema() {
    this.minimum = null;
    this.maximum = null;
    this.contributions.forEach((contribution) => {
      if (contribution.value === null) return;
      this.minimum = this.minimum === null ? contribution.value : Math.min(this.minimum, contribution.value);
      this.maximum = this.maximum === null ? contribution.value : Math.max(this.maximum, contribution.value);
    });
  }

  private latestTimestamp() {
    let latest: number | null = null;
    this.contributions.forEach((contribution) => {
      latest = latest === null ? contribution.ts : Math.max(latest, contribution.ts);
    });
    return latest;
  }
}
