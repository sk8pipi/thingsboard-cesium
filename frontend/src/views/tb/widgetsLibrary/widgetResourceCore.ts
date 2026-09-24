export type ResourceRecord = Record<string, any>;

// 与原生 prepareExport 一致，仅去除当前服务器的实体标识，保留 descriptor 和资源。
export function prepareResourceExport(source: ResourceRecord): ResourceRecord {
  const result = JSON.parse(JSON.stringify(source));
  for (const key of ['id', 'createdTime', 'tenantId', 'customerId', 'externalId', 'version']) delete result[key];
  return result;
}

export function createBundleExport(bundle: ResourceRecord, widgets: ResourceRecord[]) {
  if (!Array.isArray(widgets) || !widgets.every(isWidgetDefinition)) {
    throw new Error('服务器未返回完整的包内部件定义，无法导出。');
  }
  return { widgetsBundle: prepareResourceExport(bundle), widgetTypes: widgets.map(prepareResourceExport) };
}

function isRecord(value: unknown): value is ResourceRecord {
  return !!value && typeof value === 'object' && !Array.isArray(value);
}

export function isWidgetDefinition(value: unknown): value is ResourceRecord {
  return isRecord(value) && typeof value.name === 'string' && !!value.name.trim() && isRecord(value.descriptor);
}

export function parseResourceImport(text: string): {
  kind: 'widget' | 'bundle';
  original: ResourceRecord;
  widgets: ResourceRecord[];
  references: string[];
  title: string;
} {
  if (text.length > 20 * 1024 * 1024) throw new Error('文件超过 20 MB，请拆分后导入预览。');
  let original: unknown;
  try {
    original = JSON.parse(text);
  } catch {
    throw new Error('JSON 格式无效，请选择 ThingsBoard 导出的部件或部件包文件。');
  }
  if (isWidgetDefinition(original)) {
    return { kind: 'widget', original, widgets: [original], references: [], title: original.name };
  }
  if (!isRecord(original) || !isRecord(original.widgetsBundle) || typeof original.widgetsBundle.title !== 'string') {
    throw new Error('文件不是完整部件定义或原生部件包格式，列表摘要不能用于导入。');
  }
  const widgets = original.widgetTypes ?? [];
  const references = original.widgetTypeFqns ?? [];
  if (
    !Array.isArray(widgets) ||
    !widgets.every(isWidgetDefinition) ||
    !Array.isArray(references) ||
    !references.every((key) => typeof key === 'string')
  ) {
    throw new Error('部件包中的 widgetTypes 或 widgetTypeFqns 格式无效。');
  }
  if (!('widgetTypes' in original) && !('widgetTypeFqns' in original))
    throw new Error('部件包缺少部件定义或引用列表。');
  return { kind: 'bundle', original, widgets, references, title: original.widgetsBundle.title };
}

export function safePreviewSource(value: unknown): string {
  if (typeof value !== 'string') return '';
  const source = value.trim().replace(/^tb-image(?:\:[^;]*)?;/, '');
  if (/^data:image\/(png|jpe?g|gif|webp|svg\+xml);base64,/i.test(source)) return source;
  // 仅把明确的图片 API 地址交给携带认证信息的请求客户端。
  const match = source.match(/^\/api\/images\/(system|tenant|public)\/([^/?#]+)$/);
  if (match) {
    try {
      const key = decodeURIComponent(match[2]);
      // 检查解码后的单段文件名，拒绝编码斜线、控制符和二次编码路径。
      if (!key || key === '.' || key === '..' || /[\\/\x00-\x1f\x7f%?#]/.test(key)) return '';
      return `/api/images/${match[1]}/${encodeURIComponent(key)}`;
    } catch {
      return '';
    }
  }
  return '';
}

// 只在正在显示的组件之间复用，最后一个引用卸载即释放，避免跨会话长驻缓存。
export function createPreviewImageCache(load: (source: string) => Promise<Blob>) {
  const entries = new Map<string, { references: number; promise: Promise<Blob> }>();
  return {
    acquire(source: string) {
      let entry = entries.get(source);
      if (!entry) {
        const promise = Promise.resolve()
          .then(() => load(source))
          .then((blob) => {
            if (!(blob instanceof Blob) || !blob.type.startsWith('image/')) throw new Error('Invalid image response');
            return blob;
          })
          .catch((error) => {
            if (entries.get(source) === entry) entries.delete(source);
            throw error;
          });
        entry = { references: 0, promise };
        entries.set(source, entry);
      }
      entry.references++;
      let released = false;
      return {
        promise: entry.promise,
        release: () => {
          if (released) return;
          released = true;
          if (--entry!.references === 0 && entries.get(source) === entry) entries.delete(source);
        },
      };
    },
  };
}

export function resourceFilename(title: unknown): string {
  return (
    (String(title || 'widget')
      .replace(/[<>:"/\\|?*\x00-\x1f]/g, '_')
      .slice(0, 100) || 'widget') + '.json'
  );
}

export function downloadResourceJson(source: ResourceRecord, title: unknown) {
  const url = URL.createObjectURL(
    new Blob([JSON.stringify(source, null, 2)], { type: 'application/json;charset=utf-8' }),
  );
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = resourceFilename(title);
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
