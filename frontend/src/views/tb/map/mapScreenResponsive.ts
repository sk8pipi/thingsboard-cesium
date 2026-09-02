import { computed, onBeforeUnmount, onMounted, ref, type CSSProperties, type Ref } from 'vue';
import { DEFAULT_MAP_TEMPLATE_VIEWPORT, type MapTemplateViewport, type MapTopBarConfig } from './mapTemplateConfig';

export const MAP_SCREEN_MIN_DESKTOP_WIDTH = 1280;
export const MAP_SCREEN_MIN_DESKTOP_HEIGHT = 720;

const BASE_GRID_MARGIN = 10;
const MIN_GRID_MARGIN = 6;
const MAX_GRID_MARGIN = 16;
const MIN_TOP_BAR_HEIGHT = 44;
const MAX_TOP_BAR_HEIGHT = 112;
const MAX_SCREEN_SCALE = 2;
const CESIUM_PIXEL_BUDGET = 2560 * 1440;

export type MapScreenMetrics = {
  containerWidth: number;
  containerHeight: number;
  scale: number;
  uiScale: number;
  compact: boolean;
  topBarHeight: number;
  contentTop: number;
  contentHeight: number;
  canvasLeft: number;
  canvasTop: number;
  canvasWidth: number;
  canvasHeight: number;
  columns: number;
  rows: number;
  cellHeight: number;
  margin: number;
  cesiumResolutionScale: number;
};

type CalculateMapScreenMetricsOptions = {
  width: number;
  height: number;
  viewport?: Partial<MapTemplateViewport> | null;
  topBar?: Partial<MapTopBarConfig> | null;
};

function clamp(value: number, minimum: number, maximum: number) {
  return Math.min(maximum, Math.max(minimum, value));
}

function finitePositive(value: unknown, fallback: number) {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

export function calculateMapScreenMetrics(options: CalculateMapScreenMetricsOptions): MapScreenMetrics {
  const width = Math.max(0, Number(options.width) || 0);
  const height = Math.max(0, Number(options.height) || 0);
  const viewport = options.viewport || DEFAULT_MAP_TEMPLATE_VIEWPORT;
  const designWidth = finitePositive(viewport.designWidth, DEFAULT_MAP_TEMPLATE_VIEWPORT.designWidth);
  const designHeight = finitePositive(viewport.designHeight, DEFAULT_MAP_TEMPLATE_VIEWPORT.designHeight);
  const columns = Math.round(finitePositive(viewport.columns, DEFAULT_MAP_TEMPLATE_VIEWPORT.columns));
  const rows = Math.round(finitePositive(viewport.rows, DEFAULT_MAP_TEMPLATE_VIEWPORT.rows));
  const rawScale = width && height ? Math.min(width / designWidth, height / designHeight) : 0;
  const scale = Math.min(MAX_SCREEN_SCALE, rawScale);
  const uiScale = rawScale ? clamp(rawScale, 0.67, MAX_SCREEN_SCALE) : 1;
  const configuredTopBarHeight = finitePositive(options.topBar?.height, 64);
  const topBarHeight =
    options.topBar?.visible === false
      ? 0
      : clamp(configuredTopBarHeight * scale, MIN_TOP_BAR_HEIGHT, MAX_TOP_BAR_HEIGHT);
  const contentHeight = Math.max(0, height - topBarHeight);
  const canvasWidth = width;
  const canvasHeight = contentHeight;
  const canvasLeft = 0;
  const canvasTop = topBarHeight;
  const margin = clamp(BASE_GRID_MARGIN * scale, MIN_GRID_MARGIN, MAX_GRID_MARGIN);
  const cellHeight = calculateGridStackCellHeight(canvasHeight, rows);
  const renderedPixels = width * height;
  const cesiumResolutionScale = renderedPixels ? clamp(Math.sqrt(CESIUM_PIXEL_BUDGET / renderedPixels), 0.65, 1) : 1;

  return {
    containerWidth: width,
    containerHeight: height,
    scale,
    uiScale,
    compact: width < MAP_SCREEN_MIN_DESKTOP_WIDTH || height < MAP_SCREEN_MIN_DESKTOP_HEIGHT,
    topBarHeight,
    contentTop: topBarHeight,
    contentHeight,
    canvasLeft,
    canvasTop,
    canvasWidth,
    canvasHeight,
    columns,
    rows,
    cellHeight,
    margin,
    cesiumResolutionScale,
  };
}

/** GridStack v12 uses cellHeight as the complete row pitch; margins inset item content. */
export function calculateGridStackCellHeight(canvasHeight: number, rows: number): number {
  const normalizedHeight = Math.max(0, Number(canvasHeight) || 0);
  const normalizedRows = Math.max(1, Math.round(Number(rows) || 1));
  return normalizedHeight / normalizedRows;
}

export function mapScreenCssVars(metrics: MapScreenMetrics): CSSProperties {
  return {
    '--map-screen-scale': String(metrics.scale || 1),
    '--map-screen-ui-scale': String(metrics.uiScale),
    '--map-top-bar-height': `${metrics.topBarHeight}px`,
    '--map-top-bar-offset': `${metrics.topBarHeight}px`,
    '--map-screen-content-height': `${metrics.contentHeight}px`,
  } as CSSProperties;
}

export function mapScreenCanvasStyle(metrics: MapScreenMetrics): CSSProperties {
  return {
    left: `${metrics.canvasLeft}px`,
    top: `${metrics.canvasTop}px`,
    width: `${metrics.canvasWidth}px`,
    height: `${metrics.canvasHeight}px`,
  };
}

export function useMapScreenResponsive(
  container: Ref<HTMLElement | null>,
  getViewport: () => Partial<MapTemplateViewport> | null | undefined,
  getTopBar: () => Partial<MapTopBarConfig> | null | undefined,
) {
  const width = ref(0);
  const height = ref(0);
  let resizeObserver: ResizeObserver | undefined;
  let resizeFrame = 0;

  function measure() {
    if (!container.value) return;
    const nextWidth = container.value.clientWidth;
    const nextHeight = container.value.clientHeight;
    if (Math.abs(width.value - nextWidth) > 0.5) width.value = nextWidth;
    if (Math.abs(height.value - nextHeight) > 0.5) height.value = nextHeight;
  }

  function scheduleMeasure() {
    if (resizeFrame) cancelAnimationFrame(resizeFrame);
    resizeFrame = requestAnimationFrame(() => {
      resizeFrame = 0;
      measure();
    });
  }

  onMounted(() => {
    measure();
    if (typeof ResizeObserver !== 'undefined') {
      resizeObserver = new ResizeObserver(scheduleMeasure);
      if (container.value) resizeObserver.observe(container.value);
    }
    window.addEventListener('resize', scheduleMeasure, { passive: true });
  });

  onBeforeUnmount(() => {
    resizeObserver?.disconnect();
    resizeObserver = undefined;
    window.removeEventListener('resize', scheduleMeasure);
    if (resizeFrame) cancelAnimationFrame(resizeFrame);
    resizeFrame = 0;
  });

  const metrics = computed(() =>
    calculateMapScreenMetrics({
      width: width.value,
      height: height.value,
      viewport: getViewport(),
      topBar: getTopBar(),
    }),
  );
  const cssVars = computed(() => mapScreenCssVars(metrics.value));
  const canvasStyle = computed(() => mapScreenCanvasStyle(metrics.value));

  return { metrics, cssVars, canvasStyle, measure: scheduleMeasure };
}
