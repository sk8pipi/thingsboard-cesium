export const DEFAULT_ASSET_RELATION_CONCURRENCY = 6;
export const DEFAULT_MAX_ASSET_NODES = 1000;
export const DEFAULT_MAX_ASSET_RELATIONS = 10000;

export interface AssetRelationTarget {
  id?: string;
  entityType?: string;
}

export interface AssetContainsRelation {
  to?: AssetRelationTarget;
  type?: string;
  typeGroup?: string;
}

export interface AssetDeviceTraversalOptions {
  concurrency?: number;
  maxAssetNodes?: number;
  maxRelations?: number;
}

export interface AssetDeviceTraversalResult {
  assetIds: Set<string>;
  deviceIds: Set<string>;
  relationCount: number;
}

export type FetchAssetContainsRelations = (assetId: string) => Promise<readonly AssetContainsRelation[]>;

export class AssetRelationTraversalLimitError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'AssetRelationTraversalLimitError';
  }
}

function normalizeId(value: unknown) {
  return String(value || '').trim();
}

function normalizePositiveInteger(value: number | undefined, fallback: number) {
  const normalized = Math.floor(Number(value));
  return Number.isFinite(normalized) && normalized > 0 ? normalized : fallback;
}

function isContainsRelation(relation: AssetContainsRelation) {
  const type = normalizeId(relation.type);
  const typeGroup = normalizeId(relation.typeGroup);
  return type === 'Contains' && typeGroup === 'COMMON';
}

export async function resolveAssetDeviceIds(
  rootAssetId: string,
  fetchRelations: FetchAssetContainsRelations,
  options: AssetDeviceTraversalOptions = {},
): Promise<AssetDeviceTraversalResult> {
  const normalizedRootAssetId = normalizeId(rootAssetId);
  if (!normalizedRootAssetId) {
    throw new Error('Asset id is required');
  }

  const concurrency = normalizePositiveInteger(options.concurrency, DEFAULT_ASSET_RELATION_CONCURRENCY);
  const maxAssetNodes = normalizePositiveInteger(options.maxAssetNodes, DEFAULT_MAX_ASSET_NODES);
  const maxRelations = normalizePositiveInteger(options.maxRelations, DEFAULT_MAX_ASSET_RELATIONS);
  const assetIds = new Set<string>([normalizedRootAssetId]);
  const deviceIds = new Set<string>();
  const queue = [normalizedRootAssetId];
  let cursor = 0;
  let relationCount = 0;

  while (cursor < queue.length) {
    const batch = queue.slice(cursor, cursor + concurrency);
    cursor += batch.length;
    const relationGroups = await Promise.all(batch.map((assetId) => fetchRelations(assetId)));

    for (const relations of relationGroups) {
      for (const relation of relations || []) {
        if (!isContainsRelation(relation)) continue;

        relationCount += 1;
        if (relationCount > maxRelations) {
          throw new AssetRelationTraversalLimitError(`Asset relation count exceeds the limit of ${maxRelations}`);
        }

        const targetId = normalizeId(relation.to?.id);
        const targetType = normalizeId(relation.to?.entityType).toUpperCase();
        if (!targetId) continue;

        if (targetType === 'DEVICE') {
          deviceIds.add(targetId);
          continue;
        }

        if (targetType === 'ASSET' && !assetIds.has(targetId)) {
          if (assetIds.size >= maxAssetNodes) {
            throw new AssetRelationTraversalLimitError(`Asset node count exceeds the limit of ${maxAssetNodes}`);
          }
          assetIds.add(targetId);
          queue.push(targetId);
        }
      }
    }
  }

  return { assetIds, deviceIds, relationCount };
}

export function filterMapPointsByDeviceIds<T extends { entityId?: string }>(
  points: readonly T[],
  deviceIds: ReadonlySet<string> | null,
) {
  if (deviceIds === null) return [...points];
  return points.filter((point) => deviceIds.has(normalizeId(point.entityId)));
}
