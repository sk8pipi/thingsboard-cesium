import type { TbDataKey, TbDatasource } from '../types';

export type NativeFamily =
  | 'value'
  | 'valueChart'
  | 'progress'
  | 'gauge'
  | 'timeseries'
  | 'pie'
  | 'bar'
  | 'latestBar'
  | 'radar'
  | 'polar'
  | 'range'
  | 'aggregate'
  | 'liquid'
  | 'state'
  | 'battery'
  | 'signal'
  | 'wind'
  | 'rpcButton'
  | 'control'
  | 'advancedControl'
  | 'multiInput'
  | 'count'
  | 'attributeCard'
  | 'alarmTable'
  | 'deviceClaim'
  | 'entityHierarchy'
  | 'entityTable'
  | 'input'
  | 'locationInput'
  | 'photoInput'
  | 'ledIndicator'
  | 'table';
export interface NativeInputSettings {
  widgetMode?: 'ATTRIBUTE' | 'TIME_SERIES';
  attributeScope?: 'SERVER_SCOPE' | 'SHARED_SCOPE';
  showLabel: boolean;
  showResultMessage: boolean;
  required: boolean;
  label: string;
  showTimeInput: boolean;
  min: number | null;
  max: number | null;
  displayPreview?: boolean;
  displayClearButton?: boolean;
  displayApplyButton?: boolean;
  displayDiscardButton?: boolean;
}
export interface NativeLocationSettings {
  latKeyName: string;
  lngKeyName: string;
  showGetLocation: boolean;
  enableHighAccuracy: boolean;
  showLabel: boolean;
  showResultMessage: boolean;
  latLabel: string;
  lngLabel: string;
  inputFieldsAlignment: 'row' | 'column';
  isLatRequired: boolean;
  isLngRequired: boolean;
  requiredErrorMessage: string;
}
export interface NativePhotoSettings {
  saveToGallery: boolean;
  usePublicGalleryLink: boolean;
  imageFormat: 'image/png' | 'image/jpeg' | 'image/webp';
  imageQuality: number;
  maxWidth: number;
  maxHeight: number;
}
export interface NativeLedSettings {
  title: string;
  ledColor: string;
  initialValue: boolean;
  valueAttribute: string;
  retrieveValueMethod: 'attribute' | 'timeseries';
  attributeScope: 'SERVER_SCOPE' | 'SHARED_SCOPE' | 'CLIENT_SCOPE';
  parseValueFunction: string;
  performCheckStatus: boolean;
  checkStatusMethod: string;
  requestTimeout: number;
  requestPersistent: boolean;
  persistentPollingInterval: number;
}
export interface NativeControlSettings {
  kind:
    | 'switch'
    | 'roundSwitch'
    | 'slideToggle'
    | 'knob'
    | 'power'
    | 'singleSwitch'
    | 'toggleButton'
    | 'slider'
    | 'stepper';
  title: string;
  initialValue: number | boolean;
  retrieveValueMethod: 'rpc' | 'attribute' | 'timeseries' | 'none';
  valueKey: string;
  attributeScope: 'SERVER_SCOPE' | 'SHARED_SCOPE' | 'CLIENT_SCOPE';
  getValueMethod: string;
  setValueMethod: string;
  requestTimeout: number;
  requestPersistent: boolean;
  persistentPollingInterval: number;
  min: number;
  max: number;
  step: number;
  decimals: number;
  units: string;
  showValue: boolean;
  showOnOffLabels: boolean;
  onLabel: string;
  offLabel: string;
  activeColor: string;
  inactiveColor: string;
}
export type NativeAdvancedControlMode =
  | 'actionButton'
  | 'gpioControl'
  | 'gpioPanel'
  | 'persistentTable'
  | 'rpcTerminal'
  | 'rpcShell'
  | 'serviceRpc'
  | 'status'
  | 'segment'
  | 'attributeUpdate';
