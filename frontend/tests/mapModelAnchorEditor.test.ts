import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';
import { parse, compileScript, compileTemplate } from '@vue/compiler-sfc';
import { Cartesian3 } from 'cesium';
import { ref as vueRef, isProxy } from 'vue';
import type { MapPoint } from '../src/views/tb/map/types/mapPointTypes';
import {
  attachPoint,
  createModelAnchor,
  createModelPlacementMatrix,
  isValidModelAnchor,
  worldToLocation,
  getEffectiveSceneModels,
  assertNoRemovedModelBindings,
} from '../src/views/tb/map/services/mapModelAnchorService';
import { unifiedDeviceLocationWriteCandidates } from '../src/views/tb/map/services/mapPointPositionService';
import {
  createDefaultMapTemplateState,
  normalizeMapTemplateState,
  toMapBusinessBinding,
} from '../src/views/tb/map/mapTemplateConfig';

// 执行实际 SFC 声明；隔离网络，绝不向测试环境/用户设备写数据。
function compileFunctions(names: string[], globals: Record<string, any>) {
  const source = fs.readFileSync(new URL('../src/views/tb/map/MapWidgetEditor.vue', import.meta.url), 'utf8');
  const { descriptor, errors } = parse(source);
  assert.deepEqual(errors, []);
  const file = ts.createSourceFile('component.ts', descriptor.scriptSetup!.content, ts.ScriptTarget.Latest, true);
  const declarations = file.statements
    .filter(ts.isFunctionDeclaration)
    .filter((node) => names.includes(node.name!.text));
  assert.equal(declarations.length, names.length);
  const compiled = ts.transpileModule(declarations.map((node) => node.getText(file)).join('\n'), {
    compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.None },
  }).outputText;
  const context = vm.createContext({ ...globals, structuredClone, result: {} });
  vm.runInContext(compiled + '\nObject.assign(result, { ' + names.join(',') + ' });', context);
  return { api: context.result as Record<string, (...args: any[]) => any>, context };
}

for (const name of ['CesiumMap', 'MapWidgetEditor', 'MapWidgetLayer', 'MapHome', 'components/MapModelAnchorPanel']) {
  const filename = '../src/views/tb/map/' + name + '.vue';
  const { descriptor } = parse(fs.readFileSync(new URL(filename, import.meta.url), 'utf8'));
  const script = compileScript(descriptor, { id: name });
  assert.deepEqual(
    compileTemplate({
      id: name,
      filename,
      source: descriptor.template!.content,
      compilerOptions: { bindingMetadata: script.bindings },
    }).errors,
    [],
    name + ' 模板编译',
  );
}

