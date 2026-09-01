import type { CSSProperties } from 'vue';
import type { GridItem, WidgetAppearance } from '../dashboard/runtime/types';
import type { SensorPopupBinding } from './sensorPopupWidgetStorage';
import { normalizeDeviceTypeStyleKey, type SensorPointStyleOverride } from './services/sensorPointStyleService';
import type { MapPoint } from './types/mapPointTypes';

export const DASHBOARD_MAP_WIDGET_CONFIG_KEY = '__mapWidgetEditor';

export type MapTemplateScene = {
  globeOnly: boolean;
  models: MapSceneModel[];
  terrains: any[];
};

export type MapSceneModel = {
  id: string;
  name: string;
  type: '3d-tiles';
  source: 'ion' | 'url';
  assetId?: number;
  url?: string;
  longitude: number;
  latitude: number;
  height?: number;
  heightOffset?: number;
  heading?: number;
  pitch?: number;
  roll?: number;
  scale?: number;
  visible?: boolean;
};

export type MapTemplateAppearance = Pick<WidgetAppearance, 'backgroundOpacity' | 'blurPx'>;

export type MapTemplateViewport = {
  designWidth: number;
  designHeight: number;
  columns: number;
  rows: number;
  mode: 'fill';
};

export type SensorDeviceTypeStyles = Record<string, SensorPointStyleOverride>;

export type MapTopBarActionType = 'overview' | 'settings' | 'fullscreen';

export type MapTopBarActionConfig = {
  id: MapTopBarActionType;
  type: MapTopBarActionType;
  visible: boolean;
  label: string;
  order: number;
};

export type MapTopBarConfig = {
  version: number;
  visible: boolean;
  height: number;
  brand: {
    visible: boolean;
    logoUrl: string;
    logoHeight: number;
    logoMaxWidth: number;
    name: string;
  };
  title: {
    visible: boolean;
    useDashboardTitle: boolean;
    text: string;
  };
  actions: MapTopBarActionConfig[];
};

const DEFAULT_MAP_TOP_BAR_ACTIONS: MapTopBarActionConfig[] = [
  { id: 'overview', type: 'overview', visible: true, label: '\u603b\u89c8', order: 1 },
  { id: 'settings', type: 'settings', visible: true, label: '\u8bbe\u7f6e', order: 2 },
  { id: 'fullscreen', type: 'fullscreen', visible: true, label: '\u5168\u5c4f', order: 3 },
];

export function createDefaultMapTopBarConfig(): MapTopBarConfig {
  return {
    version: 2,
    visible: true,
    height: 64,
    brand: {
      visible: false,
      logoUrl: '',
      logoHeight: 34,
      logoMaxWidth: 120,
      name: '',
    },
    title: {
      visible: true,
      useDashboardTitle: true,
      text: '',
    },
    actions: DEFAULT_MAP_TOP_BAR_ACTIONS.map((action) => ({ ...action })),
  };
}

function normalizeSensorDeviceTypeStyles(value: unknown): SensorDeviceTypeStyles {
  if (!value || typeof value !== 'object') return {};
  return Object.entries(value as Record<string, SensorPointStyleOverride>).reduce<SensorDeviceTypeStyles>(
    (styles, [key, style]) => {
      if (style && typeof style === 'object') {
        styles[normalizeDeviceTypeStyleKey(key)] = style;
      }
      return styles;
    },
    {},
  );
}

export const DEFAULT_MAP_TEMPLATE_APPEARANCE: Required<MapTemplateAppearance> = {
  backgroundOpacity: 0.04,
  blurPx: 0,
};

export const DEFAULT_MAP_TEMPLATE_VIEWPORT: MapTemplateViewport = {
  designWidth: 1920,
  designHeight: 1080,
  columns: 12,
  rows: 25,
  mode: 'fill',
};

function clamp(value: unknown, fallback: number, min: number, max: number) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? Math.min(max, Math.max(min, parsed)) : fallback;
}

function normalizeMapTopBarConfig(value?: Partial<MapTopBarConfig> | null): MapTopBarConfig {
  const fallback = createDefaultMapTopBarConfig();
  const configuredActions = Array.isArray(value?.actions) ? value.actions : [];

  return {
    version: 2,
    visible: typeof value?.visible === 'boolean' ? value.visible : fallback.visible,
    height: clamp(value?.height, fallback.height, 48, 96),
    brand: {
      visible: typeof value?.brand?.visible === 'boolean' ? value.brand.visible : fallback.brand.visible,
      logoUrl: typeof value?.brand?.logoUrl === 'string' ? value.brand.logoUrl : fallback.brand.logoUrl,
      logoHeight: clamp(value?.brand?.logoHeight, fallback.brand.logoHeight, 20, 48),
      logoMaxWidth: clamp(value?.brand?.logoMaxWidth, fallback.brand.logoMaxWidth, 40, 160),
      name: typeof value?.brand?.name === 'string' ? value.brand.name : fallback.brand.name,
    },
    title: {
      visible: typeof value?.title?.visible === 'boolean' ? value.title.visible : fallback.title.visible,
      useDashboardTitle:
        typeof value?.title?.useDashboardTitle === 'boolean'
          ? value.title.useDashboardTitle
          : fallback.title.useDashboardTitle,
      text: typeof value?.title?.text === 'string' ? value.title.text : fallback.title.text,
    },
    actions: fallback.actions.map((defaultAction) => {
      const configured = configuredActions.find(
        (action) => action?.id === defaultAction.id || action?.type === defaultAction.type,
      );
      return {
        ...defaultAction,
        visible: typeof configured?.visible === 'boolean' ? configured.visible : defaultAction.visible,
        label:
          typeof configured?.label === 'string' && configured.label.trim()
            ? configured.label.trim()
            : defaultAction.label,
        order: clamp(configured?.order, defaultAction.order, 1, fallback.actions.length),
      };
    }),
  };
}

