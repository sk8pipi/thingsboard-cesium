<template>
  <div class="template-status-distribution">
    <div class="template-status-distribution__donut" :style="donutStyle">
      <strong>{{ summary.total }}</strong>
      <span>设备</span>
    </div>
    <div class="template-status-distribution__legend">
      <div
        ><i class="is-online"></i><span>正常在线</span><strong>{{ normalOnline }}</strong></div
      >
      <div
        ><i class="is-abnormal"></i><span>异常在线</span><strong>{{ summary.abnormal }}</strong></div
      >
      <div
        ><i class="is-offline"></i><span>离线</span><strong>{{ summary.offline }}</strong></div
      >
      <div
        ><i class="is-unknown"></i><span>未知</span><strong>{{ summary.unknown }}</strong></div
      >
    </div>
  </div>
</template>

<script setup lang="ts">
  import { computed, type CSSProperties } from 'vue';
  import { summarizeTemplateDevices, type TemplateRuntimeDevices } from './templateAggregate';

  const props = defineProps<{ ctx?: { runtimeDevices?: TemplateRuntimeDevices | null } }>();
  const summary = computed(() => summarizeTemplateDevices(props.ctx?.runtimeDevices));
  const normalOnline = computed(() => Math.max(0, summary.value.online - summary.value.abnormal));
  const donutStyle = computed<CSSProperties>(() => {
    const total = summary.value.total || 1;
    const onlineEnd = (normalOnline.value / total) * 360;
    const abnormalEnd = onlineEnd + (summary.value.abnormal / total) * 360;
    const offlineEnd = abnormalEnd + (summary.value.offline / total) * 360;
    return {
      background: `conic-gradient(#22c55e 0deg ${onlineEnd}deg, #ef4444 ${onlineEnd}deg ${abnormalEnd}deg, #64748b ${abnormalEnd}deg ${offlineEnd}deg, #eab308 ${offlineEnd}deg 360deg)`,
    };
  });
</script>

<style scoped>
  .template-status-distribution {
    width: 100%;
    height: 100%;
    display: grid;
    grid-template-columns: minmax(130px, 1fr) minmax(120px, 0.8fr);
    align-items: center;
    gap: 16px;
  }

  .template-status-distribution__donut {
    position: relative;
    width: min(160px, 90%);
    aspect-ratio: 1;
    justify-self: center;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    border-radius: 50%;
    box-shadow: 0 0 32px rgba(56, 189, 248, 0.12);
  }

  .template-status-distribution__donut::after {
    position: absolute;
    inset: 18%;
    border-radius: 50%;
    background: rgba(4, 20, 34, 0.9);
    content: '';
  }

  .template-status-distribution__donut strong,
  .template-status-distribution__donut span {
    position: relative;
    z-index: 1;
  }

  .template-status-distribution__donut strong {
    color: #e0f2fe;
    font-size: 32px;
    line-height: 1;
  }

  .template-status-distribution__donut span {
    margin-top: 5px;
    color: rgba(226, 242, 255, 0.58);
    font-size: 11px;
  }

  .template-status-distribution__legend {
    display: grid;
    gap: 10px;
  }

  .template-status-distribution__legend div {
    display: grid;
    grid-template-columns: 10px 1fr auto;
    align-items: center;
    gap: 8px;
    color: rgba(226, 242, 255, 0.72);
    font-size: 12px;
  }

  .template-status-distribution__legend i {
    width: 8px;
    height: 8px;
    border-radius: 50%;
  }

  .template-status-distribution__legend i.is-online {
    background: #22c55e;
  }
  .template-status-distribution__legend i.is-abnormal {
    background: #ef4444;
  }
  .template-status-distribution__legend i.is-offline {
    background: #64748b;
  }
  .template-status-distribution__legend i.is-unknown {
    background: #eab308;
  }

  .template-status-distribution__legend strong {
    color: #e0f2fe;
    font-size: 18px;
  }
</style>
