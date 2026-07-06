<template>
  <Teleport to="body">
    <div v-if="visible" class="point-export-mask" @click.self="close">
      <section class="point-export-dialog" role="dialog" aria-modal="true" aria-label="导出点位数据">
        <header class="point-export-header">
          <div>
            <h3>导出点位数据</h3>
            <p>{{ sensor?.name || sensor?.entityName || '当前点位' }}</p>
          </div>
          <button class="point-export-close" type="button" :disabled="exporting" @click="close">关闭</button>
        </header>

        <div class="point-export-body">
          <section class="point-export-section">
            <h4>数据范围</h4>
            <div class="point-export-options">
              <label v-for="option in rangeOptions" :key="option.value" class="point-export-radio">
                <input v-model="rangeType" type="radio" :value="option.value" />
                <span>{{ option.label }}</span>
              </label>
            </div>

            <div v-if="rangeType === 'custom'" class="point-export-custom-range">
              <label>
                <span>开始时间</span>
                <input v-model="customStart" type="datetime-local" />
              </label>
              <label>
                <span>结束时间</span>
                <input v-model="customEnd" type="datetime-local" />
              </label>
            </div>
            <p class="point-export-hint">单次最多导出 7 天、50000 条遥测数据。</p>
          </section>

          <section class="point-export-section">
            <h4>导出内容</h4>
            <div class="point-export-content-grid">
              <label><input v-model="content.pointInfo" type="checkbox" /> 点位信息</label>
              <label><input v-model="content.history" type="checkbox" /> 遥测历史</label>
              <label><input v-model="content.latest" type="checkbox" /> 最新值</label>
              <label><input v-model="content.alarms" type="checkbox" /> 告警记录</label>
            </div>
          </section>

          <section v-if="content.history || content.latest" class="point-export-section">
            <div class="point-export-section-title">
              <h4>选择指标</h4>
              <div>
                <button type="button" @click="selectAllKeys">全选</button>
                <button type="button" @click="selectedKeyIds = []">清空</button>
              </div>
            </div>

            <div v-if="availableKeys.length" class="point-export-key-list">
              <label v-for="key in availableKeys" :key="key.id" class="point-export-key-row">
                <input v-model="selectedKeyIds" type="checkbox" :value="key.id" />
                <span class="point-export-key-main">
                  <strong>{{ key.label }}</strong>
                  <code>{{ key.name }}</code>
                </span>
                <span class="point-export-key-source">{{ key.sourceTitles.join('、') }}</span>
              </label>
            </div>
            <div v-else class="point-export-empty">当前详情页没有可导出的遥测 Key。</div>
          </section>

          <section class="point-export-section">
            <h4>文件名</h4>
            <input v-model.trim="filename" class="point-export-filename" type="text" maxlength="120" />
          </section>

          <div v-if="error" class="point-export-error">{{ error }}</div>
        </div>

        <footer class="point-export-footer">
          <button type="button" :disabled="exporting" @click="close">取消</button>
          <button class="primary" type="button" :disabled="!canExport || exporting" @click="handleExport">
            {{ exporting ? '正在生成…' : '导出 Excel' }}
          </button>
        </footer>
      </section>
    </div>
  </Teleport>
</template>

