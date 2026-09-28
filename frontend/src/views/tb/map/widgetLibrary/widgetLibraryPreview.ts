import type { LocalWidgetKey } from '../../dashboard/runtime/types';
import { widgetRegistry } from '../../dashboard/runtime/widgets/registry/widgetRegistry';
import type { CustomWidgetDefinition } from './types';

const widgetPreviewByKey: Partial<Record<LocalWidgetKey, string>> = {
  timeseriesLine: createWidgetPreviewSvg('Line', 'line', '#2563eb', '#22c55e'),
  timeseriesScatter: createWidgetPreviewSvg('Scatter', 'scatter', '#2563eb', '#f59e0b'),
  timeseriesBarWithLabels: createWidgetPreviewSvg('Bar', 'bar', '#0f766e', '#38bdf8'),
  rangeChart: createWidgetPreviewSvg('Range', 'area', '#7c3aed', '#f59e0b'),
  stateChart: createWidgetPreviewSvg('State', 'step', '#0891b2', '#84cc16'),
  latestPie: createWidgetPreviewSvg('Pie', 'pie', '#7c3aed', '#f97316'),
  latestBar: createWidgetPreviewSvg('Bar', 'bar', '#2563eb', '#f59e0b'),
  latestRadar: createWidgetPreviewSvg('Radar', 'radar', '#0f766e', '#22c55e'),
  latestPolarArea: createWidgetPreviewSvg('Polar', 'pie', '#be185d', '#38bdf8'),
  ledIndicator: createWidgetPreviewSvg('LED', 'led', '#16a34a', '#facc15'),
  staticHtml: createWidgetPreviewSvg('HTML', 'static', '#475569', '#38bdf8'),
  alarmTable: createWidgetPreviewSvg('Alarm Table', 'table', '#dc2626', '#f97316'),
  alarmCard: createWidgetPreviewSvg('Alarm Card', 'card', '#dc2626', '#f59e0b'),
  alarmTrend: createWidgetPreviewSvg('报警趋势', 'bar', '#38bdf8', '#7dd3fc'),
  controlSwitch: createWidgetPreviewSvg('Switch', 'switch', '#0284c7', '#22c55e'),
  templateDeviceOverview: createWidgetPreviewSvg('Device Overview', 'card', '#0284c7', '#22c55e'),
  templateAlarmOverview: createWidgetPreviewSvg('Alarm Overview', 'card', '#dc2626', '#f59e0b'),
  templateKeyAggregate: createWidgetPreviewSvg('Key Aggregate', 'card', '#0e7490', '#38bdf8'),
  templateKeyTrend: createWidgetPreviewSvg('Key Trend', 'line', '#2563eb', '#22c55e'),
  templateStatusDistribution: createWidgetPreviewSvg('Status Distribution', 'pie', '#16a34a', '#ef4444'),
};

export function getBuiltInPreview(key: LocalWidgetKey) {
  return widgetPreviewByKey[key] || createWidgetPreviewSvg('部件', 'card', '#2563eb', '#22c55e');
}

export function getBuiltInKindLabel(key: LocalWidgetKey) {
  const def = widgetRegistry[key];
  if (!def) return 'Widget';

  const map: Record<string, string> = {
    timeseries: 'Timeseries',
    latest: 'Latest',
    alarm: '报警部件',
    aggregate: 'Aggregate',
    control: 'Control',
    static: 'Static',
  };
  return map[def.category] || 'Widget';
}

export function getLibraryKindLabel(kind?: string) {
  const map: Record<string, string> = {
    chart: 'Chart',
    pie: 'Pie',
    bar: 'Bar',
    static: 'Static',
    cesium3d: '3D Map',
    native: 'Vue 基础适配',
    unknown: '待适配（保留原始定义）',
  };
  return map[String(kind || 'unknown')] || String(kind || 'Imported Widget');
}

export function getLibraryPreview(def: CustomWidgetDefinition) {
  const rawImage =
    def.raw?.image ||
    def.raw?.previewImage ||
    def.raw?.widget?.image ||
    def.raw?.widgetType?.image ||
    def.raw?.descriptor?.image ||
    def.tb?.raw?.image;

  return resolveWidgetPreviewImage(rawImage) || createWidgetPreviewSvg(def.name, def.kind, '#2563eb', '#22c55e');
}

