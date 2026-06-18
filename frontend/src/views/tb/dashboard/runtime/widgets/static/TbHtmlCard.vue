<template>
  <div class="tb-card">
    <div
      class="html-card-box"
      :style="{
        backgroundColor,
        color
      }"
    >
      <a-tooltip v-if="showTitle">
        <template #title>
          <span>{{ titleTooltip }}</span>
        </template>
        <div class="html-card-title">
          {{ title }}
        </div>
      </a-tooltip>

      <div class="html-card-content">
        {{ content }}
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import { Tooltip as ATooltip } from 'ant-design-vue';

const props = defineProps<{
  widgetId?: string;
  config?: any;
  data?: any;
}>();

const title = computed(() => props.config?.title || 'HTML Card');
const showTitle = computed(() => props.config?.showTitle !== false);
const titleTooltip = computed(() => props.config?.titleTooltip || '');
const content = computed(() => props.config?.content || '');
const color = computed(() => props.config?.color || 'rgba(0,0,0,0.85)');
const backgroundColor = computed(() => props.config?.backgroundColor || '#fff');
</script>

<style scoped>
.tb-card {
  width: 100%;
  height: 100%;
  box-sizing: border-box;
  display: flex;
  flex-direction: column;
}

.html-card-box {
  width: 100%;
  height: 100%;
  padding: 20px;
  box-sizing: border-box;
  border-radius: 10px;
  box-shadow: 0 4px 10px 0 rgba(0, 0, 0, 0.15);
}

.html-card-title {
  font-size: 16px;
  font-weight: 600;
}

.html-card-content {
  margin-top: 20px;
  font-size: 18px;
  font-weight: 700;
}
</style>