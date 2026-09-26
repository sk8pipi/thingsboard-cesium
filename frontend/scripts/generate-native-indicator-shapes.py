"""从仓库内 ThingsBoard SVG 路径生成只读 Vue 指示器形状投影。

源自 backend/ui-ngx 的 ThingsBoard 电池/信号图形资源，遵循仓库原有 Apache-2.0 许可。
仅复制 SVG path 数据，不复制脚本执行逻辑。
"""
import json
import re
import xml.etree.ElementTree as ET
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
BASE = ROOT / 'backend/ui-ngx/src/app/modules/home/components/widget/lib/indicator'
ASSETS = ROOT / 'backend/ui-ngx/src/assets/widget/battery-level'

signal = (BASE / 'signal-strength-widget.component.ts').read_text(encoding='utf-8')
paths = re.findall(r'this\.bars\[\d\] = this\.svgShape\.path\((.*?)\)\.fill', signal, re.S)
assert len(paths) == 4, 'ThingsBoard Wi-Fi path source changed'
wifi = [''.join(re.findall(r"'([^']*)'", expression)) for expression in paths]
assert all(path.strip() for path in wifi)

def battery_path(name):
    svg = ET.parse(ASSETS / f'battery-shape-{name}.svg').getroot()
    path = svg.find('{http://www.w3.org/2000/svg}path')
    assert path is not None
    return path.attrib['d']

target = ROOT / 'frontend/src/views/tb/dashboard/runtime/native/nativeIndicatorShapes.generated.json'
target.write_text(json.dumps({
    'batteryVertical': battery_path('vertical'),
    'batteryHorizontal': battery_path('horizontal'),
    'signalWifi': wifi,
}, ensure_ascii=False, separators=(',', ':')) + '\n', encoding='utf-8')
print('Generated original battery outlines and 4 Wi-Fi paths')
