import bundleProjection from './nativeWidgetBundles.generated.json';
import catalog from './nativeWidgetCatalog.generated.json';

export interface NativeBrowseBundle {
  alias: string;
  title: string;
  description?: string;
  image?: string;
  order: number;
  id?: string;
  widgetTypeFqns?: string[];
}
export interface NativeBrowseWidget {
  fqn: string;
  name: string;
  description?: string;
  image?: string;
  type: string;
  deprecated: boolean;
  tags: string[];
  source: Record<string, any>;
  unresolved?: boolean;
  local?: boolean;
}
// These source definitions remain in ThingsBoard for import/export compatibility, but the
// product scope explicitly excludes them from the Vue widget picker.
export const hiddenNativeWidgetFqns = new Set([
  'image_map',
  'map',
  'route_map',
  'trip_map',
  'maps_v2.google_maps',
  'maps_v2.here_map',
  'maps_v2.image_map',
  'maps_v2.openstreetmap',
  'maps_v2.tencent_maps',
  'maps_v2.route_map',
  'maps_v2.route_map_openstreetmap',
  'maps_v2.route_map_tencent_maps',
  'maps_v2.test',
  'input_widgets.markers_placement_google_maps',
  'input_widgets.markers_placement_image_map',
  'input_widgets.markers_placement_openstreetmap',
  'api_usage',
  'cards.dashboard_state_widget',
  'home_page_widgets.dashboards',
  'date.date_range_navigator',
  'home_page_widgets.documentation_links',
  'home_page_widgets.getting_started',
  'cards.html_card',
  'cards.html_value_card',
  'label_card',
  'cards.label_widget',
  'cards.markdown_card',
  'mobile_app_qr_code',
  'navigation_widgets.navigation_card',
  'navigation_widgets.navigation_cards',
  'cards.qr_code',
  'home_page_widgets.quick_links',
  'unread_notifications',
  'home_page_widgets.usage_info',
]);
export function isNativeWidgetVisible(fqn: unknown): boolean {
  return !hiddenNativeWidgetFqns.has(normalizeNativeFqn(fqn));
}
function visibleBundle(bundle: NativeBrowseBundle): NativeBrowseBundle | null {
  if (!Array.isArray(bundle.widgetTypeFqns)) return bundle;
  const widgetTypeFqns = (bundle.widgetTypeFqns || []).filter(isNativeWidgetVisible);
  return widgetTypeFqns.length ? { ...bundle, widgetTypeFqns } : null;
}
export const nativeWidgetBundles: NativeBrowseBundle[] = (bundleProjection as NativeBrowseBundle[])
  .map(visibleBundle)
  .filter((bundle): bundle is NativeBrowseBundle => !!bundle);
