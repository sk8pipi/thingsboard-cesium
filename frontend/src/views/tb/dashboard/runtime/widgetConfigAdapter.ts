/**
 * Compatibility facade for callers that previously depended on a page-level
 * config adapter. The implementation now lives in the shared widget core.
 */
export {
  buildWidgetConfig,
  createWidgetInstance,
  mergeWidgetConfig,
  normalizeWidgetInstance,
  normalizeWidgetList,
  normalizeWidgetRecord,
  resolveWidgetDefinitionKey,
} from './widgets/core/widgetInstance';

export type { WidgetDatasourceBinding, WidgetDefinition, WidgetRegistryItem } from './widgets/core/widgetDefinition';