function resolveWidgetPreviewImage(image?: string) {
  if (!image || typeof image !== 'string') return '';
  const value = image.trim();
  if (!value || value.startsWith('tb-image;')) return '';
  if (value.startsWith('data:')) return value;
  if (/^(https?:|blob:|\/)/.test(value)) return value;
  if (value.startsWith('<svg')) {
    return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(value)}`;
  }
  return `data:image/png;base64,${value}`;
}

function createWidgetPreviewSvg(label: string, kind: string, primary: string, accent: string) {
  const safeLabel = escapeSvgText(label || 'Widget');
  const normalizedKind = String(kind || '').toLowerCase();
  const chartShape = getPreviewShape(normalizedKind, primary, accent);
  const svg = `
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 320 180">
      <rect width="320" height="180" rx="16" fill="#f8fafc"/>
      <rect x="18" y="18" width="284" height="144" rx="14" fill="#ffffff" stroke="#dbe3ef"/>
      <text x="160" y="45" fill="#172033" font-family="Arial, sans-serif" font-size="18" font-weight="700" text-anchor="middle">${safeLabel}</text>
      ${chartShape}
    </svg>
  `;
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
}

function getPreviewShape(kind: string, primary: string, accent: string) {
  if (kind.includes('pie')) {
    return `
      <circle cx="160" cy="104" r="42" fill="${primary}" opacity=".9"/>
      <path d="M160 104 L160 62 A42 42 0 0 1 199 120 Z" fill="${accent}"/>
      <circle cx="160" cy="104" r="18" fill="#fff" opacity=".95"/>
    `;
  }

  if (kind.includes('bar')) {
    return `
      <rect x="92" y="106" width="24" height="34" rx="5" fill="${accent}"/>
      <rect x="128" y="82" width="24" height="58" rx="5" fill="${primary}"/>
      <rect x="164" y="96" width="24" height="44" rx="5" fill="${accent}" opacity=".78"/>
      <rect x="200" y="70" width="24" height="70" rx="5" fill="${primary}" opacity=".78"/>
    `;
  }

  if (kind.includes('scatter')) {
    return `
      <circle cx="96" cy="124" r="8" fill="${accent}"/>
      <circle cx="126" cy="96" r="7" fill="${primary}"/>
      <circle cx="164" cy="116" r="9" fill="${accent}" opacity=".8"/>
      <circle cx="204" cy="78" r="8" fill="${primary}" opacity=".85"/>
      <circle cx="232" cy="108" r="7" fill="${accent}"/>
    `;
  }

  if (kind.includes('switch')) {
    return `
      <rect x="94" y="82" width="132" height="54" rx="27" fill="${primary}" opacity=".9"/>
      <circle cx="198" cy="109" r="22" fill="#fff"/>
      <path d="M117 109 h48" stroke="${accent}" stroke-width="10" stroke-linecap="round"/>
    `;
  }

  if (kind.includes('led')) {
    return `
      <circle cx="160" cy="104" r="38" fill="${accent}" opacity=".95"/>
      <circle cx="148" cy="90" r="11" fill="#fff" opacity=".75"/>
      <path d="M118 146 h84" stroke="${primary}" stroke-width="8" stroke-linecap="round"/>
    `;
  }

  if (kind.includes('table')) {
    return `
      <rect x="78" y="70" width="164" height="74" rx="8" fill="#f8fafc" stroke="${primary}" stroke-width="3"/>
      <path d="M78 94 H242 M78 118 H242 M120 70 V144 M184 70 V144" stroke="${accent}" stroke-width="3" opacity=".85"/>
    `;
  }

  if (kind.includes('static') || kind.includes('card')) {
    return `
      <rect x="86" y="70" width="148" height="74" rx="10" fill="#f8fafc" stroke="${primary}" stroke-width="3"/>
      <path d="M108 94 H212 M108 116 H184" stroke="${accent}" stroke-width="8" stroke-linecap="round"/>
    `;
  }

  return `
    <path d="M70 128 C106 86 132 122 160 92 S218 68 250 108" fill="none" stroke="${primary}" stroke-width="10" stroke-linecap="round"/>
    <path d="M70 140 H250" stroke="#dbe3ef" stroke-width="4" stroke-linecap="round"/>
    <circle cx="160" cy="92" r="8" fill="${accent}"/>
  `;
}

export function escapeSvgText(text: string) {
  return String(text).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}