export function mapTemplateAppearanceStyle(appearance?: MapTemplateAppearance | null): CSSProperties {
  return {
    '--tb-template-widget-surface-opacity': clamp(
      appearance?.backgroundOpacity,
      DEFAULT_MAP_TEMPLATE_APPEARANCE.backgroundOpacity,
      0,
      1,
    ),
    '--tb-template-widget-surface-blur': `${clamp(
      appearance?.blurPx,
      DEFAULT_MAP_TEMPLATE_APPEARANCE.blurPx,
      0,
      40,
    )}px`,
  } as CSSProperties;
}

export function mapTopBarOffsetStyle(topBar?: Partial<MapTopBarConfig> | null): CSSProperties {
  const normalized = normalizeMapTopBarConfig(topBar);
  return {
    '--map-top-bar-offset': normalized.visible ? `${normalized.height}px` : '0px',
  } as CSSProperties;
}

export type MapTemplateState = {
  version: number;
  updatedTime?: number;
  scene: MapTemplateScene;
  layout: GridItem[];
  widgets: Record<string, any>;
  mapPoints: MapPoint[];
  sensorPopupBindings: SensorPopupBinding;
  sensorDeviceTypeStyles: SensorDeviceTypeStyles;
  appearance: MapTemplateAppearance;
  topBar: MapTopBarConfig;
  viewport: MapTemplateViewport;
};

export function createDefaultMapTemplateState(): MapTemplateState {
  return {
    version: 6,
    scene: {
      globeOnly: true,
      models: [],
      terrains: [],
    },
    layout: [],
    widgets: {},
    mapPoints: [],
    sensorPopupBindings: {},
    sensorDeviceTypeStyles: {},
    appearance: { ...DEFAULT_MAP_TEMPLATE_APPEARANCE },
    topBar: createDefaultMapTopBarConfig(),
    viewport: { ...DEFAULT_MAP_TEMPLATE_VIEWPORT },
  };
}

function normalizeMapTemplateViewport(
  value: Partial<MapTemplateViewport> | null | undefined,
  layout: GridItem[],
): MapTemplateViewport {
  const maximumLayoutRow = getMapTemplateLayoutRows(layout);

  return {
    designWidth: clamp(value?.designWidth, DEFAULT_MAP_TEMPLATE_VIEWPORT.designWidth, 1024, 7680),
    designHeight: clamp(value?.designHeight, DEFAULT_MAP_TEMPLATE_VIEWPORT.designHeight, 576, 4320),
    columns: Math.round(clamp(value?.columns, DEFAULT_MAP_TEMPLATE_VIEWPORT.columns, 1, 24)),
    rows: Math.max(maximumLayoutRow, Math.round(clamp(value?.rows, DEFAULT_MAP_TEMPLATE_VIEWPORT.rows, 1, 200))),
    mode: 'fill',
  };
}

export function getMapTemplateLayoutRows(layout?: GridItem[] | null): number {
  if (!Array.isArray(layout)) return 0;

  return layout.reduce((maximum, item) => {
    const bottom = Number(item.y || 0) + Number(item.h || 0);
    return Number.isFinite(bottom) ? Math.max(maximum, Math.ceil(bottom)) : maximum;
  }, 0);
}

/**
 * Runtime and editor screens must stretch the occupied grid rows across the
 * available canvas. The persisted row count remains a compatibility fallback
 * for empty templates and does not create an unused band below real widgets.
 */
export function resolveMapTemplateViewportForLayout(
  viewport: Partial<MapTemplateViewport> | null | undefined,
  layout?: GridItem[] | null,
  widgets?: Record<string, unknown> | null,
): MapTemplateViewport {
  const normalized = normalizeMapTemplateViewport(viewport, []);
  const renderableLayout = widgets ? (layout || []).filter((item) => Boolean(widgets[item.i])) : layout;
  const occupiedRows = getMapTemplateLayoutRows(renderableLayout);
  return {
    ...normalized,
    rows: occupiedRows || normalized.rows,
  };
}

export function normalizeMapTemplateState(state?: Partial<MapTemplateState> | null): MapTemplateState {
  const fallback = createDefaultMapTemplateState();
  const scene: Partial<MapTemplateScene> = state?.scene || {};
  const sourceVersion = Number(state?.version || 1);
  const layout = Array.isArray(state?.layout) ? state.layout : [];

  return {
    ...fallback,
    ...(state || {}),
    version: sourceVersion < 6 ? 6 : sourceVersion,
    scene: {
      ...fallback.scene,
      ...scene,
      models: Array.isArray(scene.models) ? scene.models : [],
      terrains: Array.isArray(scene.terrains) ? scene.terrains : [],
    },
    layout,
    widgets: state?.widgets && typeof state.widgets === 'object' ? state.widgets : {},
    mapPoints: Array.isArray(state?.mapPoints) ? state.mapPoints : [],
    sensorPopupBindings:
      state?.sensorPopupBindings && typeof state.sensorPopupBindings === 'object' ? state.sensorPopupBindings : {},
    sensorDeviceTypeStyles: normalizeSensorDeviceTypeStyles(state?.sensorDeviceTypeStyles),
    appearance: {
      ...fallback.appearance,
      ...(state?.appearance || {}),
    },
    topBar: normalizeMapTopBarConfig(state?.topBar),
    viewport: normalizeMapTemplateViewport(state?.viewport, layout),
  };
}
