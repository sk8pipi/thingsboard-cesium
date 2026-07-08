export type BuiltInSensorType =
  | 'temperature'
  | 'humidity'
  | 'electricity_consumption'
  | 'noise'
  | 'illuminance'
  | 'water_consumption'
  | 'default';

export interface SensorPointIconShape {
  viewBox: string;
  paths: string[];
}

export interface SensorPointStyle {
  type: BuiltInSensorType;
  label: string;
  color: string;
  icon: SensorPointIconShape;
}

export interface SensorPointStyleOverride {
  color?: string;
  iconColor?: string;
  offlineColor?: string;
  offlineIconColor?: string;
  ringColor?: string;
  offlineRingColor?: string;
  icon?: SensorPointIconShape;
}

export interface ResolveSensorPointStyleInput {
  deviceType?: string;
  dashboardId?: string;
  pointId?: string;
  deviceId?: string;
  override?: SensorPointStyleOverride;
}

export interface ResolvedSensorPointStyle extends SensorPointStyle {
  override?: SensorPointStyleOverride;
}

const ICONS: Record<BuiltInSensorType, SensorPointIconShape> = {
  temperature: {
    viewBox: '0 0 1024 1024',
    paths: [
      'M640 625.6V192c0-70.6-57.4-128-128-128s-128 57.4-128 128v433.6c-40.2 36.1-64 87.9-64 142.4 0 105.9 86.1 192 192 192s192-86.1 192-192c0-54.6-23.8-106.4-64-142.4zM512 896c-70.7 0-128-57.3-128-128 0-47.3 25.9-88.1 64-110.3V544h32v-32h-32v-64h64v-32h-64v-64h32v-32h-32v-64h64v-32h-64v-32c0-35.4 28.6-64 64-64 35.3 0 64 28.6 64 64v465.7c38.1 22.2 64 63 64 110.3 0 70.7-57.3 128-128 128z',
    ],
  },
  humidity: {
    viewBox: '0 0 1024 1024',
    paths: [
      'M659.499267 568.471013V147.519573a147.519573 147.519573 0 0 0-295.039146 0v420.95144a251.651036 251.651036 0 1 0 295.039146 0zM511.979694 893.79506a121.486707 121.486707 0 0 1-43.388109-234.81645V329.749634h86.776219v329.228976A121.486707 121.486707 0 0 1 511.979694 893.79506zM978.662202 380.860827c-76.970507-90.420821-84.172933-123.222232-84.867142-127.647819-0.607434 4.512363-7.80986 37.226998-84.780367 127.647819-89.98694 105.693435-37.921208 237.853617 84.172933 243.927953h1.301643c122.007364-6.161112 174.073096-138.234517 84.172933-243.927953z m-69.420975 197.242347a15.272615 15.272615 0 0 1-14.92551 11.975118 16.227153 16.227153 0 0 1-3.471049 0 110.63968 110.63968 0 0 1-87.817534-118.883421 15.185838 15.185838 0 1 1 30.284901 2.776839c0 3.037168-4.946245 70.809395 64.301178 86.77622a15.185838 15.185838 0 0 1 11.541237 17.355244zM250.522945 113.937176C204.27122 59.702039 200.019186 40.003837 199.585305 37.400551c0 2.690063-4.685916 22.301488-50.850865 76.536625C94.759632 177.370592 125.912294 256.684057 199.585305 260.328658h0.780986c72.805248-3.731377 104.044687-82.958066 50.156654-146.391482zM86.776219 401.860672c-0.433881 2.950391-5.206573 24.817999-56.491318 85.040695C-29.764243 557.363657 4.946245 645.528296 86.776219 649.520002h0.867763c81.396094-4.078482 116.106582-92.156345 56.144214-162.618635-51.805403-60.222696-56.578095-82.090304-57.011977-85.040695z',
    ],
  },
  electricity_consumption: {
    viewBox: '0 0 1024 1024',
    paths: [
      'M785.7 442.8l-8.8-9.6s-5.5-3.6-13.9-5.4c-8.4-1.9-15.5-2.2-15.5-2.2H609.2l50.7-238.3 0.6-6.2v-7.6c0-12.1-4.9-24.4-12.5-32.7-18.7-20.4-50.6-20.4-69.3 0L235 514.8l-1.9 4.2c-2.2 4.7-3.1 7-4.3 10.3-2 5.7-3.1 11.3-3.1 17.3 0 28.2 21.8 49.9 48.3 49.9h142.5L364 829.4l-0.7 8.1c-3.1 15.9 1.7 32.1 12.5 43.8 8.1 8.8 20.7 14.7 33.5 14.7 6.5 0 12.4-1.4 18.2-3.8 3.3-1.4 5.5-2.5 10-4.9l4.3-2.4 343.8-374.1c17.5-18.9 17.5-49.1 0.1-68z m-357.2 368l61.8-274.2H294.5L593.7 211l-58.1 273.2h193L428.5 810.8z',
    ],
  },
  noise: {
    viewBox: '0 0 1024 1024',
    paths: [
      'M297.638554 333.108434H148.048193v357.783132h149.590361l178.891566 185.060241H567.518072V148.048193H476.53012z m203.566265 178.891566v291.84l-154.772048-160.385542-19.986506-20.418313H220.53012V400.963855h105.916145l19.986506-20.66506 154.772048-160.385542zM715.689639 512L875.951807 425.638554l-135.710843-55.518072 98.698795-185.060241-222.072289 135.710843v382.457832l222.072289 135.710843-123.25012-215.903614 123.25012 18.506024-123.25012-129.542169z',
    ],
  },
  illuminance: {
    viewBox: '0 0 1024 1024',
    paths: [
      'M512 256c141.385 0 256 114.615 256 256S653.385 768 512 768 256 653.385 256 512s114.615-256 256-256z m0 64c-106.039 0-192 85.961-192 192s85.961 192 192 192 192-85.961 192-192-85.961-192-192-192z',
      'M480 64m32 0l0 0q32 0 32 32l0 64q0 32-32 32l0 0q-32 0-32-32l0-64q0-32 32-32Z',
      'M883.979626 260.287187m16 27.712813l0 0q16 27.712813-11.712813 43.712813l-55.425626 32q-27.712813 16-43.712813-11.712813l0 0q-16-27.712813 11.712813-43.712813l55.425626-32q27.712813-16 43.712813 11.712813Z',
      'M915.979626 708.287187m-16 27.712813l0 0q-16 27.712813-43.712813 11.712813l-55.425626-32q-27.712813-16-11.712813-43.712813l0 0q16-27.712813 43.712813-11.712813l55.425626 32q27.712813 16 11.712813 43.712813Z',
      'M544 960m-32 0l0 0q-32 0-32-32l0-64q0-32 32-32l0 0q32 0 32 32l0 64q0 32-32 32Z',
      'M140.020374 763.712813m-16-27.712813l0 0q-16-27.712813 11.712813-43.712813l55.425626-32q27.712813-16 43.712813 11.712813l0 0q16 27.712813-11.712813 43.712813l-55.425626 32q-27.712813 16-43.712813-11.712813Z',
      'M108.020374 315.712813m16-27.712813l0 0q16-27.712813 43.712813-11.712813l55.425626 32q27.712813 16 11.712813 43.712813l0 0q-16 27.712813-43.712813 11.712813l-55.425626-32q-27.712813-16-11.712813-43.712813Z',
    ],
  },
  water_consumption: {
    viewBox: '0 0 1024 1024',
    paths: [
      'M512.203201 93.322162l-1.159001-1.098793a31.789743 31.789743 0 0 0-42.145492 1.098793c-13.832753 13.050051-336.877953 321.675471-336.877953 503.969778 0 187.938793 160.83021 340.821567 358.507622 340.821567s358.477518-152.882774 358.477517-340.821567c0-182.429775-323.0452-490.919728-336.802693-503.969778z m-21.674824 785.862915c-163.720186 0-296.899943-126.436477-296.899943-281.893137 0-53.298996 37.870735-130.952066 112.558569-230.716467 72.625715-97.024945 156.22431-182.384619 184.341374-210.32106 28.117064 27.936441 111.715659 113.311167 184.31127 210.32106 74.702885 99.794505 112.573621 177.417471 112.57362 230.716467 0 155.441608-133.179756 281.893137-296.88489 281.893137z',
      'M717.346386 591.542091a30.871573 30.871573 0 0 0-21.072746-11.439491 32.84338 32.84338 0 0 0-3.642575-0.210727c-15.563728 0-28.598727 11.243815-30.420014 26.130205-9.392424 78.661551-67.116697 143.972013-147.072717 166.384384a30.314651 30.314651 0 0 0-18.664432 14.690714 28.192324 28.192324 0 0 0-2.182535 21.990916 30.826417 30.826417 0 0 0 29.501845 21.072746 31.985418 31.985418 0 0 0 8.684982-1.189105C636.291573 799.78598 711.23529 714.968176 723.442431 612.614837a28.372948 28.372948 0 0 0-6.096045-21.072746z',
    ],
  },
  default: {
    viewBox: '0 0 1024 1024',
    paths: [
      'M224 224h576v576H224V224z m96 96v384h384V320H320z',
      'M416 416h192v192H416V416z',
      'M96 320h96v96H96V320zM96 608h96v96H96v-96zM832 320h96v96h-96V320zM832 608h96v96h-96v-96z',
      'M320 96h96v96h-96V96zM608 96h96v96h-96V96zM320 832h96v96h-96v-96zM608 832h96v96h-96v-96z',
    ],
  },
};

