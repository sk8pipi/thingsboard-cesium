# Vue 原生部件库与液态玻璃配置流程

- 任务编号：vue-widget-library
- 当前状态：实现中
- 当前主 Agent：主 Agent
- 最后更新：2026-09-25

2026-09-25 控制部件继续适配：`control_widgets.switch_control`、`control_widgets.round_switch`、`control_widgets.slide_toggle_control`、`control_widgets.knob_control`、`power_button`、`single_switch`、`toggle_button`、`slider`、`value_stepper` 接入 Vue control 家族，`command_button` 接入现有 RPC Button 家族，并按原定义分别展示开关、按钮、圆形电源、旋钮、滑块和值步进器。配置保存读取方式、字段/RPC 方法、超时、持久 RPC、范围、步长、精度、单位、标签和颜色；预览禁发 RPC，正式操作通过现有认证设备 RPC，失败回滚乐观值。此批完成时为 464/521、31 个家族；后续 advancedControl 批次已更新总数。原生 JavaScript 转换、现代控制部件可选属性/遥测写入及全部高级外观仍待补齐。

2026-09-25 属性卡片、告警表、实体层级与实体表格、网关统计曲线、设备认领、图片属性、位置、拍照输入与 LED 指示灯：`cards.attributes_card` 按实体分组读取最新遥测/属性并展示标签和值；`alarm_widgets.alarms_table` 增加认证告警查询、搜索、默认及运行筛选、排序、分页、详情、行选择、时间窗口和刷新设置，正式展示的确认/清除须由用户点击，预览禁写。`cards.entities_hierarchy` 以单根实体按需读取关系，支持关系方向/类型、深度、排序和展开；`cards.entities_table` 查询设备/资产、搜索分页及所选最新字段。两张网关统计曲线沿用原时序曲线设置及 Vue 历史图表，要求显式选择设备遥测。设备认领复用既有认证 API，支持有/无密钥表单，密钥只在运行时输入，预览禁写。图片属性输入支持服务端/共享范围、选图预览、保存/自动保存、清除、放弃、回读；限定常见位图格式，不执行原始脚本。三种位置输入支持经纬度键、标签、布局、必填、浏览器定位与精度配置，按原定义写入遥测或属性并回读。拍照输入支持浏览器相机、分辨率/格式/质量、图库上传或直接保存 Data URL，并写入服务端属性或遥测后回读；图库上传成功而字段写入失败时可能留下未引用图片。LED 指示灯支持设备状态 RPC（含持久查询）与属性/遥测读取，预览禁发 RPC；原生自定义 JavaScript 值解析不执行。均接入原有选择、配置、预览、添加与重新编辑链路。该检查点随后由 advancedControl 批次更新为 476/521、32 家族；完整原生一致性验收仍为 0。告警分配、活动记录、列显示及批量操作、网关管理行为尚未适配，真实服务权限和模板保存刷新未验收。

2026-09-25 实体与告警计数：`entity_count`、`alarm_count` 增加 Vue 筛选、认证查询、预览、定时刷新和配置往返。当前 440/521 个 JSON 有基础适配，22 家族，81 个 JSON 与 160 个 SCADA 源仍无 Vue 运行入口；完整原生一致性验收仍为 0。实体/告警表格、管理卡、层级等六项尚未实现，真实服务权限和模板刷新未验收。

2026-09-25 继续指定五类：`input_widgets.update_multiple_attributes` 增加多字段声明式编辑、按范围分组写入、写后回读、预览禁写与配置重新编辑。目录为 438/521 项基础适配、21 个家族，剩余 83 个 JSON 与 160 个 SCADA 源；完整原生一致性验收仍为 0。原始脚本及全部高级样式仍未复刻，尚未向真实设备写入或验证真实模板保存刷新。

2026-09-24 用户再次明确继续全部原生部件适配，取代此前“先暂停适配、优先修部件库”的临时顺序。部件库修复已验收并提交，本轮从原生状态指示器的电池电量与信号强度开始，逐类保留原生边界和完整配置链路；其余定义继续列在全量清单，未通过全量验收前不宣称完全适配。

