"""生成原生目录和包归属投影；保留原始图片引用，不复制执行脚本或凭证。"""
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
    'tb-range-chart-widget-settings': 'range',
    'tb-liquid-level-card-widget-settings': 'liquid',
    'tb-aggregated-value-card-widget-settings': 'aggregate',
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
    # 精确支持的时序部件；不得将状态/范围部件降级成普通曲线。
    if source['fqn'] in ('time_series_chart', 'line_chart', 'bar_chart', 'point_chart') and descriptor.get('settingsDirective') == 'tb-time-series-chart-widget-settings':
        family = 'timeseries'
    if source['fqn'] == 'state_chart' and descriptor.get('settingsDirective') == 'tb-time-series-chart-widget-settings':
        family = 'state'
    if source['fqn'] == 'bars' and descriptor.get('settingsDirective') == 'tb-bar-chart-widget-settings':
        family = 'latestBar'
    if source['fqn'] == 'radar' and descriptor.get('settingsDirective') == 'tb-radar-chart-widget-settings':
        family = 'radar'
    if source['fqn'] == 'polar_area' and descriptor.get('settingsDirective') == 'tb-polar-area-chart-widget-settings':
        family = 'polar'
    if source['fqn'] in ('doughnut', 'horizontal_doughnut') and descriptor.get('settingsDirective') == 'tb-doughnut-widget-settings':
        family = 'pie'
    entry = {
        'fqn': source['fqn'], 'name': source['name'],
        'description': source.get('description', ''), 'tags': source.get('tags', []),
        'image': source.get('image', ''),
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
            'thresholds': settings.get('rangeColors', []) if family == 'range' else (settings.get('valueColor') or {}).get('rangeList', []) if isinstance(settings.get('valueColor'), dict) else [],
            'range': {'fillOpacity': settings.get('fillAreaOpacity', 0.7), 'outOfRangeColor': settings.get('outOfRangeColor', '#ccc'), 'showBoundaries': settings.get('showRangeThresholds', True)},
            'chartType': 'bar' if source['fqn'] in ('bar_chart', 'bar_chart_with_labels') else 'scatter' if source['fqn'] == 'point_chart' else 'line',
            'gaugeType': settings.get('gaugeType', 'radial'),
            'innerRadius': 55 if source['fqn'] in ('doughnut', 'horizontal_doughnut') else 45 if descriptor.get('settingsDirective') == 'tb-doughnut-chart-widget-settings' else 0,
            'layout': settings.get('layout', 'vertical'),
            'labelPosition': settings.get('labelPosition', 'top'),
            'dateFormat': settings.get('dateFormat', 'locale'),
        } if family else {},
    }
    if family == 'state':
        entry['preset']['states'] = settings.get('states', [])
    if family == 'liquid':
        colors = {}
        for field, default in [('tankColor','#242770'),('liquidColor','#7A8BFF'),('valueColor','#dae9f6'),('backgroundOverlayColor','rgba(255,255,255,.76)')]:
            color = settings.get(field, {})
            colors[field] = {'color': color.get('color', default), 'ranges': color.get('rangeList', [])} if isinstance(color, dict) else {'color': color or default, 'ranges': []}
        entry['preset']['liquid'] = {'shape':settings.get('selectedShape','Vertical Cylinder'), 'layout':settings.get('layout','percentage'), 'datasourceUnits':settings.get('datasourceUnits','%'), 'capacity':settings.get('volumeConstant',500), 'capacityUnits':settings.get('volumeUnits','L'), 'displayUnits':config.get('units') or 'L', **colors}
    entries.append(entry)

target = ROOT / 'frontend/src/views/tb/dashboard/runtime/native/nativeWidgetCatalog.generated.json'
target.parent.mkdir(parents=True, exist_ok=True)
target.write_text(json.dumps(entries, ensure_ascii=False, separators=(',', ':')) + '\n', encoding='utf-8')
bundles = []
for file in (ROOT / 'backend/application/src/main/data/json/system/widget_bundles').glob('*.json'):
    source = json.loads(file.read_text(encoding='utf-8'))
    bundle = source['widgetsBundle']
    bundles.append({key: bundle.get(key, '') for key in ('alias', 'title', 'description', 'image', 'order')} |
                   {'widgetTypeFqns': source.get('widgetTypeFqns', [])})
bundles.sort(key=lambda bundle: (bundle['order'], bundle['alias']))
(target.parent / 'nativeWidgetBundles.generated.json').write_text(
    json.dumps(bundles, ensure_ascii=False, separators=(',', ':')) + '\n', encoding='utf-8')
print(f'Generated {len(entries)} definitions, {sum(bool(x["family"]) for x in entries)} Vue base adapters')
print(f'Generated {len(bundles)} original bundles (including unresolved resource references)')