export const SENSOR_POINT_STYLE_REGISTRY: Record<BuiltInSensorType, SensorPointStyle> = {
  temperature: { type: 'temperature', label: '\u6e29\u5ea6', color: '#FFE4E1', icon: ICONS.temperature },
  humidity: { type: 'humidity', label: '\u6e7f\u5ea6', color: '#00CED1', icon: ICONS.humidity },
  electricity_consumption: {
    type: 'electricity_consumption',
    label: '\u7528\u7535\u91cf',
    color: '#FFFF00',
    icon: ICONS.electricity_consumption,
  },
  noise: { type: 'noise', label: '\u566a\u58f0', color: '#D946EF', icon: ICONS.noise },
  illuminance: { type: 'illuminance', label: '\u5149\u7167', color: '#FF8C00', icon: ICONS.illuminance },
  water_consumption: {
    type: 'water_consumption',
    label: '\u7528\u6c34\u91cf',
    color: '#00FFFF',
    icon: ICONS.water_consumption,
  },
  default: { type: 'default', label: '\u9ed8\u8ba4\u4f20\u611f\u5668', color: '#FFFFFF', icon: ICONS.default },
};

const BUILT_IN_SENSOR_TYPES = new Set(Object.keys(SENSOR_POINT_STYLE_REGISTRY));

