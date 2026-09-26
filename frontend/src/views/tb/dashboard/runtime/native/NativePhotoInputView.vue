<template>
  <div class="native-photo">
    <img v-if="captured || savedPhoto" :src="captured || savedPhoto" alt="拍照结果" class="native-photo-preview" />
    <p v-else>暂无照片</p>
    <video ref="video" v-show="cameraOn" autoplay muted playsinline class="native-photo-video"></video>
    <canvas ref="canvas" hidden></canvas>
    <p v-if="previewOnly" class="native-photo-note">预览模式：不会打开相机或写入数据</p>
    <p v-if="!validBinding" class="native-photo-error" role="status">请选择一个实体和一个服务端属性或遥测字段</p>
    <div v-else-if="!previewOnly" class="native-photo-actions">
      <button v-if="!cameraOn" type="button" :disabled="busy" @click="startCamera">打开相机</button>
      <template v-else>
        <select
          v-if="cameras.length > 1"
          v-model="selectedCamera"
          aria-label="选择摄像头"
          :disabled="busy"
          @change="startCamera"
        >
          <option v-for="camera in cameras" :key="camera.deviceId" :value="camera.deviceId">{{
            camera.label || '摄像头'
          }}</option>
        </select>
        <button type="button" :disabled="busy" @click="capture">拍照</button>
        <button type="button" :disabled="busy" @click="stopCamera">关闭相机</button>
      </template>
      <button v-if="captured" type="button" :disabled="busy" @click="save">{{ busy ? '保存中…' : '保存照片' }}</button>
      <button v-if="captured" type="button" :disabled="busy" @click="captured = ''">取消照片</button>
    </div>
    <p v-if="message" :class="failed ? 'native-photo-error' : 'native-photo-success'" role="status">{{ message }}</p>
  </div>
</template>