本轮电池电量与信号强度已进入 Vue 目录和运行注册，使用 ThingsBoard 仓库的电池轮廓与 Wi-Fi 路径，提供电池四布局/分段、信号两布局/无信号阈值、颜色区间、字号/日期/提示等可见配置；字段绑定、预览、添加与重新编辑沿用现有链路。当前基础适配 407/521，剩余 114 个 JSON 与 160 个 SCADA 源；已有家族的原生脚本、动作等高级行为仍未达到全量一致性验收。

2026-09-24 后续进展：旧版 Chart.js 四图、旧 Flot 折线/状态/柱图与饼图及两张简单数值卡接入现有 Vue 家族；另外 14 个标量属性/遥测输入部件新增声明式写入表单、原生范围锁定、预览禁写与写后回读。该检查点目录为 431/521 项基础适配、18 个家族，剩余 90 个 JSON 与 160 个 SCADA 生成源；完整原生行为验收仍为 0，未在真实服务执行写入验证。

2026-09-24 继续：`input_widgets.update_json_attribute` 接入输入家族，支持属性/遥测及服务端/共享范围切换、单字段重选、JSON 对象/数组编辑、放弃、预览禁写、写后回读和配置重新编辑。当前目录为 432/521 项基础适配、18 个家族，剩余 89 个 JSON 与 160 个 SCADA 生成源；完整原生行为验收仍为 0，真实服务写入和模板保存刷新尚未验证。

2026-09-24 用户指定优先完成五类：输入/上传/认领、控制/RPC/GPIO、实体/告警、网关、仪表/风速风向。先按原定义与现有 API 逐组实施；涉及设备写操作与网关管理时核对目标和权限，不用只读卡片冒充。两张风速风向定义已接入新的 wind 家族，当前基础适配 434/521、19 家族，剩余 87 个 JSON 与 160 个 SCADA 源，完整原生一致性验收仍为 0。其余指定类别仍在进行中。

2026-09-24 继续五类优先：`control_widgets.rpcbutton` 增加 Vue 设备绑定、配置、预览禁发、认证 RPC 发送和保存回显；罗盘复用风向 SVG，温度计刻度接入垂直仪表。当前基础适配 437/521、20 家族，剩余 84 个 JSON 与 160 个 SCADA 源，完整原生一致性验收仍为 0。RPC 持久化/轮询、原始按钮全部样式与操作、罗盘/温度计完整原生造型尚未验收；输入上传认领、其余控制、实体告警和网关仍未完成。

2026-09-24 用户调整优先级：暂停继续扩展原生适配家族，先修复大屏部件库空白。当前修复让本地 32 个原生包及其目录立即出现，服务器资源按标识补充；即使接口成功返回空数组或只返回部分包，包内和“所有部件”仍可浏览。抽屉布局修复继续保留。后续原生高级适配暂不推进，先完成部件库验证。

## 目标

2026-09-17 用户明确要求“实现完全适配”：目标扩大为核对全部原生定义的配置与行为（已识别 521 个 JSON 和 160 个安装生成 SVG 源），包括已有基础适配的缺项，不以计数达到 521 代替完整验收。继续沿用 Vue 重写、现有接口、原始脚本仅存储和人工 Git 门禁；发现必须改变架构的部分先给出具体设计与 RIO。主 Agent 保持唯一代码写入；只读调查可分别核对原生缺项与现有复用能力，返回任务档案，不操作共享服务。

2026-09-15 用户批准继续完整改造：先完成原生部件包 → 部件 → 配置 → 预览 → 添加，随后逐类完成配置选择、保存、生效和重新编辑恢复。抽屉顶部导入，正文原生包与内置部件，原生使用原图，内置保留现有图；编辑器按 ThingsBoard 基础/高级分组，大屏保留玻璃。开始时工作树干净，已提交的滚动窗口修复保留。

### 当前工作包与所有权（替代历史并行分配）

2026-09-23 当前检查点：主 Agent 唯一写代码。新增 radar、polar、range、aggregate、liquid、state 六家族，基础目录为 405/521、15 家族，剩余 116 个 JSON。原始 JSON 之外还有 160 个 SCADA SVG 安装生成源，全量源清单共 681 项；full-adaptation-inventory.json 的 fullParityVerified 均为 false，不以基础计数宣称完整。

