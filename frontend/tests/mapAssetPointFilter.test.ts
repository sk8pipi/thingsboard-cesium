import assert from 'node:assert/strict';
import {
  AssetRelationTraversalLimitError,
  filterMapPointsByDeviceIds,
  resolveAssetDeviceIds,
  type AssetContainsRelation,
} from '../src/views/tb/map/services/mapAssetPointFilterService';
import {
  clearSelectedMapAssetId,
  getSelectedMapAssetStorageKey,
  loadSelectedMapAssetId,
  saveSelectedMapAssetId,
  type MapAssetSelectionStorage,
} from '../src/views/tb/map/selectedMapAssetStorage';

function relation(entityType: 'ASSET' | 'DEVICE', id: string): AssetContainsRelation {
  return {
    type: 'Contains',
    typeGroup: 'COMMON',
    to: { entityType, id },
  };
}

function createRelationFetcher(graph: Record<string, readonly AssetContainsRelation[]>) {
  return async (assetId: string) => graph[assetId] || [];
}

async function testDirectAndNestedRelations() {
  const result = await resolveAssetDeviceIds(
    'root',
    createRelationFetcher({
      root: [relation('DEVICE', 'device-a'), relation('ASSET', 'child')],
      child: [relation('DEVICE', 'device-b')],
    }),
  );

  assert.deepEqual([...result.assetIds], ['root', 'child']);
  assert.deepEqual([...result.deviceIds], ['device-a', 'device-b']);
  assert.equal(result.relationCount, 3);
}

async function testDuplicateAndCyclicRelations() {
  const calls: string[] = [];
  const graph = {
    root: [relation('ASSET', 'child'), relation('ASSET', 'child'), relation('DEVICE', 'device-a')],
    child: [relation('ASSET', 'root'), relation('DEVICE', 'device-a'), relation('DEVICE', 'device-b')],
  };
  const result = await resolveAssetDeviceIds('root', async (assetId) => {
    calls.push(assetId);
    return graph[assetId as keyof typeof graph] || [];
  });

  assert.deepEqual(calls.sort(), ['child', 'root']);
  assert.deepEqual([...result.deviceIds], ['device-a', 'device-b']);
}

async function testEmptyRelations() {
  const result = await resolveAssetDeviceIds('root', createRelationFetcher({}));
  assert.deepEqual([...result.assetIds], ['root']);
  assert.deepEqual([...result.deviceIds], []);
  assert.equal(result.relationCount, 0);
}

async function testOnlyExactContainsCommonRelationsAreIncluded() {
  const result = await resolveAssetDeviceIds(
    'root',
    createRelationFetcher({
      root: [
        relation('DEVICE', 'included'),
        { typeGroup: 'COMMON', to: { entityType: 'DEVICE', id: 'missing-type' } },
        { type: 'Contains', to: { entityType: 'DEVICE', id: 'missing-group' } },
        { type: 'Manages', typeGroup: 'COMMON', to: { entityType: 'DEVICE', id: 'wrong-type' } },
        { type: 'Contains', typeGroup: 'DASHBOARD', to: { entityType: 'DEVICE', id: 'wrong-group' } },
      ],
    }),
  );

  assert.deepEqual([...result.deviceIds], ['included']);
  assert.equal(result.relationCount, 1);
}

async function testTraversalLimits() {
  await assert.rejects(
    resolveAssetDeviceIds('root', createRelationFetcher({ root: [relation('ASSET', 'a'), relation('ASSET', 'b')] }), {
      maxAssetNodes: 2,
    }),
    AssetRelationTraversalLimitError,
  );

  await assert.rejects(
    resolveAssetDeviceIds('root', createRelationFetcher({ root: [relation('DEVICE', 'a'), relation('DEVICE', 'b')] }), {
      maxRelations: 1,
    }),
    AssetRelationTraversalLimitError,
  );
}

async function testFailureDoesNotReturnPartialResult() {
  let resolved = false;
  await assert.rejects(
    resolveAssetDeviceIds('root', async (assetId) => {
      if (assetId === 'child') throw new Error('temporary relation failure');
      return [relation('DEVICE', 'partial-device'), relation('ASSET', 'child')];
    }).then(() => {
      resolved = true;
    }),
    /temporary relation failure/,
  );
  assert.equal(resolved, false);
}

function testPointFiltering() {
  const points = [
    { id: 'sensor-a', type: 'sensor', entityId: 'device-a' },
    { id: 'camera-b', type: 'camera', entityId: 'device-b' },
    { id: 'sensor-unknown', type: 'sensor', entityId: 'unknown' },
    { id: 'camera-empty', type: 'camera', entityId: '' },
  ];

  assert.deepEqual(filterMapPointsByDeviceIds(points, null), points);
  assert.deepEqual(
    filterMapPointsByDeviceIds(points, new Set(['device-a', 'device-b'])).map((point) => point.id),
    ['sensor-a', 'camera-b'],
  );
  assert.deepEqual(
    filterMapPointsByDeviceIds(points, new Set()).map((point) => point.id),
    [],
  );
  assert.deepEqual(
    filterMapPointsByDeviceIds(points, new Set(['missing'])).map((point) => point.id),
    [],
  );
}

function testSelectionStorageIsolationAndFailureTolerance() {
  const values = new Map<string, string>();
  const storage: MapAssetSelectionStorage = {
    getItem: (key) => values.get(key) || null,
    setItem: (key, value) => void values.set(key, value),
    removeItem: (key) => void values.delete(key),
  };

  saveSelectedMapAssetId('user-a', 'dashboard-a', 'asset-a', storage);
  saveSelectedMapAssetId('user-a', 'dashboard-b', 'asset-b', storage);
  saveSelectedMapAssetId('user-b', 'dashboard-a', 'asset-c', storage);

  assert.equal(loadSelectedMapAssetId('user-a', 'dashboard-a', storage), 'asset-a');
  assert.equal(loadSelectedMapAssetId('user-a', 'dashboard-b', storage), 'asset-b');
  assert.equal(loadSelectedMapAssetId('user-b', 'dashboard-a', storage), 'asset-c');
  assert.notEqual(
    getSelectedMapAssetStorageKey('user-a', 'dashboard-a'),
    getSelectedMapAssetStorageKey('user-a', 'dashboard-b'),
  );

  clearSelectedMapAssetId('user-a', 'dashboard-a', storage);
  assert.equal(loadSelectedMapAssetId('user-a', 'dashboard-a', storage), '');

  const brokenStorage: MapAssetSelectionStorage = {
    getItem: () => {
      throw new Error('read denied');
    },
    setItem: () => {
      throw new Error('write denied');
    },
    removeItem: () => {
      throw new Error('remove denied');
    },
  };
  assert.equal(loadSelectedMapAssetId('user', 'dashboard', brokenStorage), '');
  assert.doesNotThrow(() => saveSelectedMapAssetId('user', 'dashboard', 'asset', brokenStorage));
  assert.doesNotThrow(() => clearSelectedMapAssetId('user', 'dashboard', brokenStorage));
}

await testDirectAndNestedRelations();
await testDuplicateAndCyclicRelations();
await testEmptyRelations();
await testOnlyExactContainsCommonRelationsAreIncluded();
await testTraversalLimits();
await testFailureDoesNotReturnPartialResult();
testPointFiltering();
testSelectionStorageIsolationAndFailureTolerance();

console.log('map asset point filter tests passed');
