"""从仓库原生定义生成只读兼容目录；不复制脚本、图片或连接凭证。"""
import json
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
FAMILIES = {
    'tb-value-card-widget-settings': 'value',
    'tb-value-chart-card-widget-settings': 'valueChart',
    'tb-progress-bar-widget-settings': 'progress',
    'tb-digital-gauge-widget-settings': 'gauge',
    'tb-analogue-radial-gauge-widget-settings': 'gauge',
    'tb-timeseries-table-widget-settings': 'table',
    'tb-pie-chart-widget-settings': 'pie',
    'tb-doughnut-chart-widget-settings': 'pie',
    'tb-bar-chart-with-labels-widget-settings': 'bar',
}

def fingerprint(value):
    # UTF-16 code units, matching JavaScript charCodeAt.
    result = 2166136261
    raw = value.encode('utf-16-le')
    for i in range(0, len(raw), 2):
        result = ((result ^ (raw[i] + (raw[i + 1] << 8))) * 16777619) & 0xffffffff
    return format(result, '08x')

entries = []
for file in sorted((ROOT / 'backend/application/src/main/data/json/system/widget_types').glob('*.json')):
    source = json.loads(file.read_text(encoding='utf-8'))
    descriptor = source['descriptor']
    config = json.loads(descriptor.get('defaultConfig') or '{}')
    settings = config.get('settings', {})
    family = FAMILIES.get(descriptor.get('settingsDirective'))
    # Only the three explicitly supported time-series variants; no state/mixed fallback.
    if file.stem in ('line_chart', 'bar_chart', 'point_chart') and descriptor.get('settingsDirective') == 'tb-time-series-chart-widget-settings':
        family = 'timeseries'
    entry = {
        'fqn': source['fqn'], 'name': source['name'],
        'description': source.get('description', ''), 'tags': source.get('tags', []),
        'type': descriptor['type'], 'deprecated': source.get('deprecated', False),
        'family': family,
        'signature': fingerprint(descriptor.get('templateHtml', '') + '\n' + descriptor.get('controllerScript', '')),
        'preset': {
            'units': config.get('units') or '', 'decimals': config.get('decimals', 2),
            'min': settings.get('tickMin', settings.get('minValue', 0)),
            'max': settings.get('tickMax', settings.get('maxValue', 100)),
            'showDate': settings.get('showDate', False),
            'showLabel': settings.get('showLabel', True),
            'fontSize': settings.get('valueFont', {}).get('size', 36),
            'thresholds': (settings.get('valueColor') or {}).get('rangeList', []) if isinstance(settings.get('valueColor'), dict) else [],
            'chartType': 'bar' if file.stem == 'bar_chart' else 'scatter' if file.stem == 'point_chart' else 'line',
        } if family else {},
    }
    entries.append(entry)

target = ROOT / 'frontend/src/views/tb/dashboard/runtime/native/nativeWidgetCatalog.generated.json'
target.parent.mkdir(parents=True, exist_ok=True)
target.write_text(json.dumps(entries, ensure_ascii=False, separators=(',', ':')) + '\n', encoding='utf-8')
print(f'Generated {len(entries)} definitions, {sum(bool(x["family"]) for x in entries)} Vue base adapters')
