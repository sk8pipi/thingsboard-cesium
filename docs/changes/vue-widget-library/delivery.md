# Vue 原生部件库与液态玻璃配置流程

- 任务编号：vue-widget-library
- 当前状态：待人工提交
- 当前主 Agent：主 Agent
- 最后更新：2026-09-15

## 目标
用户批准按原生部件类别逐类重写 Vue 运行与配置能力，完整打通资源打开、导入导出、支持状态、数据选择、样式编辑、预览及添加。大屏和点位详情必须保留液态玻璃效果。使用现有后端资源 API 与前端依赖，不执行原生 Angular 控制脚本，不以未知类型折线图冒充兼容。

## 验收标准
原生目录可浏览详情并导出；已适配类别可以真实配置、预览、添加与保存刷新；未适配项明确列出而非假成功；设备配置筛选、当前点位绑定、时间窗口、字段和格式参数正确；液态玻璃共用、透明图表、不叠加模糊；导入不丢原始定义、不执行任意脚本；现有设备位置和视频边界不变。

## 工作包与文件所有权
主 Agent 负责 frontend/src/views/tb、frontend/src/api/tb 部件相关封装、frontend/tests、文档和脚本。先用只读子 Agent 分别调查原生类别复用、现有配置入口与数据服务；冻结契约后安排无重叠写入。

## 当前进度
HEAD 274777f，开始前工作树干净。资源详情/导出/导入预览、521 项兼容目录、292 项基础适配、统一配置与真实数据预览、大屏和点位编辑、普通仪表盘挂载已实现。恢复后主 Agent 接管所有代码完成集成，子 Agent 交接未完成的部分由主 Agent 补齐。

## 未完成
本次基础适配代码、独立审查、10 组专项与回归测试和最终生产构建均完成。真实设备、客户会话与实际模板保存刷新因本机服务未启动尚未联调。目录中 229 项仍待后续类别适配，不宣称完整兼容。

## 人工 Git 交付
AI 不执行暂存、提交、推送、PR 或生产部署。

## 冻结并行契约
主 Agent 独占 dashboard/runtime/native、运行核心、MapWidgetEditor/SensorPopupWidgetEditor、目录生成脚本、文档；resource_worker 独占 widgetType/、widgetsBundle/、widgetsLibrary/、api/tb/widgetType.ts、api/tb/widgetsBundle.ts 和 tests/widgetResourceLibrary.test.ts。两者文件完全不重叠，可独立测试。
主 Agent 提供 native/nativeWidgetCatalog.ts 的 getNativeWidgetSupport(source): {supported:boolean,label:string,reason:string,localWidgetKey?:string}；native/NativeWidgetComposer.vue 接收 visible:boolean、source:Record、previewOnly?:boolean，发出 close 和 confirm(DashboardWidget)。资源详情只在 previewOnly 模式调用配置预览，不自动保存仪表盘。下载配置由用户界面动作触发。

2026-09-14 恢复：上一轮调用额度中断，尚无运行代码落盘。沿用已批准方案继续。新增冻结契约 nativeWidgetTypes.ts；运行实现 Agent 独占 native/NativeWidgetRenderer.vue、native/nativeWidgetData.ts、native/nativeWidgetDataCore.ts、widgets/manifests/native.ts 和 tests/nativeWidgetData.test.ts。Renderer 接收 config（config.native: NativeOptions、config.datasources: NativeSource[]）并自行维护只读数据生命周期，manifest dataProvider=static 避免旧单设备订阅重复；主 Agent 独占目录/Composer/宿主整合。

资源模块完成后归还主 Agent；同一实现 Agent 接管普通 dashboard/editor.vue 和 tests/nativeDashboardIntegration.test.ts，接入 NativeWidgetPicker/Composer、WidgetHost/createDatasourceRuntime，并保留原 __vueWidgets/__vueLayout 显式保存位置。其余文件不重叠。

2026-09-14 收尾：临时视觉夹具仅使用测试数据，浏览器验证卡片、重新配置精度与透明折线图后已关闭临时标签和 4317 服务。运行与 UI 只读审查分开进行；中央文档与最后集成由主 Agent 串行维护。

## 本次修改与入口

- widgetType/list/detail、widgetsBundle/list/widgetTypesInfo、widgetsLibrary/：资源详情、完整导出、本地导入预览、图片失败回退和适配状态。
- dashboard/runtime/native/：521 项兼容索引、292 项基础类别、设备配置筛选、当前点位绑定、字段/属性范围、时间窗口与聚合、阈值/单位/精度、预览及全屏弹窗。
- dashboard/runtime/widgets/manifests/native.ts、widgetInstance、widgetSurface：统一注册与保存、原始标识保留、单层玻璃模糊。
- MapWidgetEditor、SensorPopupWidgetEditor/Grid、dashboard/editor：添加、重新配置及既有草稿/保存路径；旧四个空 SFC 编辑入口复用新配置器。
- frontend/tests/：数据、导入导出、真实 SFC 行为与独立视觉验收夹具；docs/ai/vue-widget-library-architecture.md 为长期边界。

操作入口：大屏编辑“添加部件 → 原生部件库 · Vue 配置”；点位详情“原生部件库 · Vue”；普通仪表盘编辑页“原生部件库 · Vue 配置”；资源列表点击部件名称查看定义/预览/下载。实际模板仍需用户点击原有保存按钮。

## 人工提交建议

建议一个完整功能提交，避免资源入口与配置器依赖断开：`feat(widgets): add Vue native widget adapters and glass configuration flow`。全部 Git 写操作由用户本人执行，AI 未暂存、提交、推送或创建 PR。

## 2026-09-15 添加后不显示问题

用户已提交上一阶段功能（9bc7ae6）；本次开始工作树干净。继续调查用户反馈的“生成部件没有生成”，补查实际 GridStack 与 WidgetHost 挂载流程。使用临时 4317 测试页面，无真实设备或模板写入。具体现场表现等待用户补充。

本次局部改动：配置校验提示移动到确认按钮所在的固定底栏，避免表单滚动后看不到失败原因；视觉夹具新增 `--host`，抽取实际大屏添加和挂载函数，并使用真实 GridStack、WidgetHost 和原生 manifest。原有默认预览方式保留。

现场结论尚未确定：隔离测试中配置完整可以添加显示；缺设备/字段会被校验拦住。错误反馈改进已验证，但不能将其宣称为用户现场故障的确定根因。本机常用服务端口未监听，尚待用户提供具体入口、按钮点击后的状态或页面截图。临时 4317 服务和浏览器标签已关闭。

## 部件缩放与查看状态

用户确认部件现已可以生成，新增明确反馈：不能调整大小，保存后仍显示配置按钮。本轮仅修复编辑交互及查看状态，不修改设备或后端。保留之前未提交的提示和夹具修改。

本轮完成：MapWidgetEditor 编辑状态显示配置按钮与常显缩放手柄，查看状态隐藏；主动缩放时记录当前画布行数为 viewport.mode=fixed，修复缩短末行部件后被自动拉满的行为；模板标准化、编辑页和客户 MapWidgetLayer 共用同一保存尺度。旧模板没有主动缩放时保持 fill。取消编辑可由既有快照恢复 viewport。

原始生成反馈已由用户确认可以显示；本轮缩放及查看态问题已用真实 SFC 函数、实际 CSS、GridStack 和 WidgetHost 隔离验证。真实后端模板写入没有执行。建议独立修复提交：`fix(widgets): retain resized dimensions and hide editing controls in view mode`。AI 未暂存、提交、推送或执行 GitHub 操作。
