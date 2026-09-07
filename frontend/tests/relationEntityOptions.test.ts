import assert from 'node:assert/strict';
import {
  buildRelationSaveData,
  changeRelationEntityType,
  createRelationEntityOptionSource,
  isRelationEntitySelectionRequired,
  isRelationEntityDropdownNearBottom,
  type RelationEntityOptionPage,
  type RelationEntityOptionQuery,
} from '../src/views/tb/relation/relationEntityOptions';

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}

async function testPaginationAndDeduplication() {
  const queries: RelationEntityOptionQuery[] = [];
  const source = createRelationEntityOptionSource(async (query) => {
    queries.push(query);
    return query.page === 0
      ? {
          data: [
            { label: '设备 1', value: '1' },
            { label: '设备 2', value: '2' },
          ],
          hasNext: true,
          totalElements: 3,
        }
      : {
          data: [
            { label: '设备 2', value: '2' },
            { label: '设备 3', value: '3' },
          ],
          hasNext: false,
          totalElements: 3,
        };
  });

  await source.reset('DEVICE');
  await source.loadNext();
  assert.deepEqual(
    source.state.options.map((option) => option.value),
    ['1', '2', '3'],
  );
  assert.deepEqual(
    queries.map(({ page, pageSize }) => ({ page, pageSize })),
    [
      { page: 0, pageSize: 50 },
      { page: 1, pageSize: 50 },
    ],
  );
  assert.equal(source.state.hasNext, false);
}

async function testSearchAndSelectedOption() {
  const source = createRelationEntityOptionSource(async (query) => ({
    data: [{ label: `结果 ${query.textSearch}`, value: 'result' }],
    hasNext: false,
    totalElements: 1,
  }));
  await source.reset('ASSET', '  冷库  ', { label: '当前资产', value: 'selected' });
  assert.equal(source.state.textSearch, '冷库');
  assert.deepEqual(
    source.state.options.map((option) => option.value),
    ['selected', 'result'],
  );
}

async function testStaleResponseIsIgnored() {
  const oldRequest = deferred<RelationEntityOptionPage>();
  const newRequest = deferred<RelationEntityOptionPage>();
  const source = createRelationEntityOptionSource((query) =>
    query.textSearch === '旧' ? oldRequest.promise : newRequest.promise,
  );

  const oldReset = source.reset('DEVICE', '旧');
  const newReset = source.reset('ASSET', '新');
  newRequest.resolve({ data: [{ label: '新资产', value: 'new' }], hasNext: false, totalElements: 1 });
  await newReset;
  oldRequest.resolve({ data: [{ label: '旧设备', value: 'old' }], hasNext: false, totalElements: 1 });
  await oldReset;
  assert.equal(source.state.entityType, 'ASSET');
  assert.deepEqual(source.state.options, [{ label: '新资产', value: 'new' }]);
}

function testDropdownBoundary() {
  assert.equal(isRelationEntityDropdownNearBottom({ scrollTop: 368, clientHeight: 100, scrollHeight: 500 }), true);
  assert.equal(isRelationEntityDropdownNearBottom({ scrollTop: 200, clientHeight: 100, scrollHeight: 500 }), false);
}

function testOnlyVisibleEntitySideIsRequired() {
  assert.equal(isRelationEntitySelectionRequired('From', 'From'), false);
  assert.equal(isRelationEntitySelectionRequired('From', 'To'), true);
  assert.equal(isRelationEntitySelectionRequired('To', 'From'), true);
  assert.equal(isRelationEntitySelectionRequired('To', 'To'), false);
}

function testFixedEntityIsMergedIntoSaveData() {
  const currentAsset = { id: 'asset-current', entityType: 'ASSET' };
  const selectedDevice = { id: 'device-selected', entityType: 'DEVICE' };
  const outgoing = buildRelationSaveData({ type: 'Contains', to: selectedDevice }, { from: currentAsset }, 'From');
  assert.deepEqual(outgoing.from, currentAsset);
  assert.deepEqual(outgoing.to, selectedDevice);

  const incoming = buildRelationSaveData({ type: 'Contains', from: selectedDevice }, { to: currentAsset }, 'To');
  assert.deepEqual(incoming.from, selectedDevice);
  assert.deepEqual(incoming.to, currentAsset);
}

function testEntityTypeChangePreservesOtherFormValues() {
  const currentAsset = { id: 'asset-current', entityType: 'ASSET' };
  const values = {
    typeGroup: 'COMMON',
    type: 'Contains',
    from: currentAsset,
    to: { id: 'old-device', entityType: 'DEVICE' },
  };
  const changed = changeRelationEntityType(values, 'To', 'ASSET');
  assert.equal(changed.typeGroup, 'COMMON');
  assert.equal(changed.type, 'Contains');
  assert.deepEqual(changed.from, currentAsset);
  assert.deepEqual(changed.to, { id: undefined, entityType: 'ASSET' });
}

await testPaginationAndDeduplication();
await testSearchAndSelectedOption();
await testStaleResponseIsIgnored();
testDropdownBoundary();
testOnlyVisibleEntitySideIsRequired();
testFixedEntityIsMergedIntoSaveData();
testEntityTypeChangePreservesOtherFormValues();
console.log('relationEntityOptions tests passed');
