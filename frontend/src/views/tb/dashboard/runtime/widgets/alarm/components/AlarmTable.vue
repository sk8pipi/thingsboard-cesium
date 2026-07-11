<template>
  <div class="alarm-table-wrap" :class="{ 'is-dense': settings?.dense }">
    <div v-if="loading" class="alarm-table-wrap__loading">&#x52A0;&#x8F7D;&#x4E2D;...</div>

    <template v-else>
      <AlarmEmpty v-if="!rows.length && !error" />
      <AlarmEmpty v-else-if="!rows.length && error" :text="error" />

      <template v-else>
        <div ref="headerRef" class="alarm-table__header">
          <table class="alarm-table">
            <colgroup>
              <col class="alarm-table__col-severity" />
              <col class="alarm-table__col-time" />
              <col class="alarm-table__col-originator" />
              <col class="alarm-table__col-type" />
              <col class="alarm-table__col-content" />
              <col class="alarm-table__col-status" />
            </colgroup>
            <thead>
              <tr>
                <th>&#x7EA7;&#x522B;</th>
                <th>&#x65F6;&#x95F4;</th>
                <th>&#x8BBE;&#x5907;/&#x70B9;&#x4F4D;</th>
                <th>&#x544A;&#x8B66;&#x7C7B;&#x578B;</th>
                <th>&#x544A;&#x8B66;&#x5185;&#x5BB9;</th>
                <th>&#x72B6;&#x6001;</th>
              </tr>
            </thead>
          </table>
        </div>

        <div
          ref="viewportRef"
          class="alarm-table__viewport"
          @mouseenter="pauseAutoScroll"
          @mouseleave="resumeAutoScroll"
          @focusin="pauseAutoScroll"
          @focusout="resumeAutoScroll"
          @scroll="syncHeaderScroll"
        >
          <table class="alarm-table">
            <colgroup>
              <col class="alarm-table__col-severity" />
              <col class="alarm-table__col-time" />
              <col class="alarm-table__col-originator" />
              <col class="alarm-table__col-type" />
              <col class="alarm-table__col-content" />
              <col class="alarm-table__col-status" />
            </colgroup>
            <tbody v-for="copyIndex in loopCopies" :key="copyIndex" :data-copy-index="copyIndex">
              <tr
                v-for="item in rows"
                :key="`${copyIndex}-${item.id}`"
                :data-alarm-id="item.id"
                class="alarm-table__row"
                @click="emit('focus', item)"
              >
                <td><AlarmSeverityTag :severity="item.severity" /></td>
                <td class="alarm-table__time">{{ formatAlarmTime(item.createdTime) }}</td>
                <td class="alarm-table__truncate" :title="getOriginatorName(item)">
                  {{ getOriginatorName(item) }}
                </td>
                <td class="alarm-table__truncate" :title="item.type || '-'">{{ item.type || '-' }}</td>
                <td class="alarm-table__truncate" :title="formatAlarmContent(item)">
                  {{ formatAlarmContent(item) }}
                </td>
                <td class="alarm-table__status-cell">
                  <div class="alarm-table__status-content">
                    <AlarmStatusTag :status="item.status" />
                    <button
                      v-if="settings.showAck && canAckAlarm(item)"
                      class="alarm-table__status-ack"
                      type="button"
                      @click.stop="emit('ack', item)"
                    >
                      &#x786E;&#x8BA4;
                    </button>
                  </div>
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </template>
    </template>
  </div>
</template>

