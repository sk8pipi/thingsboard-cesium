import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';
import { parse } from '@vue/compiler-sfc';
import * as Cesium from 'cesium';
import {
  createModelAnchor,
  createModelPlacementMatrix,
  getModelRevision,
  resolveModelAnchor,
  worldToLocation,
} from '../src/views/tb/map/services/mapModelAnchorService';

// 执行真实 CesiumMap 函数，模拟渲染帧；不是 GPU/WebGL 验收。
const { descriptor } = parse(fs.readFileSync(new URL('../src/views/tb/map/CesiumMap.vue', import.meta.url), 'utf8'));
const file = ts.createSourceFile('component.ts', descriptor.scriptSetup!.content, ts.ScriptTarget.Latest, true);
const names = [
  'pickModelSurface',
  'getPickedLocation',
  'clearPickPreview',
  'applyBasePointVisibility',
  'isCurrentModelPick',
  'getPointAnchorStatus',
];
const functions = file.statements.filter(ts.isFunctionDeclaration).filter((node) => names.includes(node.name!.text));
assert.equal(functions.length, names.length);
const model = {
  id: 'building',
  name: '测试楼',
  type: '3d-tiles' as const,
  source: 'ion' as const,
  assetId: 1,
  longitude: 114,
  latitude: 30,
};
const target = { tilesLoaded: true, show: true };
const world = Cesium.Cartesian3.fromDegrees(114, 30, 40);
const ground = Cesium.Cartesian3.fromDegrees(114, 30, 5);
const frame = new Cesium.Event();
const sensorSource = { show: true };
const cameraSource = { show: true };
const props = { mode: 'pickPoint', pickModelId: '', hideBasePoints: false };
let pickedObject: any = { primitive: target };
let pickedWorld: Cesium.Cartesian3 | undefined = world;
let groundWorld: Cesium.Cartesian3 | undefined = ground;
let groundReads = 0;
let destroyed = false;
const events: { name: string; payload: any }[] = [];
const viewer = {
  isDestroyed: () => destroyed,
  camera: { getPickRay: () => ({}) },
  entities: { add: (value: any) => value, remove() {} },
  scene: {
    pickPositionSupported: true,
    postRender: frame,
    requestRender: () => queueMicrotask(() => frame.raiseEvent()),
    pick: () => {
      assert.equal(sensorSource.show, false);
      assert.equal(cameraSource.show, false);
      return pickedObject;
    },
    pickPosition: () => pickedWorld,
    globe: {
      pick: () => {
        groundReads++;
        return groundWorld;
      },
    },
  },
};
const runtimes = new Map([[model.id, { model, status: 'ready', matrix: createModelPlacementMatrix(model, 0) }]]);
const context = vm.createContext({
  viewer,
  modelPickBusy: false,
  previewEntity: undefined,
  pickVersion: 0,
  modelLoadVersion: 0,
  props,
  sensorDataSource: sensorSource,
  cameraDataSource: cameraSource,
  modelRuntimes: runtimes,
  sceneModelTilesets: [target],
  tilesetModelIds: new Map([[target, model.id]]),
  window: { setTimeout, clearTimeout },
  Cesium,
  createModelAnchor,
  worldToLocation,
  getModelRevision,
  resolveModelAnchor,
  emit: (name: string, payload: any) => events.push({ name, payload }),
  result: {},
});
vm.runInContext(
  ts.transpileModule(functions.map((node) => node.getText(file)).join('\n'), {
    compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.None },
  }).outputText + `\nObject.assign(result, {${names.join(',')}});`,
  context,
);
const api = context.result;
const click = () => api.pickModelSurface(new Cesium.Cartesian2(100, 100));
await click();
assert.equal(events.at(-1)?.name, 'map-click');
assert.equal(events.at(-1)?.payload.modelAnchor.modelId, model.id, '自动识别模型，无需预选模型');
assert.ok(api.isCurrentModelPick(events.at(-1)?.payload));
assert.equal(groundReads, 0);
assert.equal(api.getPointAnchorStatus(events.at(-1)?.payload), 'attached');
pickedWorld = undefined;
await click();
assert.equal(events.at(-1)?.name, 'pick-error');
assert.equal(groundReads, 0, '命中模型但无深度绝不落到楼底');
pickedObject = { primitive: {} };
await click();
assert.equal(events.at(-1)?.name, 'pick-error', '未知对象不能当作地形');
assert.equal(groundReads, 0);
pickedObject = undefined;
viewer.scene.pickPositionSupported = false;
await click();
assert.equal(events.at(-1)?.name, 'map-click', '无模型深度能力仍可选地形');
assert.equal(events.at(-1)?.payload.modelAnchor, undefined);
assert.ok(Math.abs(events.at(-1)?.payload.height - 5) < 1e-6);
target.tilesLoaded = false;
await click();
assert.equal(events.at(-1)?.name, 'pick-error', '模型未完整加载不能静默拾取楼底');
target.tilesLoaded = true;
groundWorld = undefined;
await click();
assert.equal(events.at(-1)?.name, 'pick-error', '天空无有效位置');
groundWorld = ground;
pickedObject = { primitive: target };
pickedWorld = world;
viewer.scene.pickPositionSupported = true;
events.length = 0;
const cancelled = click();
api.clearPickPreview();
await cancelled;
assert.equal(
  events.some((event) => event.name === 'map-click'),
  false,
);
assert.equal(sensorSource.show, true);
assert.equal(cameraSource.show, true);
events.length = 0;
const sceneChanged = click();
context.modelLoadVersion++;
await sceneChanged;
assert.equal(
  events.some((event) => event.name === 'map-click'),
  false,
  '重载模型后丢弃旧拾取',
);
events.length = 0;
const exiting = click();
props.mode = 'default';
await exiting;
assert.equal(
  events.some((event) => event.name === 'map-click'),
  false,
);
props.mode = 'pickPoint';
const unloading = click();
destroyed = true;
await unloading;
assert.equal(frame.numberOfListeners, 0);
console.log('统一拾取：自动模型/地形、无深度不回退、未知对象/天空、加载保护、取消/重载/卸载竞态通过');