聚合卡支持五个独立数值位置、服务端整窗聚合、上一时段比较、单位精度样式和曲线开关；新增 UTC 今天/本周/本月至今日历窗口，每秒推进、跨期更新，聚合卡默认本月至今。雷达和范围图已经隔离浏览器验收；聚合卡已走通选择、预览、添加、重新编辑，实测五位置、COUNT、单位精度和关闭曲线保存回显。极区图已有 SSR/选项测试，尚无浏览器验收。真实设备及模板服务联调仍未完成。

液位十种原生 SVG 已接通液面/容量换算/四组颜色区间/四项属性绑定/三布局/提示与保存。隔离浏览器已验证垂直圆柱、横向胶囊、低液位与属性错误、添加回显；10×3 液位、双实例 ID、Vue 动态更新与卸载测试通过。complete_audit 只读全量、聚合、液位调查已完成，液位只读复核指出的从属配置/错误降级/隐藏校验三处问题均已修复，复核确认本轮限定范围无剩余阻塞项；主 Agent 负责所有实现与验证。临时 4317 服务及浏览器已关闭。本轮专项、回归、ESLint 和治理检查通过；定向类型检查仍有 15 条既有诊断，未标全通过。下一步：继续状态图、状态指示器/模拟仪表、实体/告警等剩余家族和已有类高级缺项，真实服务验证单独进行。

- 主 Agent：配置编辑器、MapWidgetEditor/普通仪表盘/点位入口集成、档案与中央登记、最后测试；独占 NativeWidgetComposer.vue 和新增 NativeWidgetSettingsEditor.vue。
- 浏览器实现包：仅 NativeWidgetPicker.vue、新增 NativeWidgetBrowser.vue、nativeWidgetBundles.generated.json、nativeWidgetBrowse.ts、scripts/generate-native-widget-catalog.py、widgetsLibrary/WidgetPreviewImage.vue、widgetsLibrary/widgetResourceCore.ts 及其新增浏览测试。浏览组件 visible/lockedEntity 沿用；嵌入式 Browser 发出 select(source)，Picker 包装现有 Composer 发出 confirm(DashboardWidget)。新增元数据不得扩大 supported 家族。
- 运行实现包：仅 nativeWidgetTypes.ts、nativeWidgetCatalog.ts、nativeWidgetDataCore.ts、NativeWidgetRenderer.vue、新增 nativeWidgetChartOptions.ts / nativeWidgetSettings.ts、原运行与新增配置闭环测试。保持 version:1 和原字段兼容，新增可选 presentation/chart/table 设置，不改变后端 API、身份或任意脚本边界。先冻结并报告类型契约，主 Agent 再编写对应表单。
- 只读调查包：普通仪表盘/地图/点位保存恢复路径和内置控件复用点，不修改文件。
- 2026-09-16 恢复后，browser_resume/runtime_resume 的已落盘实现由主 Agent 接管集成。save_resume 仅完成只读核查；SensorPopupWidgetEditor/Grid、保存测试与 MapWidgetEditor 未知记录保留均由主 Agent 修改。后续 flow_review 只读审查因调用额度不可用未完成，不计为独立审查通过。

### 阶段与未完成

1. 分类、图片、两级浏览、配置预览添加流程：代码已集成，隔离浏览器已走通。
2. 现有八类配置、混合时序图、已有语义偏差修正与保存恢复：已集成；另增加最新值柱图运行家族及两个原生环图，配置与保存回归通过。
3. 原生其余类别（状态/报警/实体/控制/地图/SCADA/业务管理）及已适配类缺项：待逐项调查和实施，不能以阶段一完成宣称全部兼容。
4. 真实服务与全屏/保存刷新验证：待执行。没有验证的项目不得标为通过。

### 2026-09-16 当前检查点

