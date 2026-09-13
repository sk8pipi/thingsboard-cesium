import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';
import * as Cesium from 'cesium';
import { parse } from '@vue/compiler-sfc';

const { descriptor } = parse(fs.readFileSync(new URL('../src/views/tb/map/CesiumMap.vue', import.meta.url), 'utf8'));
const source = ts.createSourceFile('map.ts', descriptor.scriptSetup!.content, ts.ScriptTarget.Latest, true);
for (const kind of ['sensor', 'camera']) {
  const functionName = kind === 'sensor' ? 'renderSensorPoints' : 'renderCameraPoints';
  const declaration = source.statements
    .filter(ts.isFunctionDeclaration)
    .find((node) => node.name?.text === functionName)!;
  const entities = new Cesium.EntityCollection();
  let resolved = 0;
  let frames = 0;
  const context = vm.createContext({
    Cesium,
    [kind + 'DataSource']: { entities },
    [kind + 'RenderVersion']: 0,
    [kind + 'RenderKeys']: new Map(),
    [kind + 'LabelDistanceDisplayCondition']: undefined,
    viewer: { scene: { requestRender: () => frames++ } },
    uniquePointsById: (points: any[]) => points,
    getResolvedPointLocation: (point: any) => ({
      longitude: point.longitude,
      latitude: point.latitude,
      height: point.height,
    }),
    pointIsVisible: () => true,
    pointDepthDistance: () => 0,
    getPointLabelText: (point: any) => point.name,
    buildSensorBillboard: (point: any) => point.icon,
    buildCameraBillboard: (point: any) => point.icon,
    getSensorBillboardSize: () => 38,
    getPointScreenScale: () => 1,
    getSensorDeviceType: () => '',
    resolvePositions: async (locations: any[]) => {
      resolved += locations.length;
      return locations.map((point) => Cesium.Cartesian3.fromDegrees(point.longitude, point.latitude, point.height));
    },
  });
  vm.runInContext(
    ts.transpileModule(declaration.getText(source), {
      compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.None },
    }).outputText,
    context,
  );
  const render = context[functionName];
  const point = {
    id: 'p1',
    entityId: 'd1',
    name: '设备',
    longitude: 114,
    latitude: 30,
    height: 5,
    online: true,
    icon: 'image1',
  };
  await render([point]);
  const original = entities.getById(point.id);
  await render([{ ...point, temperature: 22 }]);
  assert.equal(resolved, 1, kind + ' 普通遥测变化不重新采样位置');
  assert.equal(entities.getById(point.id), original);
  await render([{ ...point, icon: 'image2' }]);
  assert.equal(entities.getById(point.id)?.billboard?.image?.getValue(Cesium.JulianDate.now()), 'image2');
  await render([{ ...point, longitude: 115 }]);
  assert.equal(resolved, 3, kind + ' 样式与位置变化更新实体');
  await render([]);
  assert.equal(entities.values.length, 0, kind + ' 移除点位不残留实体');
  assert.ok(frames > 0);
}
console.log('点位渲染：传感器与摄像头均验证等价刷新复用、图标替换、位置更新和移除');
