import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';
import { ContentTypeEnum } from '../src/enums/httpEnum';
import { readDeviceLocation } from '../src/views/tb/map/services/globalDeviceLocation';
import type { MapPoint } from '../src/views/tb/map/types/mapPointTypes';

const source = fs.readFileSync(
  new URL('../src/views/tb/map/services/mapDeviceLocationService.ts', import.meta.url),
  'utf8',
);
const file = ts.createSourceFile('mapDeviceLocationService.ts', source, ts.ScriptTarget.Latest, true);
const save = file.statements.find(
  (statement): statement is ts.FunctionDeclaration =>
    ts.isFunctionDeclaration(statement) && statement.name?.text === 'saveMapDeviceLocation',
);
assert.ok(save);

let request: { url: string; headers: Record<string, string>; data: Record<string, number> } | undefined;
const location = {
  longitude: 114,
  latitude: 30,
  height: 10,
  heightMode: 'absolute',
  revision: 4,
  updatedTime: 1,
  source: 'confirmed',
};
const compiled = ts.transpileModule(save.getText(file).replace(/^export\s+/, ''), {
  compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.None },
}).outputText;
const context = vm.createContext({
  ContentTypeEnum,
  readDeviceLocation,
  defHttp: {
    put: async (config: typeof request) => {
      request = config;
      return { location, attributesSynced: true };
    },
  },
  result: {},
});
vm.runInContext(`${compiled}\nresult.saveMapDeviceLocation = saveMapDeviceLocation;`, context);
const saveMapDeviceLocation = (context.result as { saveMapDeviceLocation: (point: MapPoint) => Promise<unknown> })
  .saveMapDeviceLocation;

const point = {
  entityId: 'device/1',
  longitude: 114,
  latitude: 30,
  height: 10,
  locationRevision: 3,
} as MapPoint;
const result = await saveMapDeviceLocation(point);
assert.equal(request?.url, '/api/map-device/device%2F1/location');
assert.equal(request?.headers['content-type'], ContentTypeEnum.JSON, '位置 PUT 必须覆盖全局表单请求头');
assert.equal(request?.data.expectedRevision, 3);
assert.equal((result as { attributesSynced: boolean }).attributesSynced, true);

request = undefined;
await assert.rejects(saveMapDeviceLocation({ ...point, locationRevision: undefined }));
assert.equal(request, undefined, '缺少已读取版本时不发送写入请求');
console.log('设备位置 PUT 使用 JSON 请求体与版本检查测试通过');