- 32 个原生包按后端归属与顺序浏览；原图引用逐项保留，接口失败时明确显示本地系统目录。大屏抽屉顶部导入，正文原生包和原有内置缩略图。
- 配置改为基础/高级卡片布局、可搜索设备/字段下拉、时间窗口、序列行、坐标轴与阈值、预览覆盖层及固定确认栏。新增混合时序图、最新值柱图与两个环图，现为 296 个基础适配定义。
- 展示已接入布局、标签/数值样式、图例/提示/缩放、序列线型与轴、环图、仪表方向与刻度、表格搜索/分页/时间列。轮询保留图例选择与缩放，滚动时钟维持每秒推进。
- 点位删除仅写局部草稿，以稳定 ID 操作；取消不再提前修改父级。地图保存保留未知部件原始 JSON，未知条目显示占位。删除 Y 轴会同步转移关联序列与阈值。
- 尚未完成：原生剩余 225 个定义、完整实体别名和仪表盘时间窗口继承、原生脚本与动作等高级能力；当前界面不会伪装提供这些选项。服务器图片、真实设备/客户权限与真实模板保存刷新仍未联调。
- 隔离夹具不连接真实设备，不写用户模板；测试结束后释放临时 4317 服务和标签。无新增生产依赖，无后端或设备数据写入。
- 当前能力与字段链路见 configuration-coverage.md。旧的“当前进度/未完成”等后续段落保留为前一阶段历史记录，不代表本次扩展全部完成。

## 2026-09-25 控制、RPC 与 GPIO

- 12 个剩余定义已加入 advancedControl Vue 家族：动作按钮、两种 GPIO 控制、两种 GPIO 面板、持久 RPC 表、RPC 调试终端、RPC 远程 Shell、网关服务 RPC、状态部件、双段按钮和设备属性更新。
- 已连通“选择原生部件 → 配置 → 预览 → 添加 → 正式运行 → 重新编辑保留”。需要设备的部件限定一个 DEVICE 且不选数据字段；静态 GPIO 面板、动作按钮和双段按钮允许不绑定设备。
- 当前目录为 478/521 个 JSON 基础适配、32 个 Vue 家族；43 个 JSON 没有 Vue 入口，其中 34 个按产品范围隐藏、9 个保留为待适配。160 个安装生成 SCADA 源仍单独记录。完整原生行为一致性仍为 0，不用基础入口计数代替现场验收。
- 已补 Charts 常用项 bars（最新值柱形，与历史 bar 区分）、doughnut 和 horizontal_doughnut。新增最新值与属性读取、空数据/数字零、配置往返和 ECharts 渲染测试；横向环图已用隔离浏览器走通预览、添加和重新编辑，修复 Canvas 字体导致配置字号失效的问题。其余雷达/极区等先核对模型，尚不扩大适配声明。主 Agent 独占原生目录、类型、配置器、Renderer、native manifest、对应测试及文档，不新增依赖或 API。
用户批准按原生部件类别逐类重写 Vue 运行与配置能力，完整打通资源打开、导入导出、支持状态、数据选择、样式编辑、预览及添加。大屏和点位详情必须保留液态玻璃效果。使用现有后端资源 API 与前端依赖，不执行原生 Angular 控制脚本，不以未知类型折线图冒充兼容。

## 验收标准
原生目录可浏览详情并导出；已适配类别可以真实配置、预览、添加与保存刷新；未适配项明确列出而非假成功；设备配置筛选、当前点位绑定、时间窗口、字段和格式参数正确；液态玻璃共用、透明图表、不叠加模糊；导入不丢原始定义、不执行任意脚本；现有设备位置和视频边界不变。

## 工作包与文件所有权
主 Agent 负责 frontend/src/views/tb、frontend/src/api/tb 部件相关封装、frontend/tests、文档和脚本。先用只读子 Agent 分别调查原生类别复用、现有配置入口与数据服务；冻结契约后安排无重叠写入。

## 当前进度
521 项原生 JSON 已全部进入兼容目录，其中 478 项已有 Vue 基础运行入口，32 个运行家族。资源详情、导出/导入预览、统一配置与预览、大屏和点位编辑、普通仪表盘挂载均已有实现；各项真实原生行为仍需逐一验收。任务早期基线为 HEAD 274777f、工作树干净；当前工作树包含持续适配的未提交修改。

