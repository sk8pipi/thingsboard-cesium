<template>
  <div class="flex items-center justify-between mb-3">
    <div class="text-lg font-700">{{ title }}</div>

    <div class="flex gap-2">
      <button
        v-if="canEdit && !editMode"
        class="px-3 py-1 border rounded"
        :disabled="loading"
        @click="$emit('enterEdit')"
      >
        编辑模式
      </button>

      <template v-else-if="canEdit">
        <button type="button" class="px-3 py-1 border rounded" :disabled="loading" @click="$emit('openDrawer')">
          部件库
        </button>
        <button type="button" class="px-3 py-1 border rounded" :disabled="loading" @click="$emit('save')">保存</button>
        <button type="button" class="px-3 py-1 border rounded" :disabled="loading" @click="$emit('cancel')">
          取消
        </button>
        <!-- 全屏 -->
        <button class="px-3 py-1 border rounded" :disabled="loading" @click="$emit('toggleFullscreen')">
          {{ isFullscreen ? '退出全屏' : '全屏模式' }}
        </button>
      </template>
    </div>
  </div>
</template>

<script setup lang="ts">
  defineProps<{
    title: string;
    editMode: boolean;
    loading: boolean;
    isFullscreen?: boolean;
    canEdit?: boolean;
  }>();

  defineEmits<{
    (e: 'enterEdit'): void;
    (e: 'save'): void;
    (e: 'cancel'): void;

    (e: 'openDrawer'): void; //  新增：打开部件库抽屉
    (e: 'toggleFullscreen'): void; //  新增：切换全屏
  }>();
</script>
<style scoped>
  /* 顶栏背景与文字 */
  .mb-3 {
    background-color: rgb(22, 100, 145);
    color: #fff;
    padding: 10px 12px;
    border-radius: 8px;
  }

  /* 所有按钮统一样式（你现在按钮都有 border + rounded 类，直接覆盖更省事） */
  .mb-3 button {
    background-color: rgb(22, 100, 145);
    color: #fff;
    border: 1px solid #fff;
  }

  /* hover：可选，让交互更明显 */
  .mb-3 button:hover:not(:disabled) {
    filter: brightness(1.08);
  }

  /* disabled：可选 */
  .mb-3 button:disabled {
    opacity: 0.6;
    cursor: not-allowed;
  }
</style>
