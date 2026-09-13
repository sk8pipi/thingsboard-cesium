import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';
import { resolveProfilePointStyle } from '../src/views/tb/map/services/deviceProfilePresentation';
import { buildSensorPointBillboard } from '../src/views/tb/map/services/sensorPointStyleService';

// 执行真实缓存函数，替换浏览器图片/画布与认证下载边界，不发送网络请求。
const source = ts.createSourceFile(
  'cache.ts',
  fs.readFileSync(new URL('../src/views/tb/map/services/profileBillboardCache.ts', import.meta.url), 'utf8'),
  ts.ScriptTarget.Latest,
  true,
);
const declaration = source.statements
  .filter(ts.isFunctionDeclaration)
  .find((node) => node.name?.text === 'createProfileBillboardCache')!;
let downloads = 0;
let ready = 0;
let revoked = 0;
let rejectDownload = false;
const imageLoads: Array<() => void> = [];
class MockImage {
  width = 100;
  height = 50;
  onload!: () => void;
  set src(_value: string) {
    imageLoads.push(() => this.onload());
  }
}
const ctx = vm.createContext({
  buildSensorPointBillboard,
  downloadImage: async () => {
    downloads++;
    if (rejectDownload) throw new Error('403');
    return {};
  },
  URL: { createObjectURL: () => 'blob:test', revokeObjectURL: () => revoked++ },
  Image: MockImage,
  document: {
    createElement: () => ({
      getContext: () => ({ beginPath() {}, arc() {}, fill() {}, drawImage() {} }),
      toDataURL: () => 'data:image/png;base64,ready',
    }),
  },
});
vm.runInContext(
  ts.transpileModule(declaration.getText(source).replace(/^export /, ''), {
    compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.None },
  }).outputText,
  ctx,
);
const flush = async () => {
  for (let i = 0; i < 12; i++) await Promise.resolve();
};
const style = resolveProfilePointStyle({
  deviceProfileId: 'p1',
  deviceProfileName: 'temperature',
  deviceProfileImage: '/api/images/tenant/image.png',
});
const cache = ctx.createProfileBillboardCache(() => ready++);
const fallback = cache.get(style, true);
assert.equal(fallback, buildSensorPointBillboard(style, true));
cache.get(style, true);
cache.get(style, false);
await flush();
assert.equal(downloads, 1, '在线离线样式共享同一次认证图片下载');
imageLoads.splice(0).forEach((load) => load());
await flush();
assert.equal(ready, 2);
assert.equal(revoked, 1, '及时释放 Blob URL');
assert.equal(cache.get(style, true), 'data:image/png;base64,ready');
cache.dispose();

rejectDownload = true;
const failed = ctx.createProfileBillboardCache(() => ready++);
failed.get(style, true);
await flush();
const afterFailure = downloads;
assert.equal(failed.get(style, false), buildSensorPointBillboard(style, false));
await flush();
assert.equal(downloads, afterFailure, '失败降级且不循环请求');
failed.dispose();

rejectDownload = false;
const late = ctx.createProfileBillboardCache(() => ready++);
late.get(style, true);
await flush();
late.dispose();
const beforeLate = ready;
imageLoads.splice(0).forEach((load) => load());
await flush();
assert.equal(ready, beforeLate, '卸载后图片完成不再触发渲染');
console.log('配置图片：认证下载去重、异步替换、失败回退与卸载释放通过');
