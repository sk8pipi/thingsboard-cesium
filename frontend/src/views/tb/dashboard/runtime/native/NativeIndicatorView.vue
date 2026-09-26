<template>
  <div class="native-indicator" :class="kind" :style="{ padding: `${settings.padding}px` }">
    <template v-if="kind === 'battery'">
      <div class="battery-content" :class="{ horizontal: battery.layout.startsWith('horizontal') }">
        <svg class="battery-shape" :viewBox="horizontal ? '0 0 113 64' : '0 0 64 113'" aria-hidden="true">
          <template v-if="level !== null">
            <template v-if="battery.layout.endsWith('solid')">
              <rect v-if="horizontal" x="8" y="8" :width="(97 * level) / 100" height="48" :fill="levelColor" />
              <rect
                v-else
                x="8"
                :y="107 - (99 * level) / 100"
                width="48"
                :height="(99 * level) / 100"
                :fill="levelColor"
              />
            </template>
            <template v-else>
              <rect
                v-for="(filled, index) in segments"
                :key="index"
                v-show="filled"
                :x="horizontal ? 8 + index * (97 / battery.sectionsCount) + 2 : 8"
                :y="horizontal ? 8 : 107 - (index + 1) * (99 / battery.sectionsCount) + 2"
                :width="horizontal ? 97 / battery.sectionsCount - 4 : 48"
                :height="horizontal ? 48 : 99 / battery.sectionsCount - 4"
                :fill="levelColor"
              />
            </template>
          </template>
          <path :d="horizontal ? shapes.batteryHorizontal : shapes.batteryVertical" :fill="outlineColor" />
        </svg>
        <strong
          v-if="battery.showValue"
          class="battery-value"
          :style="{
            color: valueColor,
            fontSize: battery.autoScaleValueSize
              ? `clamp(10px, 10cqw, ${battery.valueFontSize}px)`
              : `${battery.valueFontSize}px`,
          }"
          >{{ numeric === null ? 'N/A' : `${numeric.toFixed(decimals)}${units || '%'}` }}</strong
        >
      </div>
    </template>
    <template v-else>
      <div class="signal-content" :title="signal.showTooltip ? tooltipText : undefined">
        <svg viewBox="0 0 149 113" class="signal-shape" role="img" :aria-label="signalLabel">
          <template v-if="signal.layout === 'wifi'">
            <path
              v-for="(path, index) in shapes.signalWifi"
              :key="index"
              :d="path"
              :fill="bars[index] ? activeColor : signal.inactiveBarsColor"
            />
          </template>
          <template v-else>
            <rect
              v-for="(bar, index) in cellularBars"
              :key="index"
              :x="bar.x"
              :y="bar.y"
              width="18"
              :height="bar.height"
              :fill="bars[index] ? activeColor : signal.inactiveBarsColor"
            />
          </template>
          <text
            v-if="numeric === null || !bars[0]"
            x="74.5"
            y="105"
            text-anchor="middle"
            :fill="signal.dateColor"
            font-size="15"
          >
            {{ numeric === null ? 'N/A' : '无信号' }}
          </text>
        </svg>
        <small
          v-if="signal.showDate && timestamp != null"
          :style="{ color: signal.dateColor, fontSize: `${signal.dateFontSize}px` }"
          >{{ nativeTimestamp(timestamp, signal.dateFormat, now) }}</small
        >
        <div
          v-if="signal.showTooltip"
          class="signal-tooltip"
          :style="{
            background: signal.tooltipBackgroundColor,
            boxShadow: `0 4px ${signal.tooltipBackgroundBlur * 4}px #0005`,
          }"
        >
          <strong
            v-if="signal.showTooltipValue"
            :style="{ color: signal.tooltipValueColor, fontSize: `${signal.tooltipValueFontSize}px` }"
            >{{ numeric === null ? 'N/A' : `${numeric.toFixed(decimals)} ${units}`.trim() }}</strong
          >
          <small
            v-if="signal.showTooltipDate && timestamp != null"
            :style="{ color: signal.tooltipDateColor, fontSize: `${signal.tooltipDateFontSize}px` }"
            >{{ nativeTimestamp(timestamp, signal.tooltipDateFormat, now) }}</small
          >
        </div>
      </div>
    </template>
  </div>
