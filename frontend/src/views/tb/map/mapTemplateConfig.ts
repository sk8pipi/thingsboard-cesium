import type { GridItem } from '../dashboard/runtime/types';
import type { SensorPopupBinding } from './sensorPopupWidgetStorage';
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

export type MapTemplateState = {
  version: number;
  updatedTime?: number;
  scene: MapTemplateScene;
  layout: GridItem[];
  widgets: Record<string, any>;
  mapPoints: MapPoint[];
  sensorPopupBindings: SensorPopupBinding;
};

export function createDefaultMapTemplateState(): MapTemplateState {
  return {
    version: 2,
    scene: {
      globeOnly: true,
      models: [],
      terrains: [],
    },
    layout: [],
    widgets: {},
    mapPoints: [],
    sensorPopupBindings: {},
  };
}

export function normalizeMapTemplateState(state?: Partial<MapTemplateState> | null): MapTemplateState {
  const fallback = createDefaultMapTemplateState();
  const scene: Partial<MapTemplateScene> = state?.scene || {};
  const sourceVersion = Number(state?.version || 1);

  return {
    ...fallback,
    ...(state || {}),
    version: sourceVersion < 2 ? 2 : sourceVersion,
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
  };
}
