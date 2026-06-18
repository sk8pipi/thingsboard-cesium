export type WidgetSource = 'local' | 'thingsboard' | 'thingsboard-import';

/** 你库里支持的 widget 类型（与 import adapter / registry 对齐） */
export type LibraryWidgetKind = 'chart' | 'pie' | 'bar' | 'static' | 'cesium3d' | 'unknown';

export type CustomWidgetDefinition = {
  id: string;
  name: string;
  source: WidgetSource;

  kind: LibraryWidgetKind;

  createdAt?: number;

  /** 导入后生成实例时使用的默认配置 */
  defaultConfig: Record<string, any>;

  /** 对齐 ThingsBoard / registry */
  typeFullFqn?: string;
  localWidgetKey?: string;

  /** 原始 JSON，便于后续兼容升级 */
  raw?: any;

  /** 兼容你旧结构，先保留 */
  tb?: {
    bundleAlias?: string;
    widgetTypeAlias?: string;
    raw: any;
  };
};
