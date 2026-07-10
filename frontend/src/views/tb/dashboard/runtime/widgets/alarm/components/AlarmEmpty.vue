<template>
  <div class="alarm-empty">
    <div class="alarm-empty__icon">🔔</div>
    <div class="alarm-empty__text">{{ text }}</div>
  </div>
</template>

<script setup lang="ts">
withDefaults(
  defineProps<{
    text?: string;
  }>(),
  {
    text: '暂无报警数据',
  }
);
</script>

<style scoped>
.alarm-empty {
  width: 100%;
  height: 100%;
  min-height: 0;
  flex: 1 1 auto;
  box-sizing: border-box;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  color: #8c8c8c;
}
.alarm-empty__icon {
  font-size: 32px;
  margin-bottom: 8px;
}
.alarm-empty__text {
  font-size: 14px;
}
</style>