<script setup lang="ts">
  import { computed, nextTick, onBeforeUnmount, ref, watch } from 'vue';
  import {
    getAttributesByScope,
    getLatestTimeseries,
    saveEntityAttributesV1,
    saveEntityTelemetry,
  } from '/@/api/tb/telemetry';
  import { downloadImage, uploadImage } from '/@/api/tb/images';
  import { EntityType } from '/@/enums/entityTypeEnum';
  import { Scope } from '/@/enums/telemetryEnum';
  import type { NativeSeries } from './nativeWidgetDataCore';
  import type { NativePhotoSettings, NativeSource } from './nativeWidgetTypes';
  import { isNativeImageData } from './nativeInputCore';
  import { nativePhotoSize, writeAndReadNativePhoto } from './nativePhotoInputCore';

  const props = defineProps<{
    settings: NativePhotoSettings;
    source: NativeSource;
    series: NativeSeries;
    previewOnly?: boolean;
  }>();
  const emit = defineEmits<{ (event: 'saved'): void }>();
  const video = ref<HTMLVideoElement | null>(null);
  const canvas = ref<HTMLCanvasElement | null>(null);
  const cameras = ref<MediaDeviceInfo[]>([]);
  const selectedCamera = ref('');
  const cameraOn = ref(false);
  const captured = ref('');
  const savedPhoto = ref('');
  const message = ref('');
  const failed = ref(false);
  const busy = ref(false);
  const validBinding = computed(
    () =>
      !!props.source.entityId &&
      (props.series.key.type === 'timeseries' ||
        (props.series.key.type === 'attribute' && props.series.key.scope === 'SERVER_SCOPE')),
  );
  let stream: MediaStream | null = null;
  let cameraRequest = 0;
  let photoRequest = 0;
  let blobUrl = '';
  function stopCamera() {
    cameraRequest++;
    stream?.getTracks().forEach((track) => track.stop());
    stream = null;
    if (video.value) video.value.srcObject = null;
    cameraOn.value = false;
  }
  onBeforeUnmount(() => {
    stopCamera();
    photoRequest++;
    if (blobUrl) URL.revokeObjectURL(blobUrl);
  });
  async function startCamera() {
    if (props.previewOnly || busy.value || !validBinding.value) return;
    stopCamera();
    const request = ++cameraRequest;
    if (!navigator.mediaDevices?.getUserMedia) {
      failed.value = true;
      message.value = '当前浏览器或页面不支持摄像头';
      return;
    }
    try {
      const next = await navigator.mediaDevices.getUserMedia({
        video: selectedCamera.value ? { deviceId: { exact: selectedCamera.value } } : true,
        audio: false,
      });
      if (request !== cameraRequest || props.previewOnly) {
        next.getTracks().forEach((track) => track.stop());
        return;
      }
      stream = next;
      cameraOn.value = true;
      await nextTick();
      if (video.value) {
        video.value.srcObject = next;
        await video.value.play();
      }
      cameras.value = (await navigator.mediaDevices.enumerateDevices()).filter(
        (device) => device.kind === 'videoinput',
      );
      if (request !== cameraRequest) return;
      selectedCamera.value ||= cameras.value[0]?.deviceId || '';
      failed.value = false;
      message.value = '';
    } catch {
      if (request === cameraRequest) {
        stopCamera();
        failed.value = true;
        message.value = '无法打开摄像头，请检查浏览器权限和安全连接';
      }
    }
  }
  function capture() {
    if (props.previewOnly || !cameraOn.value || !video.value || !canvas.value) return;
    try {
      const size = nativePhotoSize(
        video.value.videoWidth,
        video.value.videoHeight,
        props.settings.maxWidth,
        props.settings.maxHeight,
      );
      canvas.value.width = size.width;
      canvas.value.height = size.height;
      canvas.value.getContext('2d')?.drawImage(video.value, 0, 0, size.width, size.height);
      captured.value = canvas.value.toDataURL(props.settings.imageFormat, props.settings.imageQuality);
      if (!isNativeImageData(captured.value) || !captured.value.startsWith(`data:${props.settings.imageFormat};`))
        throw new Error('无法生成指定格式的照片');
      stopCamera();
      failed.value = false;
      message.value = '已拍照，请确认后保存';
    } catch {
      failed.value = true;
      message.value = '拍照失败，请重试';
    }
  }
  function safeImageLink(value: unknown): string | null {
    if (typeof value !== 'string') return null;
    if (isNativeImageData(value)) return value;
    try {
      const url = new URL(value, window.location.origin);
      return url.origin === window.location.origin && url.pathname.startsWith('/api/images/') ? url.pathname : null;
    } catch {
      return null;
    }
  }
  watch(
    () => props.series.latest?.value,
    async (value) => {
      const request = ++photoRequest;
      if (blobUrl) {
        URL.revokeObjectURL(blobUrl);
        blobUrl = '';
      }
      savedPhoto.value = '';
      const link = safeImageLink(value);
      if (!link) return;
      if (link.startsWith('data:image/')) {
        savedPhoto.value = link;
        return;
      }
      try {
        const blob = await downloadImage(link);
        if (request !== photoRequest) return;
        blobUrl = URL.createObjectURL(blob);
        savedPhoto.value = blobUrl;
      } catch {
        /* Keep the camera usable when a stored image is inaccessible. */
      }
    },
    { immediate: true },
  );
  watch(
    () => props.source.entityId,
    () => {
      stopCamera();
      photoRequest++;
      if (blobUrl) {
        URL.revokeObjectURL(blobUrl);
        blobUrl = '';
      }
      savedPhoto.value = '';
      captured.value = '';
      message.value = '';
    },
  );
  async function save() {
    if (props.previewOnly || busy.value || !validBinding.value || !captured.value) return;
    busy.value = true;
    failed.value = false;
    message.value = '';
    const entity = { entityType: props.source.entityType as EntityType, id: props.source.entityId };
    const key = props.series.key.name;
    try {
      let image = captured.value;
      if (props.settings.saveToGallery) {
        if (!canvas.value) throw new Error('照片已失效');
        const blob = await new Promise<Blob>((resolve, reject) =>
          canvas.value!.toBlob(
            (value) => (value ? resolve(value) : reject(new Error('照片编码失败'))),
            props.settings.imageFormat,
            props.settings.imageQuality,
          ),
        );
        if (blob.type !== props.settings.imageFormat) throw new Error('浏览器不支持所选图片格式');
        const uploaded = (await uploadImage(new File([blob], key, { type: props.settings.imageFormat }), key)) as {
          link?: string;
          publicLink?: string;
        };
        image = props.settings.usePublicGalleryLink ? uploaded.publicLink || '' : uploaded.link || '';
        if (!image) throw new Error('图片上传结果缺少链接');
      }
      const saved = await writeAndReadNativePhoto(
        props.series.key.type === 'attribute' ? 'attribute' : 'timeseries',
        key,
        image,
        {
          writeAttribute: (data) => saveEntityAttributesV1(entity, Scope.SERVER_SCOPE, data),
          writeTelemetry: (data) => saveEntityTelemetry(entity, data),
          readAttribute: async (name) => {
            const rows = await getAttributesByScope(entity, Scope.SERVER_SCOPE, { keys: name });
            const row = rows.find((item) => item.key === name);
            if (!row) throw new Error('回读结果缺少照片');
            return row.value;
          },
          readTelemetry: async (name) => {
            const rows = await getLatestTimeseries(entity, name);
            const value = rows[name]?.data?.at(-1)?.value;
            if (value == null) throw new Error('回读结果缺少照片');
            return value;
          },
        },
      );
      savedPhoto.value = isNativeImageData(saved) ? saved : captured.value;
      captured.value = '';
      message.value = '照片已保存并回读';
      emit('saved');
    } catch {
      failed.value = true;
      message.value = '照片保存或回读失败，请检查权限、网络并核对当前值';
    } finally {
      busy.value = false;
    }
  }
</script>

<style scoped>
  .native-photo {
    display: flex;
    flex-direction: column;
    gap: 8px;
    padding: 12px;
    color: #dae9f6;
  }
  .native-photo-preview,
  .native-photo-video {
    max-width: 100%;
    max-height: 240px;
    object-fit: contain;
  }
  .native-photo-actions {
    display: flex;
    flex-wrap: wrap;
    gap: 8px;
  }
  .native-photo button {
    padding: 6px 12px;
    border: 1px solid #92b9d6;
    border-radius: 4px;
    background: #30577f;
    color: #fff;
    cursor: pointer;
  }
  .native-photo button:disabled {
    opacity: 0.55;
    cursor: default;
  }
  .native-photo p {
    margin: 0;
    font-size: 12px;
  }
  .native-photo-note {
    color: #bcd0df;
  }
  .native-photo-error {
    color: #ffc97a;
  }
  .native-photo-success {
    color: #a6e5bc;
  }
</style>
