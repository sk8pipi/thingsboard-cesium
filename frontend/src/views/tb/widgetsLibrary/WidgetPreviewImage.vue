<template>
  <span ref="container" class="widget-preview-image">
    <img v-if="url && !failed" :src="url" :alt="title || '部件预览'" loading="lazy" @error="failed = true" />
    <span v-else class="widget-image-placeholder" role="img" :aria-label="failed ? '预览图加载失败' : '暂无预览图'">
      {{ loading ? '加载中' : failed ? '预览图不可用' : source ? '等待加载' : '暂无预览图' }}
      <button v-if="failed" type="button" @click.stop="loadImage">重试图片</button>
    </span>
  </span>
</template>
<script lang="ts">
  import { imagePreview } from '/@/api/tb/images';
  import { createPreviewImageCache } from './widgetResourceCore';
  const previewImages = createPreviewImageCache(imagePreview);
</script>
<script lang="ts" setup>
  import { onBeforeUnmount, onMounted, ref, watch } from 'vue';
  import { safePreviewSource } from './widgetResourceCore';

  const props = defineProps<{ source?: string; title?: string }>();
  const container = ref<HTMLElement>();
  const url = ref('');
  const failed = ref(false);
  const loading = ref(false);
  let generation = 0;
  let objectUrl = '';
  let releaseRequest: (() => void) | undefined;
  let observer: IntersectionObserver | undefined;
  let visible = false;
  function release() {
    releaseRequest?.();
    releaseRequest = undefined;
    if (objectUrl) URL.revokeObjectURL(objectUrl);
    objectUrl = '';
  }
  async function loadImage() {
    const current = ++generation;
    release();
    url.value = '';
    failed.value = false;
    loading.value = false;
    const source = safePreviewSource(props.source);
    if (!source) {
      failed.value = !!props.source;
      return;
    }
    if (!visible) return;
    if (source.startsWith('data:')) {
      url.value = source;
      return;
    }
    loading.value = true;
    const request = previewImages.acquire(source);
    releaseRequest = request.release;
    try {
      const blob = await request.promise;
      if (current !== generation) return;
      objectUrl = URL.createObjectURL(blob);
      url.value = objectUrl;
    } catch {
      if (current === generation) failed.value = true;
    } finally {
      if (current === generation) loading.value = false;
    }
  }
  watch(() => props.source, loadImage);
  onMounted(() => {
    if (typeof IntersectionObserver === 'undefined') {
      visible = true;
      void loadImage();
      return;
    }
    observer = new IntersectionObserver(
      (entries) => {
        if (!entries.some((entry) => entry.isIntersecting)) return;
        visible = true;
        observer?.disconnect();
        void loadImage();
      },
      { rootMargin: '160px' },
    );
    if (container.value) observer.observe(container.value);
  });
  onBeforeUnmount(() => {
    generation++;
    observer?.disconnect();
    release();
  });
</script>
<style scoped>
  .widget-preview-image {
    display: inline-flex;
    width: 112px;
    height: 80px;
  }
  img,
  .widget-image-placeholder {
    width: 100%;
    height: 100%;
    object-fit: contain;
    border-radius: 6px;
  }
  .widget-image-placeholder {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 6px;
    background: #f1f5f9;
    color: #64748b;
    font-size: 12px;
  }
  button {
    border: 1px solid #94a3b8;
    border-radius: 4px;
    padding: 2px 6px;
    background: white;
    color: #30577e;
    cursor: pointer;
  }
</style>