<script setup lang="ts">
  import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue';
  import type { AlarmItem, AlarmWidgetSettings } from '../types';
  import AlarmStatusTag from './AlarmStatusTag.vue';
  import AlarmSeverityTag from './AlarmSeverityTag.vue';
  import AlarmEmpty from './AlarmEmpty.vue';
  import { canAckAlarm, formatAlarmContent, formatAlarmTime } from '../utils';

  const props = defineProps<{
    rows: AlarmItem[];
    loading: boolean;
    error?: string;
    settings: AlarmWidgetSettings;
  }>();

  const emit = defineEmits<{
    (e: 'ack', item: AlarmItem): void;
    (e: 'focus', item: AlarmItem): void;
  }>();

  const headerRef = ref<HTMLElement>();
  const viewportRef = ref<HTMLElement>();
  const shouldLoop = ref(false);
  const isPointerInside = ref(false);
  const loopCopies = computed(() => (shouldLoop.value ? [0, 1] : [0]));

  let resizeObserver: ResizeObserver | undefined;
  let autoScrollTimer: number | undefined;
  let resetScrollTimer: number | undefined;
  let isResetting = false;

  interface ScrollAnchor {
    id: string;
    offset: number;
    secondCopy: boolean;
  }

  function getOriginatorName(item: AlarmItem) {
    return item.originator?.name || item.originator?.label || '-';
  }

  function getRowHeight() {
    const row = viewportRef.value?.querySelector('tbody tr');
    return row instanceof HTMLElement ? row.offsetHeight : 0;
  }

  function captureScrollAnchor(): ScrollAnchor | undefined {
    const viewport = viewportRef.value;
    const rowHeight = getRowHeight();
    if (!viewport || !rowHeight) return undefined;

    const renderedRows = viewport.querySelectorAll<HTMLTableRowElement>('tbody tr');
    const rowIndex = Math.floor(viewport.scrollTop / rowHeight);
    const row = renderedRows[rowIndex];
    const id = row?.dataset.alarmId;
    if (!id) return undefined;

    return {
      id,
      offset: viewport.scrollTop % rowHeight,
      secondCopy: row.parentElement?.dataset.copyIndex === '1',
    };
  }

  function restoreScrollAnchor(anchor?: ScrollAnchor) {
    const viewport = viewportRef.value;
    const rowHeight = getRowHeight();
    if (!viewport || !rowHeight || !anchor || !props.rows.length) return;

    const rowIndex = props.rows.findIndex((item) => item.id === anchor.id);
    if (rowIndex < 0) return;

    if (resetScrollTimer) {
      window.clearTimeout(resetScrollTimer);
      resetScrollTimer = undefined;
      isResetting = false;
    }

    const copyOffset = shouldLoop.value && anchor.secondCopy ? rowHeight * props.rows.length : 0;
    viewport.scrollTop = copyOffset + rowIndex * rowHeight + anchor.offset;
  }

  function syncHeaderScroll() {
    const header = headerRef.value;
    const viewport = viewportRef.value;
    if (!header || !viewport) return;

    header.scrollLeft = viewport.scrollLeft;
    header.style.paddingRight = `${Math.max(0, viewport.offsetWidth - viewport.clientWidth)}px`;
  }

  function updateLoopState() {
    const viewport = viewportRef.value;
    const rowHeight = getRowHeight();

    if (!viewport || !rowHeight || !props.rows.length) {
      shouldLoop.value = false;
      return;
    }

    const hasOverflow = rowHeight * props.rows.length > viewport.clientHeight + 1;
    shouldLoop.value = hasOverflow;

    if (!hasOverflow) viewport.scrollTop = 0;
  }

  function scheduleLoopStateUpdate(anchor?: ScrollAnchor) {
    void nextTick(() => {
      updateLoopState();
      restoreScrollAnchor(anchor);
    });
  }

  function stopAutoScroll() {
    if (autoScrollTimer) {
      window.clearInterval(autoScrollTimer);
      autoScrollTimer = undefined;
    }
    if (resetScrollTimer) {
      window.clearTimeout(resetScrollTimer);
      resetScrollTimer = undefined;
    }
    isResetting = false;
  }

  function scrollToNextRow() {
    const viewport = viewportRef.value;
    const rowHeight = getRowHeight();
    if (!viewport || !shouldLoop.value || !rowHeight || !props.rows.length || isResetting) return;

    const loopHeight = rowHeight * props.rows.length;
    const nextTop = viewport.scrollTop + rowHeight;

    if (nextTop < loopHeight) {
      viewport.scrollTo({ top: nextTop, behavior: 'smooth' });
      return;
    }

    isResetting = true;
    viewport.scrollTo({ top: loopHeight, behavior: 'smooth' });
    resetScrollTimer = window.setTimeout(() => {
      if (viewportRef.value && !isPointerInside.value) viewportRef.value.scrollTop = 0;
      isResetting = false;
      resetScrollTimer = undefined;
    }, 420);
  }

  function startAutoScroll() {
    if (autoScrollTimer || !shouldLoop.value || isPointerInside.value) return;

    autoScrollTimer = window.setInterval(() => {
      if (!document.hidden && !isPointerInside.value) scrollToNextRow();
    }, 1000);
  }

  function pauseAutoScroll() {
    isPointerInside.value = true;
    stopAutoScroll();
  }

  function resumeAutoScroll() {
    isPointerInside.value = false;
    startAutoScroll();
  }

  watch(
    () =>
      props.rows
        .map((item) => [item.id, item.status, item.severity, item.ackTs, item.clearTs, item.endTs, item.type].join('|'))
        .join('||'),
    () => scheduleLoopStateUpdate(captureScrollAnchor()),
    { flush: 'pre' },
  );

  watch(
    () => props.settings.dense,
    () => scheduleLoopStateUpdate(captureScrollAnchor()),
    { flush: 'pre' },
  );

  watch(shouldLoop, (enabled) => {
    if (enabled) {
      void nextTick(startAutoScroll);
    } else {
      stopAutoScroll();
    }
  });

  onMounted(() => {
    resizeObserver = new ResizeObserver(() => {
      syncHeaderScroll();
      scheduleLoopStateUpdate();
    });
    if (viewportRef.value) resizeObserver.observe(viewportRef.value);
    syncHeaderScroll();
    scheduleLoopStateUpdate();
  });

  onBeforeUnmount(() => {
    stopAutoScroll();
    resizeObserver?.disconnect();
  });