const ONLINE_ICON_COLOR = '#111827';
const OFFLINE_BODY_COLOR = '#94A3B8';
const OFFLINE_ICON_COLOR = '#475569';

export function normalizeSensorType(value: unknown): BuiltInSensorType {
  const normalized = String(value || '')
    .trim()
    .toLowerCase();
  return BUILT_IN_SENSOR_TYPES.has(normalized) ? (normalized as BuiltInSensorType) : 'default';
}

export function resolveSensorPointStyle(input: ResolveSensorPointStyleInput): ResolvedSensorPointStyle {
  const builtInStyle = SENSOR_POINT_STYLE_REGISTRY[normalizeSensorType(input.deviceType)];

  return {
    ...builtInStyle,
    color: input.override?.color || builtInStyle.color,
    icon: input.override?.icon || builtInStyle.icon,
    override: input.override,
  };
}

function svgDataUrl(svg: string) {
  return `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`;
}

function buildIconPaths(icon: SensorPointIconShape, color: string) {
  return icon.paths.map((path) => `<path d="${path}" fill="${color}"/>`).join('');
}

export function buildSensorPointBillboard(style: ResolvedSensorPointStyle, online: boolean) {
  const bodyColor = online ? style.color : style.override?.offlineColor || OFFLINE_BODY_COLOR;
  const iconColor = online
    ? style.override?.iconColor || ONLINE_ICON_COLOR
    : style.override?.offlineIconColor || OFFLINE_ICON_COLOR;
  const iconPaths = buildIconPaths(style.icon, iconColor);

  return svgDataUrl(`
    <svg xmlns="http://www.w3.org/2000/svg" width="64" height="64" viewBox="0 0 64 64">
      <defs>
        <filter id="shadow" x="-40%" y="-40%" width="180%" height="180%">
          <feDropShadow dx="0" dy="3" stdDeviation="3" flood-color="#000000" flood-opacity="0.28"/>
        </filter>
      </defs>
      <g filter="url(#shadow)">
        <circle cx="32" cy="32" r="25" fill="${bodyColor}"/>
        <circle cx="32" cy="32" r="21" fill="${bodyColor}"/>
      </g>
      <svg x="15" y="15" width="34" height="34" viewBox="${style.icon.viewBox}">
        ${iconPaths}
      </svg>
    </svg>
  `);
}
