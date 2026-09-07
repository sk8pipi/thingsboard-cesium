import {
  AssetRelationTraversalLimitError,
  DEFAULT_ASSET_RELATION_CONCURRENCY,
  DEFAULT_MAX_ASSET_NODES,
  DEFAULT_MAX_ASSET_RELATIONS,
  type AssetContainsRelation,
  type FetchAssetContainsRelations,
} from './mapAssetPointFilterService';

export interface MapAssetOption {
  id: string;
  name: string;
  description?: string;
}

export interface MapAssetTreeNode extends MapAssetOption {
  key: string;
  path: string[];
  children: MapAssetTreeNode[];
}

// Cache lives within one MapHome instance; refresh/unmount replaces or clears it.
export function createAssetRelationCache(fetchRelations: FetchAssetContainsRelations, ttl = 30000, now = Date.now) {
  const cache = new Map<string, { expires: number; promise: Promise<readonly AssetContainsRelation[]> }>();
  const fetch: FetchAssetContainsRelations = (id) => {
    const existing = cache.get(id);
    if (existing && existing.expires > now()) return existing.promise;
    const entry = { expires: Infinity, promise: Promise.resolve([] as readonly AssetContainsRelation[]) };
    entry.promise = Promise.resolve()
      .then(() => fetchRelations(id))
      .then(
        (relations) => {
          entry.expires = now() + ttl;
          return relations;
        },
        (error) => {
          if (cache.get(id) === entry) cache.delete(id);
          throw error;
        },
      );
    cache.set(id, entry);
    return entry.promise;
  };
  return { fetch, clear: () => cache.clear() };
}

export async function loadMapAssetHierarchy(
  assets: readonly MapAssetOption[],
  fetchRelations: FetchAssetContainsRelations,
  isCurrent: () => boolean = () => true,
) {
  const unique = [...new Map(assets.map((asset) => [asset.id, asset])).values()];
  if (unique.length > DEFAULT_MAX_ASSET_NODES) throw new AssetRelationTraversalLimitError('资产目录超过1000个资产');
  const relations = new Map<string, readonly AssetContainsRelation[]>();
  let count = 0;
  for (let index = 0; index < unique.length; index += DEFAULT_ASSET_RELATION_CONCURRENCY) {
    if (!isCurrent()) throw new Error('Asset hierarchy request superseded');
    const batch = unique.slice(index, index + DEFAULT_ASSET_RELATION_CONCURRENCY);
    const results = await Promise.all(batch.map((asset) => fetchRelations(asset.id)));
    results.forEach((result, offset) => {
      count += result.length;
      if (count > DEFAULT_MAX_ASSET_RELATIONS) throw new AssetRelationTraversalLimitError('资产关系超过10000条');
      relations.set(batch[offset].id, result);
    });
  }
  return buildMapAssetHierarchy(unique, relations);
}

export function buildMapAssetHierarchy(
  assets: readonly MapAssetOption[],
  relations: ReadonlyMap<string, readonly AssetContainsRelation[]>,
) {
  const byId = new Map(assets.map((asset) => [asset.id, asset]));
  const children = new Map<string, string[]>();
  const incoming = new Set<string>();
  const sortIds = (ids: string[]) =>
    ids.sort(
      (a, b) => byId.get(a)!.name.localeCompare(byId.get(b)!.name, 'zh-CN', { numeric: true }) || a.localeCompare(b),
    );
  for (const id of byId.keys()) {
    const targets = new Set<string>();
    for (const relation of relations.get(id) || []) {
      const target = relation.to?.id || '';
      if (
        relation.type === 'Contains' &&
        relation.typeGroup === 'COMMON' &&
        relation.to?.entityType === 'ASSET' &&
        byId.has(target)
      ) {
        targets.add(target);
        incoming.add(target);
      }
    }
    children.set(id, sortIds([...targets]));
  }
  const covered = new Set<string>();
  let cycleDetected = false;
  let occurrenceCount = 0;
  function visit(id: string, pathIds: string[], names: string[]): MapAssetTreeNode {
    if (++occurrenceCount > 5000 || pathIds.length >= 100) {
      throw new AssetRelationTraversalLimitError('资产树的展开规模或深度超过上限');
    }
    covered.add(id);
    const asset = byId.get(id)!;
    const path = [...names, asset.name];
    const ids = [...pathIds, id];
    const node: MapAssetTreeNode = { ...asset, key: ids.join('/'), path, children: [] };
    for (const child of children.get(id) || []) {
      if (ids.includes(child)) {
        cycleDetected = true;
        continue;
      }
      node.children.push(visit(child, ids, path));
    }
    return node;
  }
  const sorted = sortIds([...byId.keys()]);
  const roots = sorted.filter((id) => !incoming.has(id)).map((id) => visit(id, [], []));
  // A closed cycle has no natural root; expose a deterministic entry so assets remain reachable.
  for (const id of sorted) {
    if (!covered.has(id)) roots.push(visit(id, [], []));
  }
  return { roots, cycleDetected };
}

export function searchMapAssetTree(nodes: readonly MapAssetTreeNode[], search: string): readonly MapAssetTreeNode[] {
  const keyword = search.trim().toLocaleLowerCase();
  if (!keyword) return nodes;
  const result: MapAssetTreeNode[] = [];
  for (const node of nodes) {
    if (`${node.name} ${node.description || ''}`.toLocaleLowerCase().includes(keyword)) {
      result.push(node);
    } else {
      const children = searchMapAssetTree(node.children, keyword);
      if (children.length) result.push({ ...node, children: [...children] });
    }
  }
  return result;
}

export function flattenMapAssetTree(
  nodes: readonly MapAssetTreeNode[],
  expanded: ReadonlySet<string>,
  expandAll = false,
  depth = 0,
): Array<{ node: MapAssetTreeNode; depth: number }> {
  return nodes.flatMap((node) => [
    { node, depth },
    ...(expandAll || expanded.has(node.key) ? flattenMapAssetTree(node.children, expanded, expandAll, depth + 1) : []),
  ]);
}

export function findMapAssetPath(nodes: readonly MapAssetTreeNode[], id: string): MapAssetTreeNode[] {
  for (const node of nodes) {
    if (node.id === id) return [node];
    const childPath = findMapAssetPath(node.children, id);
    if (childPath.length) return [node, ...childPath];
  }
  return [];
}
