import type { NativeSeries } from './nativeWidgetDataCore';
import { nativeInputValue } from './nativeInputCore';
import type { NativeMultiInputKeySettings, NativeMultiInputSettings, NativeSource } from './nativeWidgetTypes';

export function multiKeySettings(key: NativeSource['dataKeys'][number]): NativeMultiInputKeySettings {
  const original = key.settings || {};
  return {
    dataKeyValueType: 'string',
    required: false,
    isEditable: 'editable',
    dataKeyHidden: false,
    disabledOnDataKey: '',
    selectOptions: [],
    step: 1,
    minValue: null,
    maxValue: null,
    ...original,
    ...original.nativeMulti,
  };
}

export function validateMultiInputSettings(settings: NativeMultiInputSettings): string[] {
  const errors: string[] = [];
  if (!['row', 'column'].includes(settings.fieldsAlignment)) errors.push('多字段排列方式无效');
  if (!Number.isInteger(settings.fieldsInRow) || settings.fieldsInRow < 1 || settings.fieldsInRow > 8)
    errors.push('每行字段数应为 1–8');
  if (![settings.rowGap, settings.columnGap].every((value) => Number.isFinite(value) && value >= 0 && value <= 80))
    errors.push('字段间距应为 0–80');
  return errors;
}

export function validateMultiInputKey(key: NativeSource['dataKeys'][number], entityType: string): string[] {
  const settings = multiKeySettings(key);
  const errors: string[] = [];
  if (key.type === 'attribute' && !['SERVER_SCOPE', 'SHARED_SCOPE'].includes(key.scope || ''))
    errors.push(`${key.name} 仅支持服务端或共享属性`);
  if (key.scope === 'SHARED_SCOPE' && entityType !== 'DEVICE') errors.push(`${key.name} 共享属性仅支持设备`);
  if (
    ![
      'string',
      'double',
      'integer',
      'JSON',
      'booleanCheckbox',
      'booleanSwitch',
      'dateTime',
      'date',
      'time',
      'select',
      'radio',
      'color',
    ].includes(settings.dataKeyValueType)
  )
    errors.push(`${key.name} 输入类型无效`);
  if (!['editable', 'disabled', 'readonly'].includes(settings.isEditable)) errors.push(`${key.name} 编辑权限无效`);
  if (!Array.isArray(settings.selectOptions)) errors.push(`${key.name} 选项配置无效`);
  else if (['select', 'radio'].includes(settings.dataKeyValueType) && !settings.selectOptions.length)
    errors.push(`${key.name} 需要至少一个选项`);
  if (Array.isArray(settings.selectOptions) && settings.selectOptions.some((option) => !option?.label?.trim()))
    errors.push(`${key.name} 选项标签不能为空`);
  if (settings.minValue != null && !Number.isFinite(settings.minValue)) errors.push(`${key.name} 最小值无效`);
  if (settings.maxValue != null && !Number.isFinite(settings.maxValue)) errors.push(`${key.name} 最大值无效`);
  if (settings.minValue != null && settings.maxValue != null && settings.minValue > settings.maxValue)
    errors.push(`${key.name} 最大值须大于最小值`);
  if (key.settings?.useGetValueFunction || key.settings?.useSetValueFunction)
    errors.push(`${key.name} 的自定义取值/设值脚本不能在 Vue 中执行`);
  return errors;
}

export function multiInputValue(raw: string | boolean, settings: NativeMultiInputKeySettings): unknown {
  const kind = settings.dataKeyValueType;
  let value: unknown;
  if (kind === 'booleanCheckbox' || kind === 'booleanSwitch') value = nativeInputValue(raw, 'boolean', false);
  else if (kind === 'JSON') value = nativeInputValue(raw, 'json', settings.required);
  else if (kind === 'dateTime' || kind === 'date') value = nativeInputValue(raw, 'date', settings.required);
  else if (kind === 'time') {
    const match = /^(\d{2}):(\d{2})$/.exec(String(raw));
    if (!match || Number(match[1]) > 23 || Number(match[2]) > 59) throw new Error('时间须为 HH:mm');
    value = (Number(match[1]) * 60 + Number(match[2])) * 60000;
  } else if (kind === 'double' || kind === 'integer') value = nativeInputValue(raw, kind, true);
  else if (kind === 'select' || kind === 'radio') {
    const option = settings.selectOptions.find((item) => String(item.value ?? '') === String(raw));
    if (!option) throw new Error('请选择有效选项');
    value = option.value;
  } else value = nativeInputValue(raw, 'string', settings.required);
  if (
    typeof value === 'number' &&
    ((settings.minValue != null && value < settings.minValue) ||
      (settings.maxValue != null && value > settings.maxValue))
  )
    throw new Error('数值超出配置范围');
  return value;
}

export function multiInputDisplay(
  value: unknown,
  kind: NativeMultiInputKeySettings['dataKeyValueType'],
): string | boolean {
  if (kind === 'booleanCheckbox' || kind === 'booleanSwitch') return value === true || value === 'true';
  if (value == null) return '';
  if (kind === 'JSON') {
    let parsed = value;
    if (typeof value === 'string') {
      try {
        parsed = JSON.parse(value);
      } catch {
        return value;
      }
    }
    return JSON.stringify(parsed, null, 2);
  }
  if (kind === 'date' || kind === 'dateTime') {
    const time = Number(value);
    if (!Number.isFinite(time)) return '';
    const date = new Date(time);
    const local = new Date(time - date.getTimezoneOffset() * 60000).toISOString();
    return kind === 'date' ? local.slice(0, 10) : local.slice(0, 16);
  }
  if (kind === 'time') {
    const minutes = Math.floor(Number(value) / 60000);
    if (!Number.isFinite(minutes)) return '';
    return `${String(Math.floor(minutes / 60) % 24).padStart(2, '0')}:${String(minutes % 60).padStart(2, '0')}`;
  }
  return String(value);
}

export interface MultiInputChange {
  series: NativeSeries;
  scope: 'SERVER_SCOPE' | 'SHARED_SCOPE' | 'timeseries';
  value: unknown;
}

/** Only explicit, editable, changed values enter the write batch. */
export function collectMultiInputChanges(
  series: NativeSeries[],
  drafts: Record<string, string | boolean>,
  updateAllValues: boolean,
  allSeries: NativeSeries[] = series,
): MultiInputChange[] {
  const changes: MultiInputChange[] = [];
  for (const entry of series) {
    const settings = multiKeySettings(entry.key);
    if (settings.dataKeyHidden || settings.isEditable !== 'editable') continue;
    if (settings.disabledOnDataKey) {
      const gate = allSeries.find(
        (other) => other.entityId === entry.entityId && other.key.name === settings.disabledOnDataKey,
      );
      const gateValue = gate ? drafts[gate.id] : undefined;
      if (
        gateValue === true ||
        (typeof gateValue === 'string' && gateValue !== '' && gateValue !== 'false' && gateValue !== '0')
      )
        continue;
    }
    const raw = drafts[entry.id];
    const value = multiInputValue(raw ?? '', settings);
    if (!updateAllValues && JSON.stringify(value) === JSON.stringify(entry.latest?.value)) continue;
    changes.push({
      series: entry,
      scope:
        entry.key.type === 'timeseries'
          ? 'timeseries'
          : entry.key.scope === 'SHARED_SCOPE'
            ? 'SHARED_SCOPE'
            : 'SERVER_SCOPE',
      value,
    });
  }
  return changes;
}