## 未完成
43 个 JSON 与 160 个安装生成的 SCADA 符号源没有 Vue 运行入口；其中 34 个 JSON 已按用户要求从部件库隐藏，实际可见待适配 JSON 为 9 个。完整原生行为一致性验收仍为 0。真实设备、客户会话、相机/定位权限、图库上传与实际模板保存刷新尚未联调；当前基础适配不能称完整兼容。

2026-09-25 实体管理和目录范围收口：`entity_admin_widgets.asset_admin_table`、`entity_admin_widgets.device_admin_table` 接入实体查询、新增、编辑、服务端经纬度属性保存和二次确认删除；管理动作开关随配置保存并在重新编辑时恢复，配置预览强制只读。地图与位置 16 项、卡片/导航/平台入口 18 项在本地目录、原生包和服务端合并三条路径统一过滤，空包不显示；后端源定义保留以兼容导入导出。

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

## 2026-09-15 滚动窗口修复

用户反馈选择实时滚动后时间窗口没有推进。检查时工作树干净；定位到数据查询已按当前时间轮询，但 NativeWidgetRenderer 未设置横轴起止值，图表由数据点自动决定范围。现将横轴绑定完整配置范围，滚动图表每秒独立推进，固定历史保持指定边界；不增加数据请求频率，无新依赖和配置迁移。回退本次 Renderer 修改可恢复原行为。验证见 verification.md；真实设备页面尚未联调。建议独立提交 `fix(widgets): advance native chart rolling time windows`，所有 Git 写操作由用户执行。

## 2026-09-23 继续适配工作包
主 Agent 继续独占代码写入，调查并实现现代 state_chart 的声明式状态映射与历史阶梯图；complete_audit 只读核对电池/信号状态指示器及尚未适配模拟仪表的原生配置与复用点。文件仍限原生运行目录、生成脚本、测试和文档，不改变公共 API，不操作共享服务。

## 2026-09-23 现场抽屉重叠反馈
用户截图显示原生浏览器与内置卡片重叠，所有部件点击无效。当前优先复现和修复抽屉高度压缩/滚动布局，保留正在验证的 state 适配。主 Agent 独占 MapWidgetEditor、NativeWidgetBrowser 与测试夹具，不操作真实服务。临时端口 4317 已登记。

### 本次实现结果

现代状态图已接通常量/区间映射、严格类型历史读取、窗口前状态、阶梯边界、滚动、配置往返与正式 manifest；同时补齐 liquid 运行注册遗漏，并增加全目录家族均有 manifest 的集成检查。状态图浏览器已通过“所有部件 → 搜索 → 配置离线/在线 → 预览 → 添加至真实 GridStack/WidgetHost”，重新编辑由 JSON 往返测试覆盖；host 夹具未绑定原 onGridClick，不能把夹具配置按钮点击当作真实重新编辑验证。后续应补夹具事件绑定。

用户最新反馈优先修复抽屉重叠：MapWidgetEditor 抽屉改为不压缩的纵向列表，原生 Browser 固定响应式占位，内部标题/搜索不缩，列表单独滚动。八张内置卡片夹具在 1280×720 和 1024×600 下检查无重叠，低高度时按钮中心命中自身；所有部件显示 483 个当前项并能搜索、进入配置及添加。没有复现用户真实服务页面，原因判断依据截图与布局约束，不能冒充已在现场部署验证。

下一步仍是电池/信号、剩余模拟仪表及其他家族；只读核对确认 status_widget 默认执行 getState RPC，后续须区分只读遥测与具有设备副作用的调用，不能直接套用布尔灯。全量适配尚未完成。

本次抽屉修复临时测试服务与验收标签已关闭，4317 登记释放。当前整体任务仍实现中，不以本次故障修复宣称全量适配完成。

## 2026-09-24 继续验证与指示器适配
先将 host 夹具接入实际 onGridClick/deleteWidgetById 委托事件，验证状态图与液位运行注册后的重新编辑。后续主 Agent 单独实现电池/信号指示器；范围仍为原生配置/运行、目录生成、测试和文档，不新增依赖/API。临时 4317 串行占用。