const ref = (value: any) => ({ value });
const clone = (value: any) => JSON.parse(JSON.stringify(value));
const original: MapPoint = {
  id: 's1',
  name: '传感器',
  type: 'sensor',
  entityType: 'DEVICE',
  entityId: 'd1',
  entityName: 'sensor',
  longitude: 113,
  latitude: 31,
  height: 0,
  heightMode: 'absolute',
  createdAt: 1,
  updatedAt: 1,
};
const model = {
  id: 'building',
  name: '楼栋',
  type: '3d-tiles' as const,
  source: 'ion' as const,
  assetId: 1,
  longitude: 114,
  latitude: 30,
};
const world = Cartesian3.fromDegrees(114, 30, 40);
const anchor = createModelAnchor(model, createModelPlacementMatrix(model, 0), world);
const picked = { ...worldToLocation(world), modelAnchor: anchor };
const ground = { longitude: 114, latitude: 30, height: 2, heightMode: 'absolute' };
let previewClears = 0;
let canConfirm = true;
let currentPick = true;
let authRead: (id: string) => Promise<any> = async (id) => ({ id: { id }, name: '设备' });
const globals: Record<string, any> = {
  editorMode: ref('editing'),
  isSavingEdit: ref(false),
  removedPointsLoading: ref(false),
  removedPointsVisible: ref(false),
  removedPointEntries: ref([]),
  pointActionRequest: 0,
  pendingPointLocation: vueRef(null),
  relocatingPointId: ref(''),
  restoringPoint: ref(null),
  sensorPointDialogVisible: ref(false),
  cameraPointDialogVisible: ref(false),
  draftMapPoints: ref([clone(original)]),
  originalMapPoints: ref([clone(original)]),
  originalExcludedDeviceIds: ref([]),
  draftExcludedDeviceIds: ref([]),
  originalExcludedPointTypes: ref({}),
  originalExcludedDeviceBindings: ref({}),
  draftExcludedDeviceBindings: ref({}),
  restoredPositionReads: new Map(),
  editorDisposed: false,
  toMapBusinessBinding,
  unifiedDeviceLocationWriteCandidates,
  draftExcludedPointTypes: ref({}),
  draftSensorPopupBindings: ref({ s1: [] }),
  originalSensorPopupBindings: ref({ s1: [] }),
  errorMsg: ref(''),
  saveStatus: ref(''),
  saveFailures: ref([]),
  selectedWidgetId: ref(''),
  editPointId: ref(''),
  selectedSensor: ref(null),
  sensorConfigVisible: ref(false),
  effectiveAnchorModels: ref([model]),
  selectedEditPoint: ref(original),
  cesiumMapRef: ref({
    clearPickPreview: () => previewClears++,
    isCurrentModelPick: () => currentPick,
    getPointAnchorStatus: () => 'attached',
  }),
  window: { confirm: () => canConfirm },
  closeAllOverlays: () => {
    globals.editPointId.value = '';
  },
  cloneJson: clone,
  attachPoint,
  isValidModelAnchor,
  getDeviceInfoById: (id: string) => authRead(id),
  loadDeviceMapPointLocation: async () => ({ ...ground, source: 'deviceInfo' }),
  upsertDraftPoint: (points: MapPoint[], point: MapPoint) => {
    const index = points.findIndex((item) => item.id === point.id);
    if (index < 0) points.push(point);
    else points[index] = point;
  },
  ensureDeviceAvailableForNewPoint: (id: string) =>
    !globals.draftMapPoints.value.some((point: MapPoint) => point.entityId === id),
};
const { api: editor } = compileFunctions(
  [
    'clearPointPicking',
    'validatePickedLocation',
    'startPickingPoint',
    'togglePickingPoint',
    'cancelPickingPoint',
    'onMapPicked',
    'retryPickingPoint',
    'cancelPointTypeSelection',
    'openPointActions',
    'startRelocatingPoint',
    'pointWithPickedLocation',
    'unexcludeDevice',
    'confirmPointLocation',
    'changePointOcclusion',
    'closeRemovedPoints',
    'openRemovedPoints',
    'restoreRemovedPoint',
    'removeDraftPoint',
    'createPointBase',
    'verifyNewPointDevice',
    'finishNewPoint',
    'onSensorPointConfigured',
    'onCameraPointConfigured',
    'getChangedDeviceLocationPoints',
  ],
  globals,
);

editor.startRelocatingPoint(original);
assert.equal(globals.editorMode.value, 'pickingPoint');
editor.onMapPicked(picked);
assert.ok(isProxy(globals.pendingPointLocation.value.modelAnchor), '重现页面 ref 将候选锚点包装为 Proxy');
assert.equal(globals.editorMode.value, 'selectingPointType');
assert.equal(globals.draftMapPoints.value[0].longitude, 113, '预览不改草稿');
editor.cancelPointTypeSelection();
assert.equal(globals.draftMapPoints.value[0].longitude, 113, '取消仍是原位');
assert.ok(previewClears > 0);
editor.startRelocatingPoint(original);
editor.onMapPicked(picked);
currentPick = false;
editor.confirmPointLocation();
assert.equal(globals.draftMapPoints.value[0].modelAnchor, undefined, '过期模型候选不能确认');
currentPick = true;
editor.confirmPointLocation();
assert.equal(globals.draftMapPoints.value[0].modelAnchor.modelId, 'building');
assert.equal(globals.draftMapPoints.value[0].deviceLocationSynced, false);
editor.startRelocatingPoint(globals.draftMapPoints.value[0]);
editor.onMapPicked(ground);
editor.confirmPointLocation();
assert.equal(globals.draftMapPoints.value[0].modelAnchor, undefined, '从模型移回地面');
assert.equal(globals.draftMapPoints.value[0].height, 2);
canConfirm = false;
editor.removeDraftPoint('s1');
assert.equal(globals.draftMapPoints.value.length, 1);
canConfirm = true;
editor.removeDraftPoint('s1');
assert.equal(globals.draftMapPoints.value.length, 0);
assert.deepEqual(Array.from(globals.draftExcludedDeviceIds.value), ['d1']);
assert.equal(globals.draftExcludedPointTypes.value.d1, 'sensor');
assert.equal(
  unifiedDeviceLocationWriteCandidates(globals.draftMapPoints.value, [original]).length,
  0,
  '移动后移除不能同步放弃坐标',
);

