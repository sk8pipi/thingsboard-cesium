import type { WidgetAppearance } from '../dashboard/runtime/types';
import { getMapWidgetStorageKey } from './mapWidgetStorage';

export type PopupWidgetConfig = {
  id: string;
  type: string;
  widgetKey?: string;
  definitionVersion?: number;
  title: string;
  config: Record<string, any>;
  appearance?: WidgetAppearance;
};

export type SensorPopupBinding = Record<string, PopupWidgetConfig[]>;
// key = sensorId

function getSensorPopupStorageKey() {
  return `${getMapWidgetStorageKey()}::sensor_popup_widgets`;
}

export function loadSensorPopupBindings(): SensorPopupBinding {
  try {
    const raw = localStorage.getItem(getSensorPopupStorageKey());
    if (!raw) return {};
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch {
    return {};
  }
}

export function saveSensorPopupBindings(bindings: SensorPopupBinding) {
  localStorage.setItem(getSensorPopupStorageKey(), JSON.stringify(bindings));
}

export function getSensorPopupWidgets(sensorId: string): PopupWidgetConfig[] {
  const bindings = loadSensorPopupBindings();
  return Array.isArray(bindings[sensorId]) ? bindings[sensorId] : [];
}

export function setSensorPopupWidgets(sensorId: string, widgets: PopupWidgetConfig[]) {
  const bindings = loadSensorPopupBindings();
  bindings[sensorId] = widgets;
  saveSensorPopupBindings(bindings);
}