export const nativeWidgetTypeLabels: Record<string, string> = {
  timeseries: '时序',
  latest: '最新',
  rpc: '控制',
  alarm: '报警',
  static: '静态',
  unknown: '资源引用',
};
export const nativeBundleTitles: Record<string, string> = {
  charts: '图表',
  cards: '卡片',
  alarm_widgets: '报警部件',
  tables: '表格',
  count_widgets: '计数部件',
  maps_v2: '地图',
  analogue_gauges: '模拟仪表',
  buttons: '按钮',
  control_widgets: '控制部件',
  status_indicators: '状态指示器',
  digital_gauges: '数字仪表',
  industrial_widgets: '工业部件',
  indoor_environment: '室内环境',
  outdoor_environment: '室外环境',
  air_quality: '空气质量',
  liquid_level_tanks: '液位容器',
  input_widgets: '输入部件',
  navigation_widgets: '导航部件',
};
export function normalizeNativeFqn(value: unknown): string {
  return String(value || '').replace(/^system\./, '');
}
export function isSystemResource(source: Record<string, any>): boolean {
  const tenantId = typeof source.tenantId === 'string' ? source.tenantId : source.tenantId?.id;
  return !tenantId || tenantId === '00000000-0000-0000-0000-000000000000';
}
export function toBrowseWidget(source: Record<string, any>, local = false): NativeBrowseWidget {
  return {
    fqn: normalizeNativeFqn(source.fqn),
    name: source.name || source.fqn || '未命名部件',
    description: source.description,
    image: source.image,
    type: source.descriptor?.type || source.widgetType || source.type || 'unknown',
    deprecated: !!source.deprecated,
    tags: Array.isArray(source.tags) ? source.tags : [],
    source,
    local,
  };
}
export function localBundleWidgets(bundle?: NativeBrowseBundle): NativeBrowseWidget[] {
  if (!bundle)
    return catalog.filter((entry) => isNativeWidgetVisible(entry.fqn)).map((entry) => toBrowseWidget(entry, true));
  const indexed = new Map(catalog.map((entry) => [entry.fqn, entry]));
  return (bundle.widgetTypeFqns || []).filter(isNativeWidgetVisible).map((fqn) => {
    const entry = indexed.get(normalizeNativeFqn(fqn));
    return entry
      ? toBrowseWidget(entry, true)
      : {
          fqn,
          name: fqn,
          type: 'unknown',
          tags: [],
          deprecated: false,
          unresolved: true,
          local: true,
          source: { fqn },
          description: '这是原生包中的资源引用，尚未解析为可运行的 Vue 部件。',
        };
  });
}
export function mergeNativeBundles(sources: NativeBrowseBundle[]): NativeBrowseBundle[] {
  const byAlias = new Map(sources.map((bundle) => [bundle.alias, bundle]));
  const known = nativeWidgetBundles.map((local) => {
    const remote = byAlias.get(local.alias);
    return remote
      ? { ...local, ...remote, image: local.image || remote.image, widgetTypeFqns: local.widgetTypeFqns }
      : local;
  });
  return [
    ...known,
    ...sources
      .filter((bundle) => !nativeWidgetBundles.some((local) => local.alias === bundle.alias))
      .map(visibleBundle)
      .filter((bundle): bundle is NativeBrowseBundle => !!bundle),
  ].sort((a, b) => a.order - b.order);
}
export function mergeBrowseWidgets(local: NativeBrowseWidget[], sources: Record<string, any>[]): NativeBrowseWidget[] {
  const byFqn = new Map(local.map((entry) => [entry.fqn, entry]));
  for (const source of sources) {
    const remote = toBrowseWidget(source);
    if (!remote.fqn || !isNativeWidgetVisible(remote.fqn)) continue;
    const original = byFqn.get(remote.fqn);
    byFqn.set(remote.fqn, original ? { ...remote, image: remote.image || original.image } : remote);
  }
  return [...byFqn.values()];
}
export function serverBundles(sources: Record<string, any>[]): NativeBrowseBundle[] {
  return sources
    .filter(isSystemResource)
    .map((source, index) => ({
      alias: source.alias || source.id?.id || `bundle-${index}`,
      title: source.title || source.name || source.alias,
      description: source.description,
      image: source.image,
      id: typeof source.id === 'string' ? source.id : source.id?.id,
      order: source.order ?? nativeWidgetBundles.find((entry) => entry.alias === source.alias)?.order ?? 100000 + index,
    }))
    .sort((a, b) => a.order - b.order);
}
export function filterBrowseWidgets(entries: NativeBrowseWidget[], query = '', type = '', deprecated = 'current') {
  const text = query.trim().toLocaleLowerCase();
  return entries.filter(
    (entry) =>
      (!type || entry.type === type) &&
      (deprecated === 'all' || (deprecated === 'deprecated' ? entry.deprecated : !entry.deprecated)) &&
      `${entry.name} ${entry.fqn} ${entry.description || ''} ${entry.tags.join(' ')}`
        .toLocaleLowerCase()
        .includes(text),
  );
}
