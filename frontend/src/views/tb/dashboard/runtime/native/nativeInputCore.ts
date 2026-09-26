export type NativeInputValueType = 'boolean' | 'integer' | 'double' | 'string' | 'date' | 'json' | 'image';
export interface NativeInputSpec {
  mode: 'attribute' | 'timeseries';
  scope?: 'SERVER_SCOPE' | 'SHARED_SCOPE';
  valueType: NativeInputValueType;
}

/** Only these exact bundled definitions may use the write-capable adapter. */
export function nativeInputSpec(
  fqn: string,
  settings?: { widgetMode?: 'ATTRIBUTE' | 'TIME_SERIES'; attributeScope?: 'SERVER_SCOPE' | 'SHARED_SCOPE' },
): NativeInputSpec | null {
  if (fqn === 'input_widgets.update_json_attribute') {
    const mode = settings?.widgetMode || 'ATTRIBUTE';
    const scope = settings?.attributeScope || 'SERVER_SCOPE';
    if (!['ATTRIBUTE', 'TIME_SERIES'].includes(mode) || !['SERVER_SCOPE', 'SHARED_SCOPE'].includes(scope)) return null;
    return mode === 'TIME_SERIES'
      ? { mode: 'timeseries', valueType: 'json' }
      : { mode: 'attribute', scope, valueType: 'json' };
  }
  const image = /^input_widgets\.update_(server|shared)_image_attribute$/.exec(fqn);
  if (image)
    return { mode: 'attribute', scope: image[1] === 'server' ? 'SERVER_SCOPE' : 'SHARED_SCOPE', valueType: 'image' };
  const attribute = /^input_widgets\.update_(server|shared)_(boolean|date|double|integer|string)_attribute$/.exec(fqn);
  if (attribute)
    return {
      mode: 'attribute',
      scope: attribute[1] === 'server' ? 'SERVER_SCOPE' : 'SHARED_SCOPE',
      valueType: attribute[2] as NativeInputValueType,
    };
  const telemetry = /^input_widgets\.update_(boolean|double|integer|string)_timeseries$/.exec(fqn);
  return telemetry ? { mode: 'timeseries', valueType: telemetry[1] as NativeInputValueType } : null;
}

export function isNativeImageData(value: unknown): value is string {
  return (
    typeof value === 'string' && /^data:image\/(?:png|jpeg|gif|webp|avif|bmp);base64,[A-Za-z0-9+/]+={0,2}$/.test(value)
  );
}

export function nativeInputValue(raw: string | boolean | null, kind: NativeInputValueType, required: boolean): unknown {
  if (kind === 'image') {
    if (raw === null) return null;
    if (!isNativeImageData(raw)) throw new Error('请选择有效的图片文件');
    return raw;
  }
  if (kind === 'boolean') return raw === true || raw === 'true';
  const text = String(raw).trim();
  if (!text) {
    if (required) throw new Error('请输入要保存的值');
    if (kind === 'string') return '';
    if (kind === 'json') return {};
    throw new Error('数值或日期不能为空');
  }
  if (kind === 'string') return text;
  if (kind === 'json') {
    let value: unknown;
    try {
      value = JSON.parse(text);
    } catch {
      throw new Error('请输入有效 JSON');
    }
    if (value === null || typeof value !== 'object') throw new Error('JSON 须为对象或数组');
    return value;
  }
  if (kind === 'date') {
    const dateOnly = /^(\d{4})-(\d{2})-(\d{2})$/.exec(text);
    const timestamp = dateOnly
      ? new Date(Number(dateOnly[1]), Number(dateOnly[2]) - 1, Number(dateOnly[3])).getTime()
      : new Date(text).getTime();
    if (!Number.isFinite(timestamp)) throw new Error('日期无效');
    if (dateOnly && new Date(timestamp).getDate() !== Number(dateOnly[3])) throw new Error('日期无效');
    return timestamp;
  }
  const value = Number(text);
  if (!Number.isFinite(value) || (kind === 'integer' && !Number.isSafeInteger(value)))
    throw new Error(kind === 'integer' ? '请输入有效整数' : '请输入有效数值');
  return value;
}

export interface NativeInputTransport {
  writeAttribute(scope: 'SERVER_SCOPE' | 'SHARED_SCOPE', data: Record<string, unknown>): Promise<unknown>;
  writeTelemetry(data: Record<string, unknown>): Promise<unknown>;
  readAttribute(scope: 'SERVER_SCOPE' | 'SHARED_SCOPE', key: string): Promise<unknown>;
  readTelemetry(key: string): Promise<unknown>;
}

/** The save operation does not report success until the same entity/key has been read again. */
export async function writeAndReadNativeInput(
  spec: NativeInputSpec,
  key: string,
  value: unknown,
  transport: NativeInputTransport,
): Promise<unknown> {
  if (!key.trim()) throw new Error('字段键不能为空');
  if (spec.mode === 'attribute') {
    if (spec.scope !== 'SERVER_SCOPE' && spec.scope !== 'SHARED_SCOPE') throw new Error('属性范围无效');
    await transport.writeAttribute(spec.scope, { [key]: value });
    return transport.readAttribute(spec.scope, key);
  }
  await transport.writeTelemetry({ [key]: value });
  return transport.readTelemetry(key);
}
