import assert from 'node:assert/strict';
import {
  buildMapAssetHierarchy,
  createAssetRelationCache,
  findMapAssetPath,
  flattenMapAssetTree,
  loadMapAssetHierarchy,
  searchMapAssetTree,
} from '../src/views/tb/map/services/mapAssetHierarchyService';
import {
  resolveAssetDeviceIds,
  type AssetContainsRelation,
} from '../src/views/tb/map/services/mapAssetPointFilterService';

const assets = [
  { id: 'building', name: '石油科技大楼' },
  { id: 'f1', name: '一层', description: 'floor-1' },
  { id: 'f2', name: '二层' },
  { id: 'library', name: '图书馆' },
  { id: 'room', name: '101室' },
];
const edge = (id: string, entityType = 'ASSET'): AssetContainsRelation => ({
  to: { id, entityType },
  type: 'Contains',
  typeGroup: 'COMMON',
});
const graph = new Map<string, AssetContainsRelation[]>([
  ['building', [edge('f1'), edge('f1'), edge('f2'), edge('direct', 'DEVICE'), edge('inaccessible')]],
  ['f1', [edge('room'), edge('sensor', 'DEVICE')]],
  ['f2', [edge('camera', 'DEVICE')]],
  ['room', [edge('sensor', 'DEVICE')]],
]);

const tree = buildMapAssetHierarchy(assets, graph);
assert.equal(tree.cycleDetected, false);
assert.equal(tree.roots.length, 2);
const path = findMapAssetPath(tree.roots, 'room');
assert.deepEqual(
  path.map((node) => node.id),
  ['building', 'f1', 'room'],
);
assert.deepEqual(path[2].path, ['石油科技大楼', '一层', '101室']);
assert.equal(flattenMapAssetTree(tree.roots, new Set()).length, 2);
assert.equal(flattenMapAssetTree(tree.roots, new Set(['building'])).length, 4);
assert.equal(flattenMapAssetTree(tree.roots, new Set(['building', 'building/f1'])).length, 5);
const searched = searchMapAssetTree(tree.roots, ' floor-1 ');
assert.deepEqual(
  flattenMapAssetTree(searched, new Set(), true).map(({ node }) => node.id),
  ['building', 'f1', 'room'],
);
assert.equal(flattenMapAssetTree(searchMapAssetTree(tree.roots, '石油'), new Set(), true).length, 4);
assert.deepEqual(searchMapAssetTree(tree.roots, '不存在'), []);
assert.equal(
  flattenMapAssetTree(tree.roots, new Set(), true).some(({ node }) => node.id === 'inaccessible'),
  false,
);

const sharedGraph = new Map(graph);
sharedGraph.set('library', [edge('f1')]);
const shared = flattenMapAssetTree(buildMapAssetHierarchy(assets, sharedGraph).roots, new Set(), true);
assert.equal(shared.filter(({ node }) => node.id === 'f1').length, 2);
assert.equal(new Set(shared.map(({ node }) => node.key)).size, shared.length);
const cycle = buildMapAssetHierarchy(
  assets.slice(0, 3),
  new Map([
    ['building', [edge('f1')]],
    ['f1', [edge('f2')]],
    ['f2', [edge('building')]],
  ]),
);
assert.equal(cycle.cycleDetected, true);
assert.equal(new Set(flattenMapAssetTree(cycle.roots, new Set(), true).map(({ node }) => node.id)).size, 3);
const wrongRelations = buildMapAssetHierarchy(
  assets,
  new Map([
    [
      'building',
      [
        { ...edge('f1'), type: 'Manages' },
        { ...edge('f2'), typeGroup: 'DASHBOARD' },
      ],
    ],
  ]),
);
assert.equal(wrongRelations.roots.length, 5);

let clock = 0;
let requests = 0;
const cache = createAssetRelationCache(
  async (id) => {
    requests++;
    return graph.get(id) || [];
  },
  30,
  () => clock,
);
await Promise.all([cache.fetch('building'), cache.fetch('building')]);
assert.equal(requests, 1);
await cache.fetch('building');
assert.equal(requests, 1);
clock = 31;
await cache.fetch('building');
assert.equal(requests, 2);
cache.clear();
await cache.fetch('building');
assert.equal(requests, 3);
let attempts = 0;
const retryCache = createAssetRelationCache(async () => {
  if (++attempts === 1) throw new Error('temporary');
  return [];
});
await assert.rejects(retryCache.fetch('building'), /temporary/);
await retryCache.fetch('building');
assert.equal(attempts, 2);

let active = 0;
let peak = 0;
await loadMapAssetHierarchy(
  Array.from({ length: 14 }, (_, i) => ({ id: String(i), name: String(i) })),
  async () => {
    active++;
    peak = Math.max(peak, active);
    await new Promise((resolve) => setTimeout(resolve, 2));
    active--;
    return [];
  },
);
assert.equal(peak, 6);
await assert.rejects(
  loadMapAssetHierarchy(assets, async (id) => {
    if (id === 'f1') throw new Error('incomplete');
    return graph.get(id) || [];
  }),
  /incomplete/,
);
await assert.rejects(
  loadMapAssetHierarchy(assets, cache.fetch, () => false),
  /superseded/,
);
await assert.rejects(
  loadMapAssetHierarchy(
    Array.from({ length: 1001 }, (_, i) => ({ id: String(i), name: String(i) })),
    cache.fetch,
  ),
  /1000/,
);

// The same cached relations drive both the tree and point filtering.
const accessibleGraph = new Map(graph);
accessibleGraph.set(
  'building',
  graph.get('building')!.filter((r) => r.to?.id !== 'inaccessible'),
);
const sharedCache = createAssetRelationCache(async (id) => accessibleGraph.get(id) || []);
await loadMapAssetHierarchy(assets, sharedCache.fetch);
assert.deepEqual([...(await resolveAssetDeviceIds('building', sharedCache.fetch)).deviceIds].sort(), [
  'camera',
  'direct',
  'sensor',
]);
assert.deepEqual([...(await resolveAssetDeviceIds('f1', sharedCache.fetch)).deviceIds], ['sensor']);
assert.deepEqual([...(await resolveAssetDeviceIds('f2', sharedCache.fetch)).deviceIds], ['camera']);
console.log('map asset hierarchy tests passed');