await editor.openRemovedPoints();
assert.equal(globals.removedPointEntries.value[0].available, true);
await editor.restoreRemovedPoint(globals.removedPointEntries.value[0], false);
assert.equal(globals.draftMapPoints.value[0].modelAnchor, undefined, '恢复不复原锚点');
assert.equal(globals.draftMapPoints.value[0].longitude, ground.longitude);
assert.equal(globals.draftMapPoints.value[0].deviceLocationSynced, true);
assert.equal(globals.draftExcludedDeviceIds.value.length, 0);
assert.equal(
  editor.getChangedDeviceLocationPoints(globals.draftMapPoints.value).length,
  0,
  '同轮移除再恢复不写回设备旧读值',
);
assert.equal(
  unifiedDeviceLocationWriteCandidates(globals.draftMapPoints.value, []).length,
  0,
  '从当前设备坐标恢复不新增坐标写请求',
);
editor.removeDraftPoint(globals.draftMapPoints.value[0].id);
await editor.openRemovedPoints();
await editor.restoreRemovedPoint(globals.removedPointEntries.value[0], true);
assert.equal(globals.draftMapPoints.value.length, 0, '重选恢复未确认不显示');
editor.cancelPickingPoint();
assert.equal(globals.draftExcludedDeviceIds.value.length, 1, '取消恢复保留排除');

let release: (value: any) => void = () => {};
authRead = () =>
  new Promise((resolve) => {
    release = resolve;
  });
const pendingList = editor.openRemovedPoints();
editor.closeRemovedPoints();
release({ name: '设备' });
await pendingList;
assert.equal(globals.removedPointsVisible.value, false, '关闭后迟到结果不重开弹窗');
authRead = async () => {
  throw new Error('403');
};
await editor.openRemovedPoints();
assert.equal(globals.removedPointEntries.value[0].available, false, '无权限不能恢复');
editor.closeRemovedPoints();
authRead = async (id) => ({ id: { id }, name: '设备' });
for (const type of ['sensor', 'camera']) {
  editor.startPickingPoint();
  editor.onMapPicked(ground);
  globals.editorMode.value = type === 'sensor' ? 'configuringSensorPoint' : 'configuringCameraPoint';
  await editor[type === 'sensor' ? 'onSensorPointConfigured' : 'onCameraPointConfigured']({
    deviceId: type + '-new',
    deviceName: type,
    keys: ['temperature'],
    pollMs: 5000,
  });
  const point = globals.draftMapPoints.value.find((item: MapPoint) => item.entityId === type + '-new');
  assert.equal(point.longitude, ground.longitude, '新增以地图选点为准，不用设备旧坐标');
  assert.equal(point.deviceLocationSynced, false);
}

