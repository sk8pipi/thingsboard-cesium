"""生成原生目录和包归属投影；保留原始图片引用，不复制执行脚本或凭证。"""
import json
import re
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
    'tb-battery-level-widget-settings': 'battery',
    'tb-signal-strength-widget-settings': 'signal',
    'tb-wind-speed-direction-widget-settings': 'wind',
    'tb-label-value-card-widget-settings': 'value',
    'tb-simple-card-widget-settings': 'value',
}

def color_setting(value, fallback):
    if not isinstance(value, dict):
        return {'color': value or fallback, 'ranges': []}
    return {'color': value.get('color') or fallback,
            'ranges': [{'from': item.get('from'), 'to': item.get('to'), 'color': item.get('color', fallback)}
                       for item in value.get('rangeList', [])]}

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
    if descriptor.get('settingsDirective') == 'tb-flot-line-widget-settings':
        family = {
            'charts.basic_timeseries': 'timeseries',
            'charts.state_chart': 'state',
            'gateway_widgets.gateway_custom_statistics': 'timeseries',
            'gateway_widgets.gateway_general_chart_statistics': 'timeseries',
        }.get(source['fqn'])
    if source['fqn'] == 'charts.timeseries_bars_flot' and descriptor.get('settingsDirective') == 'tb-flot-bar-widget-settings':
        family = 'timeseries'
    if source['fqn'] == 'charts.pie' and descriptor.get('settingsDirective') == 'tb-flot-pie-widget-settings':
        family = 'pie'
    if source['fqn'] == 'bars' and descriptor.get('settingsDirective') == 'tb-bar-chart-widget-settings':
        family = 'latestBar'
    if source['fqn'] == 'radar' and descriptor.get('settingsDirective') == 'tb-radar-chart-widget-settings':
        family = 'radar'
    if source['fqn'] == 'polar_area' and descriptor.get('settingsDirective') == 'tb-polar-area-chart-widget-settings':
        family = 'polar'
    # Legacy Chart.js definitions have no configurable settings directive beyond the
    # chart shell; bind each original FQN to the matching latest-value Vue renderer.
    if descriptor.get('settingsDirective') == 'tb-chart-widget-settings':
        family = {
            'charts.bars': 'latestBar',
            'charts.pie_chart_js': 'pie',
            'charts.polar_area_chart_js': 'polar',
            'charts.radar_chart_js': 'radar',
        }.get(source['fqn'])
    if source['fqn'] in ('doughnut', 'horizontal_doughnut') and descriptor.get('settingsDirective') == 'tb-doughnut-widget-settings':
        family = 'pie'
    if ((source['fqn'] == 'control_widgets.rpcbutton' and descriptor.get('settingsDirective') == 'tb-send-rpc-widget-settings')
            or (source['fqn'] == 'command_button' and descriptor.get('settingsDirective') == 'tb-command-button-widget-settings')):
        family = 'rpcButton'
    control_kinds = {
        'control_widgets.switch_control': 'switch',
        'control_widgets.round_switch': 'roundSwitch',
        'control_widgets.slide_toggle_control': 'slideToggle',
        'control_widgets.knob_control': 'knob',
        'power_button': 'power',
        'single_switch': 'singleSwitch',
        'toggle_button': 'toggleButton',
        'slider': 'slider',
        'value_stepper': 'stepper',
    }
    if source['fqn'] in control_kinds:
        family = 'control'
    advanced_control_modes = {
        'action_button': 'actionButton',
        'gpio_widgets.basic_gpio_control': 'gpioControl',
        'gpio_widgets.gpio_panel': 'gpioPanel',
        'control_widgets.persistent_table': 'persistentTable',
        'gpio_widgets.raspberry_pi_gpio_control': 'gpioControl',
        'gpio_widgets.raspberry_pi_gpio_panel': 'gpioPanel',
        'control_widgets.rpc_debug_terminal': 'rpcTerminal',
        'control_widgets.rpc_remote_shell': 'rpcShell',
        'gateway_widgets.service_rpc': 'serviceRpc',
        'status_widget': 'status',
        'two_segment_button': 'segment',
        'control_widgets.update_attributes': 'attributeUpdate',
    }
    if source['fqn'] in advanced_control_modes:
        family = 'advancedControl'
    if source['fqn'] == 'input_widgets.update_multiple_attributes' and descriptor.get('settingsDirective') == 'tb-update-multiple-attributes-widget-settings':
        family = 'multiInput'
    if ((source['fqn'] == 'entity_count' and descriptor.get('settingsDirective') == 'tb-entity-count-widget-settings')
            or (source['fqn'] == 'alarm_count' and descriptor.get('settingsDirective') == 'tb-alarm-count-widget-settings')):
        family = 'count'
    if source['fqn'] == 'cards.attributes_card' and descriptor.get('type') == 'latest' and not descriptor.get('settingsDirective'):
        family = 'attributeCard'
    if source['fqn'] == 'alarm_widgets.alarms_table' and descriptor.get('type') == 'alarm' and descriptor.get('settingsDirective') == 'tb-alarms-table-widget-settings':
        family = 'alarmTable'
    if source['fqn'] == 'input_widgets.device_claiming_widget' and descriptor.get('type') == 'static' and descriptor.get('settingsDirective') == 'tb-device-claiming-widget-settings':
        family = 'deviceClaim'
    if source['fqn'] == 'cards.entities_hierarchy' and descriptor.get('type') == 'latest' and descriptor.get('settingsDirective') == 'tb-entities-hierarchy-widget-settings':
        family = 'entityHierarchy'
    if (source['fqn'] in ('cards.entities_table',
                          'entity_admin_widgets.asset_admin_table',
                          'entity_admin_widgets.device_admin_table')
            and descriptor.get('type') == 'latest'
            and descriptor.get('settingsDirective') == 'tb-entities-table-widget-settings'):
        family = 'entityTable'
    if source['fqn'] == 'analogue_gauges.analogue_compass' and descriptor.get('settingsDirective') == 'tb-analogue-compass-widget-settings':
        family = 'wind'
    if source['fqn'] == 'analogue_gauges.temperature_gauge_canvas_gauges' and descriptor.get('settingsDirective') == 'tb-analogue-linear-gauge-widget-settings':
        family = 'gauge'
    # Scalar, JSON and image attribute inputs use the declarative write form.
    # Location inputs remain explicitly unsupported.
    if (source['fqn'] == 'input_widgets.update_json_attribute'
            or source['fqn'] in ('input_widgets.update_server_image_attribute', 'input_widgets.update_shared_image_attribute')
            or re.fullmatch(r'input_widgets\.update_(server|shared)_(boolean|date|double|integer|string)_attribute', source['fqn'])
            or re.fullmatch(r'input_widgets\.update_(boolean|double|integer|string)_timeseries', source['fqn'])):
        family = 'input'
    if (source['fqn'] in ('input_widgets.update_location_timeseries',
                         'input_widgets.update_server_location_attribute',
                         'input_widgets.update_shared_location_attribute')
            and descriptor.get('settingsDirective') == 'tb-update-location-attribute-widget-settings'):
        family = 'locationInput'
    if source['fqn'] == 'input_widgets.web_camera_input' and descriptor.get('settingsDirective') == 'tb-photo-camera-input-widget-settings':
        family = 'photoInput'
    if source['fqn'] == 'control_widgets.led_indicator' and descriptor.get('settingsDirective') == 'tb-led-indicator-widget-settings':
        family = 'ledIndicator'
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
            'showLabel': settings.get('showLabels', True) if source['fqn'] == 'charts.pie' else settings.get('showLabel', True),
            'fontSize': settings.get('valueFont', {}).get('size', 36),
            'thresholds': settings.get('rangeColors', []) if family == 'range' else (settings.get('valueColor') or {}).get('rangeList', []) if isinstance(settings.get('valueColor'), dict) else [],
            'range': {'fillOpacity': settings.get('fillAreaOpacity', 0.7), 'outOfRangeColor': settings.get('outOfRangeColor', '#ccc'), 'showBoundaries': settings.get('showRangeThresholds', True)},
            'chartType': 'bar' if source['fqn'] in ('bar_chart', 'bar_chart_with_labels', 'charts.timeseries_bars_flot') else 'scatter' if source['fqn'] == 'point_chart' else 'line',
            'gaugeType': 'thermometer' if source['fqn'] == 'analogue_gauges.temperature_gauge_canvas_gauges' else settings.get('gaugeType', 'radial'),
            'innerRadius': 55 if source['fqn'] in ('doughnut', 'horizontal_doughnut') else 45 if descriptor.get('settingsDirective') == 'tb-doughnut-chart-widget-settings' else round(float(settings.get('innerRadius', 0)) * 100) if source['fqn'] == 'charts.pie' else 0,
            'showPercent': settings.get('showPercentages', False) if source['fqn'] == 'charts.pie' else False,
            'stack': settings.get('stack', False) if source['fqn'] == 'charts.timeseries_bars_flot' else False,
            'layout': settings.get('layout', 'vertical'),
            'labelPosition': settings.get('labelPosition', 'top'),
            'dateFormat': settings.get('dateFormat', 'locale'),
        } if family else {},
    }
    if family == 'state':
        entry['preset']['states'] = settings.get('states') or [
            {'label': 'Off', 'value': 0, 'sourceType': 'constant', 'sourceValue': False},
            {'label': 'On', 'value': 1, 'sourceType': 'constant', 'sourceValue': True},
        ]
    if family == 'input':
        entry['preset']['input'] = {
            'widgetMode': settings.get('widgetMode', 'ATTRIBUTE'),
            'attributeScope': settings.get('attributeScope', 'SERVER_SCOPE'),
            'showLabel': settings.get('showLabel', True),
            'showResultMessage': settings.get('showResultMessage', True),
            'required': settings.get('attributeRequired', settings.get('isRequired', True)),
            'label': settings.get('labelValue') or '',
            'showTimeInput': settings.get('showTimeInput', False),
            'min': settings.get('minValue'),
            'max': settings.get('maxValue'),
            'displayPreview': settings.get('displayPreview', True),
            'displayClearButton': settings.get('displayClearButton', False),
            'displayApplyButton': settings.get('displayApplyButton', True),
            'displayDiscardButton': settings.get('displayDiscardButton', True),
        }
    if family == 'locationInput':
        entry['preset']['locationInput'] = {
            'latKeyName': settings.get('latKeyName', 'latitude'),
            'lngKeyName': settings.get('lngKeyName', 'longitude'),
            'showGetLocation': settings.get('showGetLocation', True),
            'enableHighAccuracy': settings.get('enableHighAccuracy', False),
            'showLabel': settings.get('showLabel', True),
            'showResultMessage': settings.get('showResultMessage', True),
            'latLabel': settings.get('latLabel', ''),
            'lngLabel': settings.get('lngLabel', ''),
            'inputFieldsAlignment': settings.get('inputFieldsAlignment', 'column'),
            'isLatRequired': settings.get('isLatRequired', True),
            'isLngRequired': settings.get('isLngRequired', True),
            'requiredErrorMessage': settings.get('requiredErrorMessage', ''),
        }
    if family == 'photoInput':
        entry['preset']['photoInput'] = {
            'saveToGallery': settings.get('saveToGallery', True),
            'usePublicGalleryLink': settings.get('usePublicGalleryLink', False),
            'imageFormat': settings.get('imageFormat', 'image/png'),
            'imageQuality': settings.get('imageQuality', 0.92),
            'maxWidth': settings.get('maxWidth', 640),
            'maxHeight': settings.get('maxHeight', 480),
        }
    if family == 'ledIndicator':
        entry['preset']['ledIndicator'] = {
            'title': settings.get('title', 'Led indicator'),
            'ledColor': settings.get('ledColor', '#4caf50'),
            'initialValue': settings.get('initialValue', False),
            'valueAttribute': settings.get('valueAttribute', 'value'),
            'retrieveValueMethod': settings.get('retrieveValueMethod', 'attribute'),
            'attributeScope': 'SERVER_SCOPE',
            'parseValueFunction': settings.get('parseValueFunction', 'return data ? true : false;'),
            'performCheckStatus': settings.get('performCheckStatus', True),
            'checkStatusMethod': settings.get('checkStatusMethod', 'checkStatus'),
            'requestTimeout': settings.get('requestTimeout', 500),
            'requestPersistent': settings.get('requestPersistent', False),
            'persistentPollingInterval': settings.get('persistentPollingInterval', 5000),
        }
    if family == 'count':
        entry['preset']['count'] = {
            'kind': 'alarm' if source['fqn'] == 'alarm_count' else 'entity',
            'entityType': 'ALL' if source['fqn'] == 'alarm_count' else 'DEVICE',
            'label': settings.get('label') or ('Total' if source['fqn'] == 'alarm_count' else 'Devices'),
            'showLabel': settings.get('showLabel', True),
            'layout': settings.get('layout', 'column'),
            'showIcon': settings.get('showIcon', True),
            'icon': settings.get('icon', 'warning' if source['fqn'] == 'alarm_count' else 'devices'),
            'iconSize': settings.get('iconSize', 20),
            'iconColor': '#fff',
            'iconBackgroundColor': '#d12730' if source['fqn'] == 'alarm_count' else '#f18d17',
            'showIconBackground': settings.get('showIconBackground', True),
            'valueColor': '#eaf5ff',
            'valueFontSize': settings.get('valueFont', {}).get('size', 20),
            'statusList': ['ACTIVE'] if source['fqn'] == 'alarm_count' else [],
        }
    if family == 'alarmTable':
        entry['preset']['alarmTable'] = {
            'enableSelection': settings.get('enableSelection', False),
            'enableSearch': settings.get('enableSearch', True),
            'enableFilter': settings.get('enableFilter', True),
            'displayDetails': settings.get('displayDetails', True),
            'displayPagination': settings.get('displayPagination', True),
            'defaultPageSize': settings.get('defaultPageSize', 10),
            'defaultSortOrder': 'ASC' if settings.get('defaultSortOrder') == 'createdTime' else 'DESC',
            'allowAcknowledgment': settings.get('allowAcknowledgment', True),
            'allowClear': settings.get('allowClear', True),
        }
    if family == 'deviceClaim':
        entry['preset']['deviceClaim'] = {
            'deviceSecret': settings.get('deviceSecret', True),
            'showLabel': settings.get('showLabel', True),
            'deviceLabel': settings.get('deviceLabel') or '设备名称',
            'secretKeyLabel': settings.get('secretKeyLabel') or '密钥',
            'claimButtonLabel': settings.get('labelClaimButon') or '认领设备',
            'successfulClaimDevice': settings.get('successfulClaimDevice') or '设备认领成功',
            'failedClaimDevice': settings.get('failedClaimDevice') or '设备认领失败',
        }
    if family == 'entityTable':
        admin_mode = source['fqn'].startswith('entity_admin_widgets.')
        entry['preset']['entityTable'] = {
            'entityType': 'ASSET' if source['fqn'] == 'entity_admin_widgets.asset_admin_table' else 'DEVICE',
            'enableSearch': settings.get('enableSearch', True),
            'displayPagination': settings.get('displayPagination', True),
            'pageSize': settings.get('defaultPageSize', 10),
            'sortOrder': 'DESC' if settings.get('defaultSortOrder') in ('-name', '-entityName') else 'ASC',
            'showLabel': settings.get('displayEntityLabel', True),
            'showType': settings.get('displayEntityType', True),
            'stickyHeader': settings.get('enableStickyHeader', True),
            'columns': [],
            'adminMode': admin_mode,
            'allowCreate': admin_mode,
            'allowEdit': admin_mode,
            'allowDelete': admin_mode,
            'editLocation': admin_mode,
        }
    if family == 'liquid':
        colors = {}
        for field, default in [('tankColor','#242770'),('liquidColor','#7A8BFF'),('valueColor','#dae9f6'),('backgroundOverlayColor','rgba(255,255,255,.76)')]:
            color = settings.get(field, {})
            colors[field] = {'color': color.get('color', default), 'ranges': color.get('rangeList', [])} if isinstance(color, dict) else {'color': color or default, 'ranges': []}
        entry['preset']['liquid'] = {'shape':settings.get('selectedShape','Vertical Cylinder'), 'layout':settings.get('layout','percentage'), 'datasourceUnits':settings.get('datasourceUnits','%'), 'capacity':settings.get('volumeConstant',500), 'capacityUnits':settings.get('volumeUnits','L'), 'displayUnits':config.get('units') or 'L', **colors}
    if family == 'battery':
        entry['preset']['battery'] = {
            'layout': settings.get('layout', 'vertical_solid'),
            'sectionsCount': settings.get('sectionsCount', 4),
            'showValue': settings.get('showValue', True),
            'autoScaleValueSize': settings.get('autoScaleValueSize', True),
            'valueFontSize': settings.get('valueFont', {}).get('size', 20),
            'valueColor': color_setting(settings.get('valueColor'), '#eaf5ff'),
            'batteryLevelColor': color_setting(settings.get('batteryLevelColor'), '#e0e0e0'),
            'batteryShapeColor': color_setting(settings.get('batteryShapeColor'), 'rgba(224,224,224,.32)'),
            'padding': 12,
        }
        # The upstream black value color is invisible on the dashboard's dark glass surface.
        entry['preset']['battery']['valueColor']['color'] = '#eaf5ff'
    if family == 'signal':
        entry['preset']['signal'] = {
            'layout': settings.get('layout', 'wifi'),
            'showDate': settings.get('showDate', False),
            'dateFormat': 'relative' if settings.get('dateFormat', {}).get('lastUpdateAgo') else 'locale',
            'dateFontSize': settings.get('dateFont', {}).get('size', 12),
            'dateColor': '#bcd0df',
            'activeBarsColor': color_setting(settings.get('activeBarsColor'), 'rgba(92,223,144,1)'),
            'noSignalRssiValue': settings.get('noSignalRssiValue', -100),
            'inactiveBarsColor': settings.get('inactiveBarsColor', 'rgba(224,224,224,1)'),
            'showTooltip': settings.get('showTooltip', True),
            'showTooltipValue': settings.get('showTooltipValue', True),
            'tooltipValueFontSize': settings.get('tooltipValueFont', {}).get('size', 13),
            'tooltipValueColor': '#eaf5ff',
            'showTooltipDate': settings.get('showTooltipDate', True),
            'tooltipDateFormat': 'relative' if settings.get('tooltipDateFormat', {}).get('lastUpdateAgo') else 'locale',
            'tooltipDateFontSize': settings.get('tooltipDateFont', {}).get('size', 13),
            'tooltipDateColor': '#bcd0df',
            'tooltipBackgroundColor': 'rgba(19,35,51,.85)',
            'tooltipBackgroundBlur': settings.get('tooltipBackgroundBlur', 3),
            'padding': 12,
        }
    if family == 'wind':
        background = settings.get('background') or {}
        overlay = background.get('overlay') or {}
        entry['preset']['wind'] = {
            'layout': 'advanced' if source['fqn'] == 'analogue_gauges.analogue_compass' else settings.get('layout', 'default'),
            'centerValueFontSize': settings.get('centerValueFont', {}).get('size', 24),
            'centerValueColor': color_setting(settings.get('centerValueColor'), '#eaf5ff'),
            'ticksColor': settings.get('ticksColor', 'rgba(224,224,224,.16)'),
            'directionalNamesElseDegrees': settings.get('directionalNamesElseDegrees', True),
            'majorTicksColor': settings.get('colorMajorTicks', settings.get('majorTicksColor', '#a7bed1')),
            'majorTicksFontSize': settings.get('majorTicksFont', {}).get('size', 14),
            'minorTicksColor': settings.get('colorMinorTicks', settings.get('minorTicksColor', '#879eae')),
            'minorTicksFontSize': settings.get('minorTicksFont', {}).get('size', 14),
            'arrowColor': settings.get('colorNeedle', settings.get('arrowColor', '#eaf5ff')),
            'backgroundType': background.get('type', 'color'),
            'backgroundColor': settings.get('colorPlate', background.get('color', '#fff')),
            'backgroundImage': background.get('imageBase64') or background.get('imageUrl') or '',
            'overlayEnabled': overlay.get('enabled', False),
            'overlayColor': overlay.get('color', 'rgba(255,255,255,0.72)'),
            'overlayBlur': overlay.get('blur', 3),
            'padding': int(str(settings.get('padding') or '12px').removesuffix('px')) if str(settings.get('padding') or '12px').removesuffix('px').isdigit() else 12,
        }
    if family == 'rpcButton':
        command_button = source['fqn'] == 'command_button'
        entry['preset']['rpcButton'] = {
            'methodName': settings.get('methodName', 'setState' if command_button else 'rpcCommand'),
            'methodParams': settings.get('methodParams', 'true' if command_button else '{}'),
            'requestTimeout': settings.get('requestTimeout', 5000),
            'oneWayElseTwoWay': settings.get('oneWayElseTwoWay', True),
            'buttonText': settings.get('buttonText', 'Send' if command_button else 'Send RPC'),
            'styleButton': settings.get('styleButton', {'isRaised': True, 'isPrimary': False}),
        }
    if family == 'control':
        kind = control_kinds[source['fqn']]
        modern = kind in ('power', 'singleSwitch', 'toggleButton', 'slider', 'stepper')
        initial_state = settings.get('initialState') or {}
        initial_rpc = initial_state.get('executeRpc') or {}
        if kind == 'stepper':
            appearance = settings.get('appearance') or {}
            minimum, maximum = appearance.get('minValueRange', -100), appearance.get('maxValueRange', 100)
            step, decimals, units = appearance.get('valueStep', .5), appearance.get('valueDecimals', 1), appearance.get('valueUnits', '')
        else:
            minimum, maximum = settings.get('minValue', 0), settings.get('maxValue', 100)
            step, decimals, units = settings.get('step', 1), config.get('decimals', 0), config.get('units', '')
        entry['preset']['control'] = {
            'kind': kind,
            'title': settings.get('title', source['name'] if not modern else ''),
            'initialValue': initial_state.get('defaultValue', settings.get('initialValue', 0 if kind in ('knob', 'slider', 'stepper') else False)),
            'retrieveValueMethod': 'rpc' if modern else settings.get('retrieveValueMethod', 'rpc'),
            'valueKey': (initial_state.get('getTimeSeries') or {}).get('key', settings.get('valueKey', 'state' if modern else 'value')),
            'attributeScope': (initial_state.get('getAttribute') or {}).get('scope') or 'SERVER_SCOPE',
            'getValueMethod': initial_rpc.get('method', settings.get('getValueMethod', 'getState' if modern else 'getValue')),
            'setValueMethod': settings.get('setValueMethod', 'setState' if modern else 'setValue'),
            'requestTimeout': initial_rpc.get('requestTimeout', settings.get('requestTimeout', 5000 if modern else 500)),
            'requestPersistent': initial_rpc.get('requestPersistent', settings.get('requestPersistent', False)),
            'persistentPollingInterval': initial_rpc.get('persistentPollingInterval', settings.get('persistentPollingInterval', 5000)),
            'min': minimum,
            'max': maximum,
            'step': step,
            'decimals': decimals,
            'units': units,
            'showValue': settings.get('showValue', True),
            'showOnOffLabels': settings.get('showOnOffLabels', True),
            'onLabel': settings.get('onLabel', 'Opened' if kind == 'toggleButton' else 'ON'),
            'offLabel': settings.get('offLabel', 'Closed' if kind == 'toggleButton' else 'OFF'),
            'activeColor': settings.get('switchColorOn', settings.get('mainColor', '#198038' if kind == 'toggleButton' else '#5469ff')),
            'inactiveColor': settings.get('switchColorOff', settings.get('backgroundColor', '#d12730' if kind == 'toggleButton' else '#9ba2b0')),
        }
    if family == 'advancedControl':
        mode = advanced_control_modes[source['fqn']]
        appearance = settings.get('appearance') or {}
        initial_state = settings.get('initialState') or {}
        status_request = settings.get('gpioStatusRequest') or {}
        change_request = settings.get('gpioStatusChangeRequest') or {}
        gpio_list = settings.get('gpioList') or []
        pins = [{
            'pin': str(pin.get('pin', '')),
            'label': pin.get('label') or f"GPIO {pin.get('pin', '')}",
            'row': int(pin.get('row') or 0),
            'col': int(pin.get('col') or 0),
            'color': pin.get('color') or '#5469ff',
        } for pin in gpio_list]
        if not pins and source['fqn'] in ('gpio_widgets.basic_gpio_control', 'gpio_widgets.gpio_panel'):
            pins = [
                {'pin': '1', 'label': 'GPIO 1', 'row': 0, 'col': 0, 'color': '#5469ff'},
                {'pin': '2', 'label': 'GPIO 2', 'row': 0, 'col': 1, 'color': '#00a3a3'},
                {'pin': '3', 'label': 'GPIO 3', 'row': 1, 'col': 0, 'color': '#f18d17'},
            ]
        if not pins and source['fqn'] in ('gpio_widgets.raspberry_pi_gpio_control', 'gpio_widgets.raspberry_pi_gpio_panel'):
            raspberry_pins = (7, 11, 12, 13, 15, 16, 18, 22, 29, 31, 32, 33, 35, 36, 37, 38, 40)
            pins = [{'pin': str(pin), 'label': f'GPIO {pin}', 'row': index // 2, 'col': index % 2,
                     'color': '#5469ff'} for index, pin in enumerate(raspberry_pins)]
        left = appearance.get('leftAppearance') or {}
        right = appearance.get('rightAppearance') or {}
        entry['preset']['advancedControl'] = {
            'mode': mode,
            'title': config.get('title') or source['name'],
            'buttonText': settings.get('buttonText') or settings.get('buttonLabel') or ('Update' if mode == 'attributeUpdate' else 'Execute'),
            'method': settings.get('method') or ('gateway_ping' if mode == 'serviceRpc' else 'setState'),
            'params': json.dumps(settings.get('params', {}), ensure_ascii=False) if not isinstance(settings.get('params'), str) else settings.get('params'),
            'requestTimeout': settings.get('requestTimeout', 5000 if mode in ('serviceRpc', 'status') else 500),
            'requestPersistent': settings.get('requestPersistent', False),
            'pollingInterval': settings.get('persistentPollingInterval', 1000),
            'readMethod': status_request.get('method') or settings.get('getValueMethod') or 'getState',
            'writeMethod': change_request.get('method') or settings.get('setValueMethod') or 'setGpioStatus',
            'pins': pins,
            'panelColor': settings.get('switchPanelBackgroundColor') or settings.get('ledPanelBackgroundColor') or '#263b4d',
            'pageSize': settings.get('defaultPageSize', settings.get('pageSize', 10)),
            'allowDelete': settings.get('allowDelete', True),
            'maxLines': settings.get('maxLines', 100),
            'actionMode': 'none',
            'actionTarget': '',
            'leftLabel': left.get('label', 'Traditional'),
            'rightLabel': right.get('label', 'Hi-Perf'),
            'initialValue': initial_state.get('defaultValue', False),
            'onLabel': settings.get('onLabel', 'Opened'),
            'offLabel': settings.get('offLabel', 'Closed'),
            'onColor': settings.get('onColor', '#2f80ed'),
            'offColor': settings.get('offColor', '#ffffff'),
            'attributeScope': settings.get('entityAttributeType', 'SERVER_SCOPE'),
            'attributesJson': settings.get('entityParameters', '{}'),
            'isConnector': settings.get('isConnector', False),
        }
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
