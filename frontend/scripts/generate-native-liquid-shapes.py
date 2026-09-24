"""从仓库原生 SVG 生成只含静态节点的 Vue 投影；不接收导入 SVG。"""
import json
import xml.etree.ElementTree as ET
from pathlib import Path
ROOT = Path(__file__).resolve().parents[2]
SHAPES = [('Vertical Oval','vertical-oval',171,51),('Vertical Cylinder','vertical-cylinder',161,55),('Vertical Capsule','vertical-capsule',197,25),('Rectangle','rectangle',169,52),('Horizontal Oval','horizontal-oval',160,63),('Horizontal Ellipse','horizontal-ellipse',160,64),('Horizontal Dish Ends','horizontal-dish-ends',173,50),('Horizontal Cylinder','horizontal-cylinder',165,56),('Horizontal Capsule','horizontal-capsule',171,52),('Horizontal 2:1 Elliptical','horizontal-2_1-elliptical',173,50)]
def node(element):
    tag = element.tag.split('}')[-1]
    if tag in ['script','image','use','a','style'] or any(key.lower().startswith('on') or 'href' in key for key in element.attrib):
        raise ValueError('原始液位 SVG 包含未批准的动态节点或属性')
    return {'tag':tag,'attrs':element.attrib,'children':[node(child) for child in element]}
source = ROOT / 'backend/ui-ngx/src/assets/widget/liquid-level/shapes'
result = {name:{'empty':empty,'full':full,'svg':node(ET.parse(source/(filename+'.svg')).getroot())} for name,filename,empty,full in SHAPES}
target = ROOT / 'frontend/src/views/tb/dashboard/runtime/native/nativeLiquidShapes.generated.json'
target.write_text(json.dumps(result,separators=(',',':'))+'\n',encoding='utf-8')
print(f'Generated {len(result)} original liquid shapes')
