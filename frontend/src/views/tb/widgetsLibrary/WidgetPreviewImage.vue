<template>
  <img v-if="url && !failed" :src="url" :alt="title || '部件预览'" loading="lazy" @error="failed = true" />
  <div v-else class="widget-image-placeholder" role="img" :aria-label="failed ? '预览图加载失败' : '暂无预览图'">
    {{ loading ? '加载中' : failed ? '预览图不可用' : '暂无预览图' }}
  </div>
</template>
<script lang="ts" setup>
  import { onBeforeUnmount, ref, watch } from 'vue';
  import { imagePreview } from '/@/api/tb/images';
  import { safePreviewSource } from './widgetResourceCore';

  const props = defineProps<{ source?: string; title?: string }>();
  const url = ref('');
  const failed = ref(false);
  const loading = ref(false);
  let generation = 0;
  let objectUrl = '';
  function release() {
    if (objectUrl) URL.revokeObjectURL(objectUrl);
    objectUrl = '';
  }
  watch(
    () => props.source,
    async (value) => {
      const current = ++generation;
      release();
      url.value = '';
      failed.value = false;
      loading.value = false;
      const source = safePreviewSource(value);
      if (!source) return;
      if (source.startsWith('data:')) {
        url.value = source;
        return;
      }
      loading.value = true;
      try {
        const blob = await imagePreview(source);
        if (current !== generation) return;
        if (!(blob instanceof Blob) || !blob.type.startsWith('image/')) throw new Error('Invalid image response');
        objectUrl = URL.createObjectURL(blob);
        url.value = objectUrl;
      } catch {
        if (current === generation) failed.value = true;
      } finally {
        if (current === generation) loading.value = false;
      }
    },
    { immediate: true },
  );
  onBeforeUnmount(() => {
    generation++;
    release();
  });
</script>
<style scoped>
  img,
  .widget-image-placeholder {
    width: 112px;
    height: 80px;
    object-fit: contain;
    border-radius: 6px;
  }
  .widget-image-placeholder {
    display: flex;
    align-items: center;
    justify-content: center;
    background: #f1f5f9;
    color: #64748b;
    font-size: 12px;
  }
</style>
