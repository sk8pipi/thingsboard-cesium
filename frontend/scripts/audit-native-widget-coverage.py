"""按本地正式源生成完整核对清单；基础可运行不等于原生行为全部通过验收。"""
import json
import xml.etree.ElementTree as ET
from collections import Counter
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
SYSTEM = ROOT / 'backend/application/src/main/data/json/system'
OUT = ROOT / 'docs/changes/vue-widget-library'
catalog = json.loads((ROOT / 'frontend/src/views/tb/dashboard/runtime/native/nativeWidgetCatalog.generated.json').read_text(encoding='utf-8'))
by_fqn = {entry['fqn']: entry for entry in catalog}


def leaf_paths(value, prefix=''):
    if isinstance(value, dict) and value:
        return [path for key, item in value.items() for path in leaf_paths(item, f'{prefix}.{key}' if prefix else key)]
    if isinstance(value, list) and value:
        return sorted({path for item in value for path in leaf_paths(item, prefix + '[]')})
    return [prefix] if prefix else []


entries = []
for file in sorted((SYSTEM / 'widget_types').glob('*.json')):
    source = json.loads(file.read_text(encoding='utf-8'))
    descriptor = source['descriptor']
    config = json.loads(descriptor.get('defaultConfig') or '{}')
    local = by_fqn.get(source['fqn'], {})
    entries.append({
        'sourceId': source['fqn'], 'name': source['name'], 'kind': 'widget-json',
        'sourceFile': file.relative_to(ROOT).as_posix(),
        'settingsDirective': descriptor.get('settingsDirective'),
        'dataKeySettingsDirective': descriptor.get('dataKeySettingsDirective'),
        'defaultConfigPaths': leaf_paths(config),
        'baseFamily': local.get('family'),
        'status': '基础实现待完整验收' if local.get('family') else '待实现',
        'fullParityVerified': False,
    })

for file in sorted((SYSTEM / 'scada_symbols').glob('*.svg')):
    root = ET.fromstring(file.read_text(encoding='utf-8'))
    node = next((item for item in root.iter() if item.tag.endswith('}metadata')), None)
    metadata = json.loads(node.text) if node is not None and node.text else {}
    entries.append({
        # 后端生成的 fqn 由服务决定；不从标题猜测，源身份固定为 SVG 文件。
        'sourceId': f'scada:{file.name}', 'name': metadata.get('title', file.stem), 'kind': 'generated-scada',
        'sourceFile': file.relative_to(ROOT).as_posix(), 'templateFqn': 'scada_symbol',
        'metadataPaths': leaf_paths(metadata), 'baseFamily': None, 'status': '待实现',
        'fullParityVerified': False,
    })

assert len({item['sourceId'] for item in entries}) == len(entries), '重复源身份'
assert len(by_fqn) == len(catalog), '重复原生 fqn'
assert all(item['sourceId'] in by_fqn for item in entries if item['kind'] == 'widget-json'), '原生目录遗漏'
counts = Counter(item['kind'] for item in entries)
report = {
    'schemaVersion': 1,
    'scope': '本地 JSON 定义和安装时生成的 SCADA 源；不能把基础支持视为完整配置/行为验收',
    'fieldScope': 'defaultConfigPaths 仅列默认 JSON 出现的路径，空默认值还须人工核对对应 Angular 设置模型；metadataPaths 不包含脚本内容',
    'summary': {'sources': len(entries), **counts, 'baseAdapters': sum(bool(item['baseFamily']) for item in entries), 'fullParityVerified': 0},
    'entries': entries,
}
OUT.mkdir(parents=True, exist_ok=True)
(OUT / 'full-adaptation-inventory.json').write_text(json.dumps(report, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')
print(json.dumps(report['summary'], ensure_ascii=False))
