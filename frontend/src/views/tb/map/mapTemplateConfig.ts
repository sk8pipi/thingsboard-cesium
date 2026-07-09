import type { CSSProperties } from 'vue';
import type { GridItem, WidgetAppearance } from '../dashboard/runtime/types';
import type { SensorPopupBinding } from './sensorPopupWidgetStorage';
import type { SensorPointStyleOverride } from './services/sensorPointStyleService';
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

export type SensorDeviceTypeStyles = Record<string, SensorPointStyleOverride>;

export const DEFAULT_MAP_TEMPLATE_APPEARANCE: Required<MapTemplateAppearance> = {
  backgroundOpacity: 0.04,
  blurPx: 0,
};

function clamp(value: unknown, fallback: number, min: number, max: number) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? Math.min(max, Math.max(min, parsed)) : fallback;
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
};

export function createDefaultMapTemplateState(): MapTemplateState {
  return {
    version: 4,
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
  };
}

export function normalizeMapTemplateState(state?: Partial<MapTemplateState> | null): MapTemplateState {
  const fallback = createDefaultMapTemplateState();
  const scene: Partial<MapTemplateScene> = state?.scene || {};
  const sourceVersion = Number(state?.version || 1);

  return {
    ...fallback,
    ...(state || {}),
    version: sourceVersion < 4 ? 4 : sourceVersion,
    scene: {
      ...fallback.scene,
      ...scene,
      models: Array.isArray(scene.models) ? scene.models : [],
      terrains: Array.isArray(scene.terrains) ? scene.terrains : [],
    },
    layout: Array.isArray(state?.layout) ? state.layout : [],
    widgets: state?.widgets && typeof state.widgets === 'object' ? state.widgets : {},
    mapPoints: Array.isArray(state?.mapPoints) ? state.mapPoints : [],
    sensorPopupBindings:
      state?.sensorPopupBindings && typeof state.sensorPopupBindings === 'object' ? state.sensorPopupBindings : {},
    sensorDeviceTypeStyles:
      state?.sensorDeviceTypeStyles && typeof state.sensorDeviceTypeStyles === 'object'
        ? (state.sensorDeviceTypeStyles as SensorDeviceTypeStyles)
        : {},
    appearance: {
      ...fallback.appearance,
      ...(state?.appearance || {}),
    },
  };
}