export interface NativeAdvancedControlSettings {
  mode: NativeAdvancedControlMode;
  title: string;
  buttonText: string;
  method: string;
  params: string;
  requestTimeout: number;
  requestPersistent: boolean;
  pollingInterval: number;
  readMethod: string;
  writeMethod: string;
  pins: { pin: string; label: string; row: number; col: number; color: string }[];
  panelColor: string;
  pageSize: number;
  allowDelete: boolean;
  maxLines: number;
  actionMode: 'none' | 'url';
  actionTarget: string;
  leftLabel: string;
  rightLabel: string;
  initialValue: boolean;
  onLabel: string;
  offLabel: string;
  onColor: string;
  offColor: string;
  attributeScope: 'SERVER_SCOPE' | 'SHARED_SCOPE' | 'CLIENT_SCOPE';
  attributesJson: string;
  isConnector: boolean;
}
export interface NativeMultiInputSettings {
  showResultMessage: boolean;
  showActionButtons: boolean;
  updateAllValues: boolean;
  saveButtonLabel: string;
  resetButtonLabel: string;
  showGroupTitle: boolean;
  groupTitle: string;
  fieldsAlignment: 'row' | 'column';
  fieldsInRow: number;
  rowGap: number;
  columnGap: number;
}
export interface NativeMultiInputKeySettings {
  dataKeyValueType:
    | 'string'
    | 'double'
    | 'integer'
    | 'JSON'
    | 'booleanCheckbox'
    | 'booleanSwitch'
    | 'dateTime'
    | 'date'
    | 'time'
    | 'select'
    | 'radio'
    | 'color';
  required: boolean;
  isEditable: 'editable' | 'disabled' | 'readonly';
  dataKeyHidden: boolean;
  disabledOnDataKey: string;
  selectOptions: { value: string | null; label: string }[];
  step: number;
  minValue: number | null;
  maxValue: number | null;
}
export interface NativeCountSettings {
  kind: 'entity' | 'alarm';
  singleEntityId?: string;
  entityType: 'ALL' | 'DEVICE' | 'ASSET';
  nameFilter: string;
  statusList: ('ACTIVE' | 'CLEARED' | 'ACK' | 'UNACK')[];
  severityList: ('CRITICAL' | 'MAJOR' | 'MINOR' | 'WARNING' | 'INDETERMINATE')[];
  typeList: string;
  timeWindowMs: number;
  label: string;
  showLabel: boolean;
  layout: 'row' | 'column';
  showIcon: boolean;
  icon: string;
  iconSize: number;
  iconColor: string;
  iconBackgroundColor: string;
  showIconBackground: boolean;
  valueColor: string;
  valueFontSize: number;
}
export interface NativeAttributeCardSettings {
  showSourceTitle: boolean;
  labelWidth: number;
  showMissing: boolean;
}
export interface NativeAlarmTableSettings {
  singleEntityId?: string;
  enableSelection: boolean;
  enableSearch: boolean;
  enableFilter: boolean;
  displayDetails: boolean;
  displayPagination: boolean;
  defaultPageSize: number;
  defaultSortOrder: 'ASC' | 'DESC';
  statusList: string[];
  severityList: string[];
  useTimeWindow: boolean;
  allowAcknowledgment: boolean;
  allowClear: boolean;
}
export interface NativeDeviceClaimSettings {
  deviceSecret: boolean;
  showLabel: boolean;
  deviceLabel: string;
  secretKeyLabel: string;
  claimButtonLabel: string;
  successfulClaimDevice: string;
  failedClaimDevice: string;
}
export interface NativeEntityHierarchySettings {
  relationType: string;
  direction: 'FROM' | 'TO';
  maxDepth: number;
  showEntityType: boolean;
  sortByName: boolean;
  expandRoot: boolean;
}
export interface NativeEntityTableColumn {
  type: 'TIME_SERIES' | 'SERVER_ATTRIBUTE' | 'CLIENT_ATTRIBUTE' | 'SHARED_ATTRIBUTE';
  key: string;
  label: string;
}
export interface NativeEntityTableSettings {
  entityType: 'DEVICE' | 'ASSET';
  singleEntityId?: string;
  enableSearch: boolean;
  displayPagination: boolean;
  pageSize: number;
  sortOrder: 'ASC' | 'DESC';
  showLabel: boolean;
  showType: boolean;
  stickyHeader: boolean;
  columns: NativeEntityTableColumn[];
  adminMode: boolean;
  allowCreate: boolean;
  allowEdit: boolean;
  allowDelete: boolean;
  editLocation: boolean;
}
export interface NativeWindSettings {
  layout: 'default' | 'advanced' | 'simplified';
  centerValueFontSize: number;
  centerValueColor: NativeLiquidColor;
  ticksColor: string;
  directionalNamesElseDegrees: boolean;
  majorTicksColor: string;
  majorTicksFontSize: number;
  minorTicksColor: string;
  minorTicksFontSize: number;
  arrowColor: string;
  backgroundType: 'color' | 'image';
  backgroundColor: string;
  backgroundImage: string;
  overlayEnabled: boolean;
  overlayColor: string;
  overlayBlur: number;
  padding: number;
}
export interface NativeRpcButtonSettings {
  methodName: string;
  methodParams: string;
  requestTimeout: number;
  oneWayElseTwoWay: boolean;
  buttonText: string;
  styleButton: { isRaised: boolean; isPrimary: boolean; bgColor?: string | null; textColor?: string | null };
}
export interface NativeBatterySettings {
  layout: 'vertical_solid' | 'horizontal_solid' | 'vertical_divided' | 'horizontal_divided';
  sectionsCount: number;
  showValue: boolean;
  autoScaleValueSize: boolean;
  valueFontSize: number;
  valueColor: NativeLiquidColor;
  batteryLevelColor: NativeLiquidColor;
  batteryShapeColor: NativeLiquidColor;
  padding: number;
}
export interface NativeSignalSettings {
  layout: 'wifi' | 'cellular_bar';
  showDate: boolean;
  dateFormat: 'locale' | 'date' | 'time' | 'iso' | 'relative';
  dateFontSize: number;
  dateColor: string;
  activeBarsColor: NativeLiquidColor;
  noSignalRssiValue: number;
  inactiveBarsColor: string;
  showTooltip: boolean;
  showTooltipValue: boolean;
  tooltipValueFontSize: number;
  tooltipValueColor: string;
  showTooltipDate: boolean;
  tooltipDateFormat: 'locale' | 'date' | 'time' | 'iso' | 'relative';
  tooltipDateFontSize: number;
  tooltipDateColor: string;
  tooltipBackgroundColor: string;
  tooltipBackgroundBlur: number;
  padding: number;
}
export interface NativeStateSettings {
  includePrevious: boolean;
  extendToEnd: boolean;
  states: {
    label: string;
    value: number;
    sourceType: 'constant' | 'range';
    sourceValue?: string | number | boolean;
    sourceRangeFrom?: number | null;
    sourceRangeTo?: number | null;
  }[];
}
export interface NativePresentation {
  layout: 'vertical' | 'horizontal';
  labelPosition: 'top' | 'bottom' | 'left';
  showValue: boolean;
  labelFontSize: number;
  labelColor: string;
  valueColor: string;
  dateFormat: 'locale' | 'date' | 'time' | 'iso' | 'relative';
}
export interface NativeSeriesSettings {
  type: 'line' | 'bar' | 'scatter';
  lineWidth: number;
  smooth: boolean;
  step: false | 'start' | 'middle' | 'end';
  showPoints: boolean;
  pointSize: number;
  area: boolean;
  axisId: string;
  hidden: boolean;
  showLabel: boolean;
}
export interface NativeAxis {
  id: string;
  label: string;
  position: 'left' | 'right';
  min: number | null;
  max: number | null;
}
export interface NativeChartSettings {
  axes: NativeAxis[];
  stack: boolean;
  dataZoom: boolean;
  legendPosition: 'top' | 'bottom' | 'left' | 'right';
  tooltip: boolean;
  animation: boolean;
  thresholds: { value: number; label: string; color: string; axisId: string }[];
}
export interface NativeTableSettings {
  search: boolean;
  showTimestamp: boolean;
  stickyHeader: boolean;
  pagination: boolean;
  pageSize: number;
  sortOrder: 'asc' | 'desc';
}
export interface NativeProgressSettings {
  direction: 'horizontal' | 'vertical';
  showTicks: boolean;
  trackColor: string;
}
export interface NativeGaugeSettings {
  type: 'radial' | 'arc' | 'linear' | 'thermometer';
  direction?: 'horizontal' | 'vertical';
  startAngle: number;
  endAngle: number;
  splitNumber: number;
  showTicks: boolean;
  showPointer: boolean;
  width: number;
}
export interface NativePieSettings {
  innerRadius: number;
  showPercent: boolean;
  showTotal: boolean;
  totalLabel: string;
  totalDecimals: number;
  totalUnits: string;
  clockwise: boolean;
}
export interface NativeLatestBarSettings {
  horizontal: boolean;
  min: number | null;
  max: number | null;
  barWidth: number;
  showAxisLabels: boolean;
}
export interface NativeRadialSettings {
  min: number | null;
  max: number | null;
  startAngle: number;
  splitNumber: number;
  showAxisLabels: boolean;
  showTickLabels: boolean;
  shape: 'polygon' | 'circle';
  normalizeAxes: boolean;
  color: string;
  showLine: boolean;
  lineWidth: number;
  lineType: 'solid' | 'dashed' | 'dotted';
  showPoints: boolean;
  pointSize: number;
  pointShape: 'circle' | 'rect' | 'roundRect' | 'triangle' | 'diamond' | 'pin' | 'arrow';
  fillArea: boolean;
  areaOpacity: number;
  barWidth: number;
}
export interface NativeAggregateSlot {
  id: string;
  position: 'center' | 'rightTop' | 'rightBottom' | 'leftTop' | 'leftBottom';
  label: string;
  aggregationType: 'NONE' | 'AVG' | 'MIN' | 'MAX' | 'SUM' | 'COUNT';
  comparisonEnabled: boolean;
  timeForComparison: 'previousInterval' | 'customInterval' | 'day' | 'week' | 'month' | 'year';
  comparisonCustomIntervalValue: number;
  comparisonResultType: 'PREVIOUS_VALUE' | 'DELTA_ABSOLUTE' | 'DELTA_PERCENT';
  units: string;
  decimals: number;
  showArrow: boolean;
  fontSize: number;
  color: string;
}
export interface NativeLiquidColor {
  color: string;
  ranges: { from: number | null; to: number | null; color: string }[];
}
export interface NativeLiquidSettings {
  shape: string;
  layout: 'simple' | 'percentage' | 'absolute';
  datasourceUnits: string;
  capacity: number;
  capacityUnits: string;
  displayUnits: string;
  tankColor: NativeLiquidColor;
  liquidColor: NativeLiquidColor;
  valueColor: NativeLiquidColor;
  backgroundOverlayColor: NativeLiquidColor;
  volumeColor: string;
  volumeFontSize: number;
  showOverlay: boolean;
  animation: boolean;
  showTooltip: boolean;
  showTooltipDate: boolean;
  tooltipUnits: string;
  tooltipDecimals: number;
  bindings: Partial<
    Record<
      'shape' | 'capacity' | 'capacityUnits' | 'displayUnits',
      { name: string; scope: 'CLIENT_SCOPE' | 'SERVER_SCOPE' | 'SHARED_SCOPE' }
    >
  >;
}
export interface NativeSource extends TbDatasource {
  entityType: 'DEVICE' | 'ASSET';
  entityId: string;
  dataKeys: (TbDataKey & { scope?: 'CLIENT_SCOPE' | 'SERVER_SCOPE' | 'SHARED_SCOPE' })[];
}
export interface NativeOptions {
  version: 1;
  fqn: string;
  family: NativeFamily;
  rawSource?: Record<string, any>;
  window: {
    realtime: boolean;
    calendar?: 'day' | 'week' | 'month';
    durationMs: number;
    startTs?: number;
    endTs?: number;
    intervalMs: number;
    aggregation: 'NONE' | 'AVG' | 'MIN' | 'MAX' | 'SUM' | 'COUNT';
  };
  pollMs: number;
  min: number;
  max: number;
  showLegend: boolean;
  showDate: boolean;
  showLabel: boolean;
  fontSize: number;
  chartType: 'line' | 'bar' | 'scatter';
  thresholds: { from: number | null; to: number | null; color: string }[];
  presentation?: NativePresentation;
  chart?: NativeChartSettings;
  table?: NativeTableSettings;
  progress?: NativeProgressSettings;
  gauge?: NativeGaugeSettings;
  pie?: NativePieSettings;
  latestBar?: NativeLatestBarSettings;
  radial?: NativeRadialSettings;
  range?: { fillOpacity: number; outOfRangeColor: string; showBoundaries: boolean };
  liquid?: NativeLiquidSettings;
  state?: NativeStateSettings;
  battery?: NativeBatterySettings;
  signal?: NativeSignalSettings;
  wind?: NativeWindSettings;
  rpcButton?: NativeRpcButtonSettings;
  control?: NativeControlSettings;
  advancedControl?: NativeAdvancedControlSettings;
  input?: NativeInputSettings;
  locationInput?: NativeLocationSettings;
  photoInput?: NativePhotoSettings;
  ledIndicator?: NativeLedSettings;
  multiInput?: NativeMultiInputSettings;
  count?: NativeCountSettings;
  attributeCard?: NativeAttributeCardSettings;
  alarmTable?: NativeAlarmTableSettings;
  deviceClaim?: NativeDeviceClaimSettings;
  entityHierarchy?: NativeEntityHierarchySettings;
  entityTable?: NativeEntityTableSettings;
  aggregate?: { showChart: boolean; showSubtitle: boolean; subtitle: string; slots: NativeAggregateSlot[] };
}