</template>
<script setup lang="ts">
  import { computed } from 'vue';
  import shapes from './nativeIndicatorShapes.generated.json';
  import { batteryLevel, batterySegments, indicatorColor, indicatorNumber, signalBars } from './nativeIndicatorCore';
  import { nativeTimestamp } from './nativeWidgetSettings';
  import type { NativeBatterySettings, NativeSignalSettings } from './nativeWidgetTypes';

  const props = defineProps<{
    kind: 'battery' | 'signal';
    settings: NativeBatterySettings | NativeSignalSettings;
    value: unknown;
    timestamp?: number;
    units: string;
    decimals: number;
    now: number;
  }>();
  const battery = computed(() => props.settings as NativeBatterySettings);
  const signal = computed(() => props.settings as NativeSignalSettings);
  const numeric = computed(() => indicatorNumber(props.value));
  const level = computed(() => batteryLevel(props.value));
  const horizontal = computed(() => battery.value.layout.startsWith('horizontal'));
  const segments = computed(() => batterySegments(props.value, battery.value.sectionsCount));
  const levelColor = computed(() => indicatorColor(battery.value.batteryLevelColor, numeric.value));
  const outlineColor = computed(() => indicatorColor(battery.value.batteryShapeColor, numeric.value));
  const valueColor = computed(() => indicatorColor(battery.value.valueColor, numeric.value));
  const bars = computed(() => signalBars(props.value, signal.value.noSignalRssiValue));
  const activeColor = computed(() => indicatorColor(signal.value.activeBarsColor, numeric.value));
  const cellularBars = [
    { x: 19, y: 75, height: 37 },
    { x: 50, y: 50, height: 61 },
    { x: 80, y: 26, height: 86 },
    { x: 111, y: 1, height: 111 },
  ];
  const signalLabel = computed(() =>
    numeric.value === null ? '信号强度未知' : bars.value[0] ? `信号强度 ${numeric.value} ${props.units}` : '无信号',
  );
  const tooltipText = computed(() =>
    [
      signal.value.showTooltipValue ? signalLabel.value : '',
      signal.value.showTooltipDate && props.timestamp != null
        ? nativeTimestamp(props.timestamp, signal.value.tooltipDateFormat, props.now)
        : '',
    ]
      .filter(Boolean)
      .join(' · '),
  );
</script>
<style scoped>
  .native-indicator {
    width: 100%;
    height: 100%;
    min-height: 0;
    container-type: inline-size;
    display: grid;
    place-items: center;
    color: #eaf5ff;
  }
  .battery-content {
    width: 100%;
    height: 100%;
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 12px;
    min-height: 0;
  }
  .battery-content.horizontal {
    flex-direction: column-reverse;
  }
  .battery-shape {
    height: min(100%, 150px);
    width: auto;
    max-width: 60%;
    flex: 0 1 auto;
  }
  .horizontal .battery-shape {
    width: min(100%, 180px);
    height: auto;
    max-height: 65%;
    max-width: 100%;
  }
  .battery-value {
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }
  .signal-content {
    height: 100%;
    width: 100%;
    min-height: 0;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    position: relative;
    gap: 6px;
  }
  .signal-shape {
    width: min(100%, 180px);
    height: min(75%, 145px);
  }
  .signal-tooltip {
    display: none;
    position: absolute;
    bottom: calc(50% + 45px);
    left: 50%;
    transform: translateX(-50%);
    border-radius: 5px;
    padding: 6px 10px;
    white-space: nowrap;
    flex-direction: column;
    align-items: center;
    z-index: 1;
    pointer-events: none;
  }
  .signal-content:hover .signal-tooltip,
  .signal-content:focus-within .signal-tooltip {
    display: flex;
  }
</style>
