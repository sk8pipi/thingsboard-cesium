import { createNativeWidget, getNativeWidgetSupport } from '../../dashboard/runtime/native/nativeWidgetCatalog';
import type { CustomWidgetDefinition } from './types';

/** 保留原始 JSON；未知类型不猜测成折线图，也不执行函数数据源。 */
export function importThingsboardJson(input: any): CustomWidgetDefinition[] {
  const extract = (value: any): any[] => {
    if (!value || typeof value !== 'object') return [];
    if (Array.isArray(value)) return value.flatMap(extract);
    if (value.descriptor || value.typeFullFqn || value.config?.native) return [value];
    if (value.widget) return extract(value.widget);
    if (value.widgetType) return extract(value.widgetType);
    if (value.widgetTypes) return extract(value.widgetTypes);
    if (value.widgets) return extract(Array.isArray(value.widgets) ? value.widgets : Object.values(value.widgets));
    if (value.bundles) return extract(value.bundles);
    return [];
  };
  return extract(input).map((raw, index) => {
    const support = getNativeWidgetSupport(raw);
    const widget = support.supported ? createNativeWidget(raw) : null;
    return {
      id: `import-${Date.now()}-${index}`,
      name: raw.name || raw.title || raw.typeFullFqn || raw.fqn || '未命名部件',
      source: 'thingsboard-import',
      kind: support.supported ? 'native' : 'unknown',
      typeFullFqn: widget?.typeFullFqn || raw.typeFullFqn || raw.fqn,
      localWidgetKey: widget?.widgetKey,
      defaultConfig: widget?.config || {},
      raw: JSON.parse(JSON.stringify(raw)),
    };
  });
}
