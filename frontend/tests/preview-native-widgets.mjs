// 本地视觉验收夹具：实际 Vue 组件 + 明确标识的测试数据，不连接 ThingsBoard、不写用户数据。
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const { build } = createRequire(require.resolve('vite/package.json'))('esbuild');
import {parse,compileScript,compileStyle} from '@vue/compiler-sfc';
import {readFileSync,mkdirSync} from 'node:fs';
import {resolve,dirname} from 'node:path';
import {createServer} from 'node:http';
const out=resolve('node_modules/.cache/native-widget-preview');mkdirSync(out,{recursive:true});
const api=`
const items=[{id:{id:'fixture-device'},name:'测试设备 · sensor-001',deviceProfileName:'temperature'}];
export const getTenantDeviceInfoList=async()=>({data:items,hasNext:false});
export const getCustomerDeviceInfoList=getTenantDeviceInfoList;
export const getTenantAssetInfoList=getTenantDeviceInfoList;
export const getCustomerAssetInfoList=getTenantDeviceInfoList;
export const getDeviceProfileInfoList=async()=>({data:[{id:{id:'fixture-profile'},name:'temperature'}],hasNext:false});
export const getTimeseriesKeys=async()=>['temperature','humidity'];
export const getAttributeKeysByScope=async()=>['model','enabled'];
export const getAttributesByScope=async()=>[{key:'model',value:'模拟验收',lastUpdateTs:Date.now()},{key:'enabled',value:false,lastUpdateTs:Date.now()}];
export const getLatestTimeseries=async()=>({temperature:[{ts:Date.now(),value:25.4}],humidity:[{ts:Date.now(),value:66}]});
export const getTimeseries=async()=>Object.fromEntries(['temperature','humidity'].map(k=>[k,Array.from({length:30},(_,i)=>({ts:Date.now()-(30-i)*60000,value:(k==='temperature'?24:60)+Math.sin(i/3)*5}))]));
export const useUserStoreWithOut=()=>({getAuthority:'TENANT_ADMIN',getPageCacheByKey:()=>''});
`;
await build({stdin:{contents:`import {createApp,h,ref} from 'vue';import Picker from './src/views/tb/dashboard/runtime/native/NativeWidgetPicker.vue';import Composer from './src/views/tb/dashboard/runtime/native/NativeWidgetComposer.vue';import Renderer from './src/views/tb/dashboard/runtime/native/NativeWidgetRenderer.vue';import {createNativeWidget} from './src/views/tb/dashboard/runtime/native/nativeWidgetCatalog';import {widgetAppearanceStyle} from './src/views/tb/dashboard/runtime/widgets/core/widgetInstance';import './src/views/tb/dashboard/runtime/widgets/core/widgetSurface.css';
createApp({setup(){const picking=ref(false),editing=ref(null),widgets=ref([]);const apply=w=>{const i=widgets.value.findIndex(x=>x.id===w.id);if(i<0)widgets.value.push(w);else widgets.value[i]=w;picking.value=false;editing.value=null;};return()=>h('main',[h('h2','视觉验收 · 测试数据（不连接真实设备）'),h('button',{onClick:()=>picking.value=true},'打开原生部件库'),h('div',{class:'cards'},widgets.value.map(w=>h('section',{class:'tb-widget-surface',style:widgetAppearanceStyle(w.widgetKey,w.appearance)},[h('button',{onClick:()=>editing.value=w},'重新配置'),h('div',{style:'height:280px'},[h(Renderer,{config:w.config,key:JSON.stringify(w.config)})])]))),h(Picker,{visible:picking.value,onClose:()=>picking.value=false,onConfirm:apply}),editing.value?h(Composer,{visible:true,source:editing.value,onClose:()=>editing.value=null,onConfirm:apply}):null]);}}).mount('#app');`,resolveDir:resolve('.'),loader:'ts'},bundle:true,format:'esm',outfile:resolve(out,'app.js'),define:{__VUE_OPTIONS_API__:'true',__VUE_PROD_DEVTOOLS__:'false',__VUE_PROD_HYDRATION_MISMATCH_DETAILS__:'false','process.env.NODE_ENV':'"development"'},plugins:[{name:'actual-vue-fixture',setup(builder){
builder.onResolve({filter:/^\/@\/api\/tb\/(device|asset|deviceProfile|telemetry)$|^\/@\/store\/modules\/user$/},()=>({path:'fixture-api',namespace:'fixture'}));
builder.onLoad({filter:/.*/,namespace:'fixture'},()=>({contents:api,loader:'js'}));
builder.onResolve({filter:/registry\/widgetRegistry$/},()=>({path:'registry',namespace:'registry'}));
builder.onLoad({filter:/.*/,namespace:'registry'},()=>({contents:'export const widgetRegistry = {};',loader:'js'}));
builder.onResolve({filter:/^\/@\//},args=>({path:resolve('src',args.path.slice(3)+'.ts')}));
builder.onLoad({filter:/\.vue$/},args=>{const {descriptor}=parse(readFileSync(args.path,'utf8'));const id='test-'+Buffer.from(args.path).toString('hex').slice(-24);const compiled=compileScript(descriptor,{id,inlineTemplate:true,genDefaultAs:'fixtureComponent'});const styles=descriptor.styles.map(style=>compileStyle({source:style.content,filename:args.path,id,scoped:style.scoped}).code).join('\n');return {contents:compiled.content+`;fixtureComponent.__scopeId='data-v-${id}';export default fixtureComponent;const style=document.createElement('style');style.textContent=${JSON.stringify(styles)};document.head.append(style);`,loader:'ts',resolveDir:dirname(args.path)};});
}}]});
const html=`<!doctype html><html><head><meta charset="UTF-8"><link rel="stylesheet" href="/app.css"><style>body{margin:0;background:radial-gradient(ellipse at 0 0,#255c69,transparent 60%),linear-gradient(120deg,#0b2131,#244431);color:#e6faff;font:14px system-ui;min-height:100vh}main{padding:26px}button{padding:9px;background:#275c70;color:white;border:1px solid #ffffff40;border-radius:7px;cursor:pointer}.cards{display:grid;grid-template-columns:repeat(auto-fit,minmax(340px,1fr));gap:20px;margin-top:20px}.cards>section{padding:14px}</style></head><body><div id="app"></div><script type="module" src="/app.js"></script></body></html>`;
createServer((request,response)=>{if(request.url==='/'){response.setHeader('Content-Type','text/html; charset=utf-8');response.end(html);return;}if(!['/app.js','/app.css'].includes(request.url)){response.statusCode=404;response.end();return;}response.setHeader('Content-Type',request.url.endsWith('.css')?'text/css':'text/javascript');response.end(readFileSync(resolve(out,request.url.slice(1))));}).listen(4317,'127.0.0.1',()=>console.log('Visual fixture http://127.0.0.1:4317 — test data only'));
