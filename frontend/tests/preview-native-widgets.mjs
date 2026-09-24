// --host 编译实际大屏抽屉模板/CSS、添加与挂载函数、原内置缩略图、GridStack 和 WidgetHost。
// 夹具内置清单使用多个造型，覆盖长列表；导入/内置添加仍为桩，不能据此宣称这些入口已做浏览器验收。
// 本地视觉验收夹具：实际 Vue 组件 + 明确标识的测试数据，不连接 ThingsBoard、不写用户数据。
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const { build } = createRequire(require.resolve('vite/package.json'))('esbuild');
import ts from 'typescript';
import { parse, compileScript, compileStyle, compileTemplate } from '@vue/compiler-sfc';
import { readFileSync, mkdirSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { createServer } from 'node:http';
const out = resolve('node_modules/.cache/native-widget-preview');
mkdirSync(out, { recursive: true });
const api = `
import bundles from './src/views/tb/dashboard/runtime/native/nativeWidgetBundles.generated.json';
import catalog from './src/views/tb/dashboard/runtime/native/nativeWidgetCatalog.generated.json';
const emptyNative=new URLSearchParams(location.search).has('emptyNative');
const partialNative=new URLSearchParams(location.search).has('partialNative');
export const widgetsBundles=async()=>emptyNative?[]:(partialNative?bundles.slice(0,1):bundles).map(b=>({...b,id:{id:b.alias}}));
export const getBundleWidgetTypes=async id=>emptyNative||partialNative?[]:(bundles.find(b=>b.alias===id)?.widgetTypeFqns||[]).map(fqn=>catalog.find(w=>w.fqn===fqn)).filter(Boolean);
export const getWidgetTypeList=async()=>({data:emptyNative||partialNative?[]:catalog,hasNext:false});
export const getWidgetType=async fqn=>catalog.find(w=>w.fqn===fqn.replace(/^system\\./,''));
export const getWidgetTypeById=getWidgetType;
export const imagePreview=async()=>{throw new Error('Fixture contains original embedded images only')};
const items=[{id:{id:'fixture-device'},name:'测试设备 · sensor-001',deviceProfileName:'temperature'}];
export const getTenantDeviceInfoList=async()=>({data:items,hasNext:false});
export const getCustomerDeviceInfoList=getTenantDeviceInfoList;
export const getTenantAssetInfoList=getTenantDeviceInfoList;
export const getCustomerAssetInfoList=getTenantDeviceInfoList;
export const getDeviceProfileInfoList=async()=>({data:[{id:{id:'fixture-profile'},name:'temperature'}],hasNext:false});
export const getTimeseriesKeys=async()=>['temperature','humidity','enabled'];
export const getAttributeKeysByScope=async()=>['model','enabled'];
export const getAttributesByScope=async()=>[{key:'model',value:'模拟验收',lastUpdateTs:Date.now()},{key:'enabled',value:false,lastUpdateTs:Date.now()}];
export const getLatestTimeseries=async()=>({temperature:[{ts:Date.now(),value:25.4}],humidity:[{ts:Date.now(),value:66}]});
export const getTimeseries=async(query)=>Object.fromEntries((query.keys||'temperature,humidity').split(',').map(k=>{
 const base=k==='temperature'?24:60;
 if(k==='enabled') return [k,query.limit===1?[{ts:query.endTs,value:false}]:Array.from({length:6},(_,i)=>({ts:query.startTs+(query.endTs-query.startTs)*(i+1)/8,value:i%2===0}))];
 if(query.limit===1) return [k,[{ts:Math.floor((query.startTs+query.endTs)/2),value:query.agg==='COUNT'?30:base+(new Date(query.startTs).getUTCMonth()%3)}]];
 return [k,Array.from({length:30},(_,i)=>({ts:query.startTs+(query.endTs-query.startTs)*(i+1)/31,value:base+Math.sin(i/3)*5}))];
}));
export const useUserStoreWithOut=()=>({getAuthority:'TENANT_ADMIN',getPageCacheByKey:()=>''});
`;
const mapDescriptor = parse(readFileSync(resolve('src/views/tb/map/MapWidgetEditor.vue'), 'utf8')).descriptor;
const source = mapDescriptor.scriptSetup.content;
const mapCss = compileStyle({
  source: mapDescriptor.styles.map((s) => s.content).join('\n'),
  filename: 'MapWidgetEditor.vue',
  id: 'data-v-map-fixture',
  scoped: true,
}).code;
const ast = ts.createSourceFile('map.ts', source, ts.ScriptTarget.Latest, true);
function findDrawer(node) {
  if (node.type === 1 && node.props?.some((p) => p.name === 'class' && p.value?.content === 'mw-add-panel'))
    return node;
  return (node.children || []).map(findDrawer).find(Boolean);
}
const drawerTemplate = findDrawer(mapDescriptor.template.ast).loc.source;
const drawerRender = compileTemplate({
  source: drawerTemplate,
  filename: 'MapWidgetEditor.vue',
  id: 'data-v-map-fixture',
  scoped: true,
}).code.replace('export function render', 'function renderMapDrawer');
const previewDeclaration = ast.statements
  .filter(ts.isVariableStatement)
  .find((n) => n.declarationList.declarations.some((d) => d.name.getText(ast) === 'widgetPreviewByKey'))
  .getText(ast);
const needed = [
  'applyNativeWidget',
  'mountWidget',
  'unmountWidget',
  'unmountAllWidgets',
  'widgetHtml',
  'escapeSvgText',
  'syncLayoutFromGrid',
  'renderGrid',
  'applyScreenMetrics',
  'beginWidgetResize',
  'onGridClick',
  'deleteWidgetById',
  'createWidgetPreviewSvg',
  'getPreviewShape',
  'getBuiltInPreview',
  'getBuiltInKindLabel',
];
const extractedFunctions = ts.transpileModule(
  ast.statements
    .filter(ts.isFunctionDeclaration)
    .filter((n) => needed.includes(n.name.text))
    .map((n) => n.getText(ast))
    .join('\n'),
  { compilerOptions: { target: ts.ScriptTarget.ES2022 } },
).outputText;
await build({
  stdin: {
    contents: process.argv.includes('--host')
      ? `
import {createApp,h,ref,nextTick,computed,watch} from 'vue';
import {resolveMapTemplateViewportForLayout,DEFAULT_MAP_TEMPLATE_VIEWPORT,normalizeMapTemplateState} from './src/views/tb/map/mapTemplateConfig';
import {calculateGridStackCellHeight} from './src/views/tb/map/mapScreenResponsive';
import {GridStack} from 'gridstack';
import 'gridstack/dist/gridstack.css';
import Picker from './src/views/tb/dashboard/runtime/native/NativeWidgetPicker.vue';
import NativeWidgetBrowser from './src/views/tb/dashboard/runtime/native/NativeWidgetBrowser.vue';
import Composer from './src/views/tb/dashboard/runtime/native/NativeWidgetComposer.vue';
import {createNativeWidget} from './src/views/tb/dashboard/runtime/native/nativeWidgetCatalog';
const mapStyle=document.createElement('style');mapStyle.textContent=${JSON.stringify(mapCss)};document.head.append(mapStyle);
import WidgetHost from './src/views/tb/dashboard/runtime/widgets/WidgetHost.vue';
import {widgetRegistry} from './src/views/tb/dashboard/runtime/widgets/registry/widgetRegistry';
import {widgetAppearanceStyleText} from './src/views/tb/dashboard/runtime/widgets/core/widgetInstance';
import './src/views/tb/dashboard/runtime/widgets/core/widgetSurface.css';
${drawerRender}
createApp({setup(){
let grid;const gridEl=ref(null),selectedWidgetId=ref('');const widgets=ref({}),layout=ref([]),editorMode=ref('editing'),isSavingEdit=ref(false),nativePickerVisible=ref(false),nativeEditSource=ref(null),addPanelVisible=ref(false),mountedApps=new Map();
const datasourceRuntime={mountWidgetRuntime:()=>({series:{},latest:{}}),unmountWidgetRuntime:()=>{}};
const templateRuntimeDevices=ref({}),draftMapPoints=ref([]),draftExcludedDeviceIds=ref([]),draftExcludedPointTypes=ref({}),draftExcludedDeviceBindings=ref({});
const getMapBusinessPoints=()=>[];const onAlarmFocus=()=>{};
const errorMsg=ref('');
let applyingScreenMetrics=false;const templateViewport=ref({...DEFAULT_MAP_TEMPLATE_VIEWPORT,columns:24});const mapScreen={metrics:computed(()=>{const v=resolveMapTemplateViewportForLayout(templateViewport.value,layout.value,widgets.value);return {rows:v.rows,columns:24,canvasHeight:420,margin:10}})};watch(()=>mapScreen.metrics.value.rows,async()=>{await nextTick();applyScreenMetrics()});
${extractedFunctions}
${previewDeclaration}
const showImportedWidgets=ref(false),fileInputEl=ref(null);
const MapDrawer={__scopeId:'data-v-map-fixture',components:{NativeWidgetBrowser},render:renderMapDrawer,setup:()=>({canEditTemplate:true,editorMode,addPanelVisible,showImportedWidgets,fileInputEl,nativeEditSource,builtInWidgetDefs:[{key:'timeseriesLine',title:'时序折线图'},{key:'timeseriesScatter',title:'时序散点图'},{key:'timeseriesBar',title:'时序柱形图'},{key:'rangeChart',title:'范围图'},{key:'stateChart',title:'状态图'},{key:'alarmTable',title:'告警表格'},{key:'latestValue',title:'最新值'},{key:'timeseriesTable',title:'历史表格'}],getBuiltInPreview,getBuiltInKindLabel,libraryDefs:[],onImportFileChange:()=>{},addWidgetByKey:()=>{},getLibraryPreview:()=>'',getLibraryKindLabel:()=>'',addFromLibrary:()=>{},deleteFromLibrary:()=>{}})};
const seed=()=>{const w=createNativeWidget({fqn:'temperature_card'});w.config.datasources=[{type:'entity',entityType:'DEVICE',entityId:'fixture-device',name:'测试设备',dataKeys:[{name:'temperature',type:'timeseries',units:'°C'}]}];applyNativeWidget(w)};
return()=>h('main',{'data-v-map-fixture':''},[h('button',{onClick:seed},'添加测试温度卡片'),h('button',{onClick:()=>{editorMode.value=editorMode.value==='editing'?'view':'editing';if(editorMode.value==='view'){const saved=normalizeMapTemplateState(JSON.parse(JSON.stringify({layout:layout.value,widgets:widgets.value,viewport:templateViewport.value})));templateViewport.value=saved.viewport;layout.value=saved.layout;renderGrid()};grid.setStatic(editorMode.value==='view');grid.enableResize(editorMode.value==='editing')}},'切换编辑/查看'),h('p',JSON.stringify({layout:layout.value,viewport:templateViewport.value})),h('h2','实际 GridStack + WidgetHost 验收 · 测试数据'),h('button',{onClick:()=>addPanelVisible.value=true},'打开原生部件库'),h('p',errorMsg.value),h('p','已添加 '+Object.keys(widgets.value).length+' 个部件'),h('div',{style:'position:relative;height:420px;overflow:hidden',class:'fixture-stage'},[h('div',{class:['mw-grid grid-stack',{'mw-grid--editing':editorMode.value==='editing'}],style:'width:100%;height:420px','data-v-map-fixture':'',ref:el=>{if(!el||grid)return;gridEl.value=el;el.addEventListener('click',onGridClick,true);GridStack.renderCB=(el,w)=>el.innerHTML=w.content||'';grid=GridStack.init({column:24,cellHeight:150,float:true,alwaysShowResizeHandle:true,resizable:{handles:'all'}},el);grid.on('resizestart',beginWidgetResize);grid.on('change',()=>{syncLayoutFromGrid();applyScreenMetrics()})}})]),h(MapDrawer),nativeEditSource.value?h(Composer,{visible:true,source:nativeEditSource.value,onClose:()=>nativeEditSource.value=null,onConfirm:applyNativeWidget}):null]);}}).mount('#app');`
      : `import {createApp,h,ref} from 'vue';import Picker from './src/views/tb/dashboard/runtime/native/NativeWidgetPicker.vue';import Composer from './src/views/tb/dashboard/runtime/native/NativeWidgetComposer.vue';import Renderer from './src/views/tb/dashboard/runtime/native/NativeWidgetRenderer.vue';import {createNativeWidget} from './src/views/tb/dashboard/runtime/native/nativeWidgetCatalog';import {widgetAppearanceStyle} from './src/views/tb/dashboard/runtime/widgets/core/widgetInstance';import './src/views/tb/dashboard/runtime/widgets/core/widgetSurface.css';
createApp({setup(){const picking=ref(false),editing=ref(null),widgets=ref([]);const apply=w=>{const i=widgets.value.findIndex(x=>x.id===w.id);if(i<0)widgets.value.push(w);else widgets.value[i]=w;picking.value=false;editing.value=null;};return()=>h('main',[h('h2','视觉验收 · 测试数据（不连接真实设备）'),h('button',{onClick:()=>picking.value=true},'打开原生部件库'),h('div',{class:'cards'},widgets.value.map(w=>h('section',{class:'tb-widget-surface',style:widgetAppearanceStyle(w.widgetKey,w.appearance)},[h('button',{onClick:()=>editing.value=w},'重新配置'),h('div',{style:'height:280px'},[h(Renderer,{config:w.config,key:JSON.stringify(w.config)})])]))),h(Picker,{visible:picking.value,onClose:()=>picking.value=false,onConfirm:apply}),editing.value?h(Composer,{visible:true,source:editing.value,onClose:()=>editing.value=null,onConfirm:apply}):null]);}}).mount('#app');`,
    resolveDir: resolve('.'),
    loader: 'ts',
  },
  bundle: true,
  format: 'esm',
  outfile: resolve(out, 'app.js'),
  define: {
    __VUE_OPTIONS_API__: 'true',
    __VUE_PROD_DEVTOOLS__: 'false',
    __VUE_PROD_HYDRATION_MISMATCH_DETAILS__: 'false',
    'process.env.NODE_ENV': '"development"',
  },
  plugins: [
    {
      name: 'actual-vue-fixture',
      setup(builder) {
        builder.onResolve(
          {
            filter:
              /^\/@\/api\/tb\/(device|asset|deviceProfile|telemetry|widgetsBundle|widgetType|images)$|^\/@\/store\/modules\/user$/,
          },
          () => ({ path: 'fixture-api', namespace: 'fixture' }),
        );
        builder.onLoad({ filter: /.*/, namespace: 'fixture' }, () => ({
          contents: api,
          loader: 'js',
          resolveDir: resolve('.'),
        }));
        builder.onResolve({ filter: /registry\/widgetRegistry$/ }, () => ({ path: 'registry', namespace: 'registry' }));
        builder.onLoad({ filter: /.*/, namespace: 'registry' }, () => ({
          contents:
            'import {widgets} from ' +
            JSON.stringify(resolve('src/views/tb/dashboard/runtime/widgets/manifests/native.ts')) +
            ';import {createWidgetCatalog} from ' +
            JSON.stringify(resolve('src/views/tb/dashboard/runtime/widgets/core/widgetDefinition.ts')) +
            ';export const widgetRegistry=createWidgetCatalog(widgets);',
          loader: 'js',
          resolveDir: resolve('.'),
        }));
        builder.onResolve({ filter: /^\/@\// }, (args) => ({ path: resolve('src', args.path.slice(3) + '.ts') }));
        builder.onLoad({ filter: /\.vue$/ }, (args) => {
          const { descriptor } = parse(readFileSync(args.path, 'utf8'));
          const id = 'test-' + Buffer.from(args.path).toString('hex').slice(-24);
          const compiled = compileScript(descriptor, { id, inlineTemplate: true, genDefaultAs: 'fixtureComponent' });
          const styles = descriptor.styles
            .map((style) => compileStyle({ source: style.content, filename: args.path, id, scoped: style.scoped }).code)
            .join('\n');
          return {
            contents:
              compiled.content +
              `;fixtureComponent.__scopeId='data-v-${id}';export default fixtureComponent;const style=document.createElement('style');style.textContent=${JSON.stringify(styles)};document.head.append(style);`,
            loader: 'ts',
            resolveDir: dirname(args.path),
          };
        });
      },
    },
  ],
});
const html = `<!doctype html><html><head><meta charset="UTF-8"><link rel="stylesheet" href="/app.css"><style>body{margin:0;background:radial-gradient(ellipse at 0 0,#255c69,transparent 60%),linear-gradient(120deg,#0b2131,#244431);color:#e6faff;font:14px system-ui;min-height:100vh}main{padding:26px}button{padding:9px;background:#275c70;color:white;border:1px solid #ffffff40;border-radius:7px;cursor:pointer}.mw-widget,.mw-body,.mw-mount{height:100%;width:100%}.mw-widget{position:relative}.mw-del{display:none}.cards{display:grid;grid-template-columns:repeat(auto-fit,minmax(340px,1fr));gap:20px;margin-top:20px}.cards>section{padding:14px}</style></head><body><div id="app"></div><script type="module" src="/app.js"></script></body></html>`;
createServer((request, response) => {
  const pathname = new URL(request.url || '/', 'http://127.0.0.1').pathname;
  if (pathname === '/') {
    response.setHeader('Content-Type', 'text/html; charset=utf-8');
    response.end(html);
    return;
  }
  if (!['/app.js', '/app.css'].includes(pathname)) {
    response.statusCode = 404;
    response.end();
    return;
  }
  response.setHeader('Content-Type', pathname.endsWith('.css') ? 'text/css' : 'text/javascript');
  response.end(readFileSync(resolve(out, pathname.slice(1))));
}).listen(4317, '127.0.0.1', () => console.log('Visual fixture http://127.0.0.1:4317 — test data only'));