// 保存阶段：执行真实 saveEdit/adoptSavedState，模板及设备 API 使用内存故障注入。
const initial = createDefaultMapTemplateState();
initial.mapPoints = [{ ...original, longitude: 114, positionSource: 'template', deviceLocationSynced: false }];
const events: string[] = [];
let persisted: any = null;
let failSaveNumber = 0;
let saveNumber = 0;
let failDevice = true;
const saveGlobals: Record<string, any> = {
  ...globals,
  editorMode: ref('editing'),
  isSavingEdit: ref(false),
  canSaveEdit: ref(true),
  canEditTemplate: ref(true),
  grid: { setStatic() {}, enableMove() {}, enableResize() {} },
  draftMapPoints: ref(clone(initial.mapPoints)),
  originalMapPoints: ref([clone(original)]),
  pendingPointLocation: ref(null),
  relocatingPointId: ref(''),
  restoringPoint: ref(null),
  widgetSnapshot: null,
  saveStatus: ref(''),
  saveFailures: ref([]),
  errorMsg: ref(''),
  syncLayoutFromGrid() {},
  getEditorState: () => ({ ...clone(initial), mapPoints: clone(saveGlobals.draftMapPoints.value) }),
  getChangedDeviceLocationPoints: (points: MapPoint[]) =>
    unifiedDeviceLocationWriteCandidates(points, saveGlobals.originalMapPoints.value),
  findDuplicateDeviceBindings: () => [],
  getWritableDashboard: async () => ({ id: { id: 'dashboard-1' }, configuration: { map: clone(initial) } }),
  getDashboardById: async (id: string) => {
    assert.equal(id, 'dashboard-1', '最终同步状态写回锁定原模板');
    return { id: { id }, configuration: { map: clone(initial) } };
  },
  normalizeMapTemplateState,
  DASHBOARD_MAP_WIDGET_CONFIG_KEY: 'map',
  getEffectiveSceneModels,
  assertNoRemovedModelBindings,
  closeRemovedPoints() {},
  persistEditorState: async (state: any) => {
    events.push('template');
    saveNumber++;
    if (saveNumber === failSaveNumber) throw new Error('write failed');
    persisted = clone(state);
  },
  syncDeviceMapPointLocations: async (points: MapPoint[]) => {
    events.push('device');
    assert.equal(persisted.mapPoints[0].deviceLocationSynced, false);
    return failDevice
      ? { succeeded: [], failed: [{ deviceId: 'd1', name: '传感器', message: '写入失败' }] }
      : { succeeded: points.map((point) => point.entityId), failed: [] };
  },
  leaveEditMode: () => {
    saveGlobals.editorMode.value = 'view';
  },
  refreshTemplateRuntime: async () => {},
};
const { api: saver } = compileFunctions(['saveEdit', 'adoptSavedState'], saveGlobals);
failSaveNumber = 1;
await saver.saveEdit();
assert.deepEqual(events, ['template'], '模板失败不写设备');
assert.equal(saveGlobals.originalMapPoints.value[0].longitude, 113);
events.length = 0;
failSaveNumber = 0;
await saver.saveEdit();
assert.deepEqual(events, ['template', 'device', 'template']);
assert.equal(saveGlobals.editorMode.value, 'editing');
assert.equal(persisted.mapPoints[0].deviceLocationSynced, false, '失败标记跨刷新保留');
assert.equal(saveGlobals.originalMapPoints.value[0].longitude, 114, '部分保存后取消基线为已持久化目标');
assert.equal(saveGlobals.saveFailures.value.length, 1);
failDevice = false;
events.length = 0;
failSaveNumber = saveNumber + 2;
await saver.saveEdit();
assert.equal(saveGlobals.editorMode.value, 'editing', '同步标志写入失败不报全成功');
assert.equal(saveGlobals.originalMapPoints.value[0].deviceLocationSynced, false);
failSaveNumber = 0;
events.length = 0;
await saver.saveEdit();
assert.deepEqual(events, ['template', 'device', 'template'], '可重试未知/部分成功');
assert.equal(persisted.mapPoints[0].deviceLocationSynced, true);
assert.equal(saveGlobals.editorMode.value, 'view');
assert.equal(saveGlobals.isSavingEdit.value, false);

// 部件配置不能越过顶部保存门禁。
let bypassWrites = 0;
const popupGlobals = {
  ...globals,
  editorMode: ref('editing'),
  selectedSensor: ref(original),
  currentWidget: ref({ id: 'w1', widgetKey: 'k' }),
  addPanelVisible: ref(true),
  mountWidget() {},
  persistEditorState: async () => {
    bypassWrites++;
  },
};
const { api: popup } = compileFunctions(['persistSensorPopupWidgets', 'handleControlSwitchSettingsSave'], popupGlobals);
await popup.persistSensorPopupWidgets([]);
await popup.handleControlSwitchSettingsSave();
assert.equal(bypassWrites, 0);
const { api: navigation } = compileFunctions(['canLeaveEditor'], {
  ...saveGlobals,
  cancelEdit: () => {
    saveGlobals.editorMode.value = 'view';
  },
});
saveGlobals.isSavingEdit.value = true;
assert.equal(navigation.canLeaveEditor(), false, '保存期间浏览器后退不能离开');
saveGlobals.isSavingEdit.value = false;
saveGlobals.editorMode.value = 'editing';
canConfirm = false;
assert.equal(navigation.canLeaveEditor(), false);
canConfirm = true;
assert.equal(navigation.canLeaveEditor(), true);
console.log('mapModelAnchorEditor: SFC 编译、统一选点、移除恢复、异步取消、保存故障与重试通过');