</script>

<style scoped>
  .alarm-table-wrap {
    width: 100%;
    height: 100%;
    min-height: 0;
    display: flex;
    flex: 1 1 auto;
    flex-direction: column;
  }
  .alarm-table-wrap__loading {
    display: flex;
    flex: 1 1 auto;
    align-items: center;
    justify-content: center;
    color: #666;
  }
  .alarm-table__header {
    min-width: 0;
    flex: 0 0 auto;
    overflow: hidden;
    box-sizing: border-box;
  }
  .alarm-table__viewport {
    min-height: 0;
    flex: 1 1 auto;
    overflow: auto;
    scrollbar-gutter: stable;
    overscroll-behavior: contain;
    scrollbar-color: #c7c7c7 transparent;
    scrollbar-width: thin;
  }
  .alarm-table {
    width: 100%;
    min-width: 780px;
    border-collapse: collapse;
    table-layout: fixed;
    background: transparent;
  }
  .alarm-table__col-severity {
    width: 82px;
  }
  .alarm-table__col-time {
    width: 164px;
  }
  .alarm-table__col-originator {
    width: 15%;
  }
  .alarm-table__col-type {
    width: 14%;
  }
  .alarm-table__col-status {
    width: 148px;
  }
  .alarm-table th,
  .alarm-table td {
    height: 44px;
    box-sizing: border-box;
    padding: 8px 10px;
    border: 1px solid #f0f0f0;
    text-align: left;
    vertical-align: middle;
    white-space: nowrap;
  }
  .alarm-table thead th {
    position: sticky;
    top: 0;
    z-index: 1;
    background: #fafafa;
    color: #262626;
    font-size: 13px;
    font-weight: 600;
  }
  .alarm-table td {
    color: #434343;
    font-size: 13px;
  }
  .alarm-table__row {
    cursor: pointer;
  }
  .alarm-table__row:hover {
    background: #fafcff;
  }
  .alarm-table__time,
  .alarm-table__truncate {
    overflow: hidden;
    text-overflow: ellipsis;
  }
  .alarm-table__status-cell {
    overflow: hidden;
  }
  .alarm-table__status-content {
    display: inline-flex;
    align-items: center;
    gap: 6px;
  }
  .alarm-table__status-ack {
    height: 24px;
    padding: 0 8px;
    border: 1px solid #1677ff;
    border-radius: 4px;
    background: #1677ff;
    color: #fff;
    cursor: pointer;
    font-size: 12px;
    line-height: 1;
    opacity: 0;
    visibility: hidden;
    pointer-events: none;
    transform: translateX(-4px);
    transition:
      opacity 160ms ease,
      transform 160ms ease,
      visibility 160ms ease;
  }
  .alarm-table__status-cell:hover .alarm-table__status-ack,
  .alarm-table__status-cell:focus-within .alarm-table__status-ack {
    opacity: 1;
    visibility: visible;
    pointer-events: auto;
    transform: translateX(0);
  }
  .is-dense .alarm-table th,
  .is-dense .alarm-table td {
    height: 38px;
    padding: 5px 8px;
    font-size: 12px;
  }
  /* Transparent map-overlay table surface. */
  .alarm-table__viewport {
    background: transparent;
    scrollbar-color: rgba(226, 232, 240, 0.45) transparent;
  }
  .alarm-table {
    background: transparent;
  }
  .alarm-table th,
  .alarm-table td {
    height: 42px;
    padding: 7px 10px;
    border: none;
    border-bottom: 1px solid rgba(255, 255, 255, 0.12);
  }
  .alarm-table__header .alarm-table thead th {
    position: static;
    z-index: auto;
    background: transparent;
    box-shadow: none;
    color: #f8fafc;
    backdrop-filter: none;
  }
  .alarm-table td {
    color: #f8fafc;
  }
  .alarm-table__time {
    color: rgba(226, 232, 240, 0.72);
  }
  .alarm-table__row:hover {
    background: rgba(255, 255, 255, 0.08);
  }
</style>