<script setup lang="ts">
  import { computed, reactive, ref, watch } from 'vue';
  import type { DashboardWidget } from '../dashboard/runtime/types';
  import { collectPointExportKeys, exportPointData, type PointExportContent } from './services/pointDataExportService';

  type RangeType = 'hour' | 'day' | 'week' | 'custom';

  const props = defineProps<{
    visible: boolean;
    sensor?: Record<string, any> | null;
    widgets: DashboardWidget[];
  }>();

  const emit = defineEmits<{
    (event: 'close'): void;
  }>();

  const rangeOptions: Array<{ value: RangeType; label: string }> = [
    { value: 'hour', label: '最近 1 小时' },
    { value: 'day', label: '最近 24 小时' },
    { value: 'week', label: '最近 7 天' },
    { value: 'custom', label: '自定义' },
  ];

  const rangeType = ref<RangeType>('day');
  const customStart = ref('');
  const customEnd = ref('');
  const selectedKeyIds = ref<string[]>([]);
  const filename = ref('');
  const exporting = ref(false);
  const error = ref('');
  const content = reactive<PointExportContent>({
    pointInfo: true,
    history: true,
    latest: true,
    alarms: false,
  });

  const availableKeys = computed(() => collectPointExportKeys(props.sensor, props.widgets));
  const selectedKeys = computed(() => {
    const selected = new Set(selectedKeyIds.value);
    return availableKeys.value.filter((key) => selected.has(key.id));
  });
  const hasSelectedContent = computed(() => Object.values(content).some(Boolean));
  const needsKeys = computed(() => content.history || content.latest);
  const canExport = computed(() =>
    Boolean(props.sensor && hasSelectedContent.value && (!needsKeys.value || selectedKeys.value.length)),
  );

  function pad(value: number) {
    return String(value).padStart(2, '0');
  }

  function toLocalInput(timestamp: number) {
    const date = new Date(timestamp);
    return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(
      date.getMinutes(),
    )}`;
  }

  function defaultFilename() {
    const now = new Date();
    const timestamp = `${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(now.getDate())}_${pad(now.getHours())}${pad(
      now.getMinutes(),
    )}${pad(now.getSeconds())}`;
    return `${props.sensor?.name || props.sensor?.entityName || '点位数据'}_${timestamp}.xlsx`;
  }

  function resetForm() {
    const now = Date.now();
    rangeType.value = 'day';
    customStart.value = toLocalInput(now - 24 * 60 * 60 * 1000);
    customEnd.value = toLocalInput(now);
    content.pointInfo = true;
    content.history = true;
    content.latest = true;
    content.alarms = false;
    filename.value = defaultFilename();
    error.value = '';
    selectAllKeys();
  }

  function selectAllKeys() {
    selectedKeyIds.value = availableKeys.value.map((key) => key.id);
  }

  function resolveRange() {
    const endTs = rangeType.value === 'custom' ? new Date(customEnd.value).getTime() : Date.now();
    const durationMap: Record<Exclude<RangeType, 'custom'>, number> = {
      hour: 60 * 60 * 1000,
      day: 24 * 60 * 60 * 1000,
      week: 7 * 24 * 60 * 60 * 1000,
    };
    const startTs =
      rangeType.value === 'custom'
        ? new Date(customStart.value).getTime()
        : endTs - durationMap[rangeType.value as Exclude<RangeType, 'custom'>];
    if (!Number.isFinite(startTs) || !Number.isFinite(endTs)) throw new Error('请选择有效的开始和结束时间。');
    return { startTs, endTs };
  }

  function close() {
    if (exporting.value) return;
    emit('close');
  }

  async function handleExport() {
    if (!canExport.value || !props.sensor) return;
    exporting.value = true;
    error.value = '';
    try {
      const range = resolveRange();
      await exportPointData({
        sensor: props.sensor,
        keys: selectedKeys.value,
        ...range,
        content: { ...content },
        filename: filename.value,
      });
      emit('close');
    } catch (reason: any) {
      error.value = reason?.message || String(reason);
    } finally {
      exporting.value = false;
    }
  }

  watch(
    () => [props.visible, props.sensor?.id, props.widgets],
    () => {
      if (props.visible) resetForm();
    },
    { deep: true },
  );
</script>

<style scoped>
  .point-export-mask {
    position: fixed;
    inset: 0;
    z-index: 10020;
    display: flex;
    align-items: center;
    justify-content: center;
    padding: 20px;
    background: rgba(0, 0, 0, 0.58);
  }

  .point-export-dialog {
    width: min(680px, 96vw);
    max-height: min(780px, 92vh);
    overflow: hidden;
    border: 1px solid rgba(255, 255, 255, 0.18);
    border-radius: 14px;
    background: rgba(25, 30, 40, 0.98);
    color: #fff;
    box-shadow: 0 24px 80px rgba(0, 0, 0, 0.42);
  }

  .point-export-header,
  .point-export-footer {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 12px;
    padding: 14px 16px;
    border-bottom: 1px solid rgba(255, 255, 255, 0.1);
  }

  .point-export-header h3,
  .point-export-section h4 {
    margin: 0;
  }

  .point-export-header h3 {
    font-size: 16px;
  }

  .point-export-header p,
  .point-export-hint {
    margin: 4px 0 0;
    color: rgba(255, 255, 255, 0.62);
    font-size: 12px;
  }

  .point-export-body {
    display: grid;
    gap: 14px;
    max-height: calc(92vh - 132px);
    overflow: auto;
    padding: 16px;
  }

  .point-export-section {
    display: grid;
    gap: 10px;
  }

  .point-export-section h4 {
    font-size: 13px;
  }

  .point-export-options,
  .point-export-content-grid {
    display: flex;
    flex-wrap: wrap;
    gap: 8px 18px;
  }

  .point-export-radio,
  .point-export-content-grid label {
    display: flex;
    align-items: center;
    gap: 6px;
    font-size: 13px;
  }

  .point-export-custom-range {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 10px;
  }

  .point-export-custom-range label {
    display: grid;
    gap: 5px;
    color: rgba(255, 255, 255, 0.72);
    font-size: 12px;
  }

  .point-export-custom-range input,
  .point-export-filename {
    box-sizing: border-box;
    width: 100%;
    border: 1px solid rgba(255, 255, 255, 0.2);
    border-radius: 8px;
    background: rgba(255, 255, 255, 0.07);
    color: #fff;
    padding: 8px 10px;
    color-scheme: dark;
  }

  .point-export-section-title {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 12px;
  }

  .point-export-section-title div {
    display: flex;
    gap: 6px;
  }

  .point-export-section-title button {
    border: 0;
    background: transparent;
    color: #7dd3fc;
    cursor: pointer;
    font-size: 12px;
  }

  .point-export-key-list {
    max-height: 230px;
    overflow: auto;
    border: 1px solid rgba(255, 255, 255, 0.12);
    border-radius: 10px;
  }

  .point-export-key-row {
    display: grid;
    grid-template-columns: auto minmax(150px, 1fr) minmax(120px, 0.8fr);
    align-items: center;
    gap: 10px;
    padding: 9px 10px;
    border-bottom: 1px solid rgba(255, 255, 255, 0.08);
    cursor: pointer;
  }

  .point-export-key-row:last-child {
    border-bottom: 0;
  }

  .point-export-key-main {
    display: flex;
    min-width: 0;
    align-items: baseline;
    gap: 8px;
  }

  .point-export-key-main strong {
    overflow: hidden;
    font-size: 13px;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .point-export-key-main code,
  .point-export-key-source {
    overflow: hidden;
    color: rgba(255, 255, 255, 0.58);
    font-size: 11px;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .point-export-empty,
  .point-export-error {
    padding: 10px 12px;
    border-radius: 8px;
    background: rgba(255, 255, 255, 0.06);
    color: rgba(255, 255, 255, 0.68);
    font-size: 12px;
  }

  .point-export-error {
    background: rgba(220, 38, 38, 0.18);
    color: #fecaca;
  }

  .point-export-footer {
    justify-content: flex-end;
    border-top: 1px solid rgba(255, 255, 255, 0.1);
    border-bottom: 0;
  }

  .point-export-close,
  .point-export-footer button {
    border: 1px solid rgba(255, 255, 255, 0.24);
    border-radius: 8px;
    background: rgba(255, 255, 255, 0.08);
    color: #fff;
    padding: 8px 12px;
    cursor: pointer;
  }

  .point-export-footer button.primary {
    border-color: rgba(56, 189, 248, 0.55);
    background: rgba(14, 116, 144, 0.9);
  }

  .point-export-close:disabled,
  .point-export-footer button:disabled {
    cursor: not-allowed;
    opacity: 0.48;
  }

  @media (max-width: 600px) {
    .point-export-custom-range {
      grid-template-columns: 1fr;
    }

    .point-export-key-row {
      grid-template-columns: auto minmax(0, 1fr);
    }

    .point-export-key-source {
      display: none;
    }
  }
</style>
