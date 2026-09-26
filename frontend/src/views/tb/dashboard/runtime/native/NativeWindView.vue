<template>
  <div class="native-wind" :style="panelStyle">
    <div class="native-wind-background" :style="backgroundStyle"></div>
    <div v-if="settings.overlayEnabled" class="native-wind-overlay" :style="overlayStyle"></div>
    <svg class="native-wind-shape" viewBox="0 0 180 180" role="img" :aria-label="ariaText">
      <g v-for="angle in tickAngles" :key="angle" :transform="`rotate(${angle} 90 90)`">
        <line
          x1="90"
          y1="20"
          x2="90"
          :y2="angle % 45 === 0 ? 28 : 23"
          :stroke="
            angle % 90 === 0
              ? settings.majorTicksColor
              : angle % 45 === 0
                ? settings.minorTicksColor
                : settings.ticksColor
          "
          :stroke-width="angle % 45 === 0 ? 2 : 1.2"
        />
      </g>
      <path d="M90 19 L94 27 H86 Z" :fill="settings.majorTicksColor" />
      <template v-if="settings.layout !== 'simplified'">
        <text
          v-for="tick in majorLabels"
          :key="tick.angle"
          :x="tick.x"
          :y="tick.y"
          text-anchor="middle"
          dominant-baseline="middle"
          :font-size="settings.majorTicksFontSize"
          :fill="settings.majorTicksColor"
        >
          {{ windTickLabel(tick.angle, settings.directionalNamesElseDegrees) }}
        </text>
      </template>
      <template v-if="settings.layout === 'advanced'">
        <text
          v-for="tick in minorLabels"
          :key="tick.angle"
          :x="tick.x"
          :y="tick.y"
          text-anchor="middle"
          dominant-baseline="middle"
          :font-size="settings.minorTicksFontSize"
          :fill="settings.minorTicksColor"
        >
          {{ windTickLabel(tick.angle, settings.directionalNamesElseDegrees) }}
        </text>
      </template>
      <g
        :transform="`rotate(${reading.angle ?? 0} 90 90)`"
        :opacity="reading.angle === null ? 0.25 : 1"
        class="native-wind-arrow"
        :fill="settings.arrowColor"
      >
        <path d="M90 27 L97 35 L92 33 L92 57 L88 57 L88 33 L83 35 Z M88 124 H92 V154 H96 V157 H84 V154 H88 Z" />
      </g>
      <text
        x="90"
        :y="reading.units ? 85 : 91"
        text-anchor="middle"
        dominant-baseline="middle"
        :font-size="settings.centerValueFontSize"
        :fill="reading.color"
      >
        {{ reading.text }}
      </text>
      <text
        v-if="reading.units"
        x="90"
        y="106"
        text-anchor="middle"
        dominant-baseline="middle"
        :font-size="Math.max(10, settings.centerValueFontSize * 0.58)"
        :fill="reading.color"
      >
        {{ reading.units }}
      </text>
    </svg>
  </div>
</template>

<script setup lang="ts">
  import { computed, onBeforeUnmount, ref, watch } from 'vue';
  import { imagePreview } from '/@/api/tb/images';
  import { safePreviewSource } from '../../../widgetsLibrary/widgetResourceCore';
  import type { NativeWindSettings } from './nativeWidgetTypes';
  import { windReading, windTickLabel } from './nativeWindCore';

  const props = defineProps<{
    settings: NativeWindSettings;
    direction: unknown;
    speed?: unknown;
    hasSpeed: boolean;
    units?: string;
    decimals?: number;
  }>();
  const tickAngles = Array.from({ length: 120 }, (_, index) => index * 3).filter((angle) => angle !== 0);
  const majorLabels = [
    { angle: 0, x: 90, y: 10 },
    { angle: 90, x: 170, y: 90 },
    { angle: 180, x: 90, y: 170 },
    { angle: 270, x: 10, y: 90 },
  ];
  const minorLabels = [
    { angle: 45, x: 150, y: 30 },
    { angle: 135, x: 150, y: 150 },
    { angle: 225, x: 30, y: 150 },
    { angle: 315, x: 30, y: 30 },
  ];
  const reading = computed(() =>
    windReading(
      props.direction,
      props.speed,
      props.hasSpeed,
      props.decimals ?? 1,
      props.units || 'm/s',
      props.settings,
    ),
  );
  const ariaText = computed(
    () =>
      `风向 ${reading.value.angle === null ? '无数据' : `${reading.value.angle}°`}，${reading.value.text} ${reading.value.units}`,
  );
  const imageUrl = ref('');
  let requestId = 0;
  let objectUrl = '';
  watch(
    () => [props.settings.backgroundType, props.settings.backgroundImage],
    async () => {
      const current = ++requestId;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
      objectUrl = '';
      imageUrl.value = '';
      if (props.settings.backgroundType !== 'image') return;
      const source = safePreviewSource(props.settings.backgroundImage);
      if (!source) return;
      if (source.startsWith('data:')) {
        imageUrl.value = source;
        return;
      }
      try {
        const blob = await imagePreview(source);
        if (current !== requestId) return;
        objectUrl = URL.createObjectURL(blob);
        imageUrl.value = objectUrl;
      } catch {
        /* Keep the color fallback if the authenticated image is unavailable. */
      }
    },
    { immediate: true },
  );
  onBeforeUnmount(() => {
    requestId++;
    if (objectUrl) URL.revokeObjectURL(objectUrl);
  });
  const panelStyle = computed(() => ({
    padding: `${props.settings.padding}px`,
  }));
  const backgroundStyle = computed(() => ({
    backgroundColor: props.settings.backgroundColor,
    backgroundImage: imageUrl.value ? `url("${imageUrl.value}")` : undefined,
    filter: props.settings.overlayEnabled && imageUrl.value ? `blur(${props.settings.overlayBlur}px)` : undefined,
  }));
  const overlayStyle = computed(() => ({
    backgroundColor: props.settings.overlayColor,
  }));
</script>

<style scoped>
  .native-wind {
    position: relative;
    display: flex;
    align-items: center;
    justify-content: center;
    width: 100%;
    height: 100%;
    overflow: hidden;
  }
  .native-wind-background {
    position: absolute;
    inset: -24px;
    background-size: cover;
    background-position: center;
    pointer-events: none;
  }
  .native-wind-overlay {
    position: absolute;
    inset: 0;
    pointer-events: none;
  }
  .native-wind-shape {
    position: relative;
    display: block;
    width: min(100%, 100vh);
    height: 100%;
    max-height: 100%;
  }
  .native-wind-arrow {
    transition: transform 800ms ease;
    transform-origin: 90px 90px;
  }
</style>
