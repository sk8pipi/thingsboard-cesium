import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import vm from 'node:vm';
import ts from 'typescript';
import * as vue from 'vue';
import { parse, compileScript } from '@vue/compiler-sfc';
import { createNativeWidget, validateNativeWidget } from '../src/views/tb/dashboard/runtime/native/nativeWidgetCatalog';
import {
  nativePhotoSize,
  nativePhotoSpec,
  validateNativePhotoSettings,
  writeAndReadNativePhoto,
} from '../src/views/tb/dashboard/runtime/native/nativePhotoInputCore';

const original = JSON.parse(
  readFileSync(
    resolve('../backend/application/src/main/data/json/system/widget_types/photo_camera_input.json'),
    'utf8',
  ),
);
const widget = createNativeWidget(original);
assert.equal(nativePhotoSpec(original.fqn), true);
assert.equal(nativePhotoSpec('input_widgets.other'), false);
assert.equal(widget.config.native.family, 'photoInput');
assert.equal(widget.config.native.photoInput.saveToGallery, true);
assert.equal(widget.config.native.photoInput.usePublicGalleryLink, false);
widget.config.datasources = [
  {
    type: 'entity',
    entityType: 'DEVICE',
    entityId: 'camera-test',
    dataKeys: [{ name: 'photo', type: 'attribute', scope: 'SERVER_SCOPE' }],
  },
];
widget.config.native.photoInput.imageFormat = 'image/jpeg';
widget.config.native.photoInput.maxWidth = 800;
widget.config.native.photoInput.saveToGallery = false;
assert.deepEqual(validateNativeWidget(widget), []);
const reopened = createNativeWidget(JSON.parse(JSON.stringify(widget)));
assert.equal(reopened.config.native.photoInput.imageFormat, 'image/jpeg');
assert.equal(reopened.config.native.photoInput.maxWidth, 800);
assert.equal(reopened.config.native.photoInput.saveToGallery, false);
assert.deepEqual(validateNativeWidget(reopened), []);
const invalid = JSON.parse(JSON.stringify(widget));
invalid.config.datasources[0].dataKeys[0].scope = 'SHARED_SCOPE';
assert.match(validateNativeWidget(invalid).join(','), /遥测或服务端属性/);
invalid.config.native.photoInput.imageQuality = 2;
assert.match(validateNativeWidget(invalid).join(','), /图片质量/);
assert.deepEqual(validateNativePhotoSettings(widget.config.native.photoInput), []);
assert.deepEqual(nativePhotoSize(1920, 1080, 640, 480), { width: 640, height: 360 });
assert.deepEqual(nativePhotoSize(320, 240, 640, 480), { width: 320, height: 240 });
assert.throws(() => nativePhotoSize(0, 240, 640, 480), /尺寸/);

const calls: string[] = [];
const transport = {
  writeAttribute: async (data: Record<string, unknown>) => {
    calls.push(`attribute:${JSON.stringify(data)}`);
  },
  writeTelemetry: async (data: Record<string, unknown>) => {
    calls.push(`telemetry:${JSON.stringify(data)}`);
  },
  readAttribute: async (key: string) => {
    calls.push(`read-attribute:${key}`);
    return 'photo-url';
  },
  readTelemetry: async (key: string) => {
    calls.push(`read-telemetry:${key}`);
    return 'photo-url';
  },
};
assert.equal(await writeAndReadNativePhoto('attribute', 'photo', 'data:image/png;base64,YQ==', transport), 'photo-url');
assert.deepEqual(calls.splice(0), ['attribute:{"photo":"data:image/png;base64,YQ=="}', 'read-attribute:photo']);
assert.equal(await writeAndReadNativePhoto('timeseries', 'photo', 'photo-url', transport), 'photo-url');
assert.deepEqual(calls.splice(0), ['telemetry:{"photo":"photo-url"}', 'read-telemetry:photo']);
const viewSource = readFileSync(
  new URL('../src/views/tb/dashboard/runtime/native/NativePhotoInputView.vue', import.meta.url),
  'utf8',
);
const script = compileScript(parse(viewSource).descriptor, { id: 'native-photo-input-test' });
const output = ts.transpileModule(script.content, {
  compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS },
}).outputText;
let cameraCalls = 0;
let stopped = 0;
let onUnmount = () => {};
const context = vm.createContext({
  exports: {},
  navigator: {
    mediaDevices: {
      getUserMedia: async () => {
        cameraCalls++;
        return { getTracks: () => [{ stop: () => stopped++ }] };
      },
      enumerateDevices: async () => [{ kind: 'videoinput', deviceId: 'camera-1', label: 'Camera 1' }],
    },
  },
  require: (name: string) => {
    if (name === 'vue')
      return {
        ...vue,
        onBeforeUnmount: (callback: () => void) => {
          onUnmount = callback;
        },
      };
    if (
      name === '/@/api/tb/telemetry' ||
      name === '/@/api/tb/images' ||
      name === '/@/enums/entityTypeEnum' ||
      name === '/@/enums/telemetryEnum'
    )
      return {};
    if (name === './nativeInputCore') return { isNativeImageData: () => false };
    if (name === './nativePhotoInputCore') return { nativePhotoSize, writeAndReadNativePhoto };
    throw new Error(`Unexpected import: ${name}`);
  },
});
vm.runInContext(output, context);
const props = vue.reactive({
  settings: widget.config.native.photoInput,
  source: widget.config.datasources[0],
  series: { key: widget.config.datasources[0].dataKeys[0], latest: undefined },
  previewOnly: true,
});
const scope = vue.effectScope();
const state = scope.run(() => context.exports.default.setup(props, { expose() {}, emit() {} }));
await state.startCamera();
assert.equal(cameraCalls, 0, 'preview must not request camera permission');
props.previewOnly = false;
await state.startCamera();
assert.equal(cameraCalls, 1);
assert.equal(state.cameraOn.value, true);
state.stopCamera();
assert.equal(stopped, 1);
onUnmount();
scope.stop();
console.log('Native camera input: config roundtrip, binding, image size and write/read routing passed');
