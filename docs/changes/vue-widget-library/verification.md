# 验证记录

## 2026-09-24 原生部件库空列表修复

- 原因核对：原加载逻辑仅在接口抛错时使用本地系统目录；服务器正常返回空包、空部件列表或只返回部分系统包时，界面会被空结果覆盖。新逻辑先显示仓库原始 32 包及原生定义，再按 alias/fqn 合并服务器结果；本地条目直接进入配置，远端条目仍在选择时读取完整定义并校验适配状态。
- `nativeWidgetBrowse.test.ts` 通过：原图/包归属、空与部分服务器数据合并、去重与图片回退。`nativeWidgetIntegration.test.ts` 通过；受影响 Browser、目录和测试 ESLint、治理校验与 `git diff --check` 通过。
- 隔离浏览器使用实际大屏添加抽屉模板及 Browser，模拟包与部件接口均返回空数组：32 包显示，Charts 显示 14 项，“所有部件”显示 483 个当前条目，已适配卡片可进入配置。模拟服务器仅返回 Charts 包且包内接口为空：仍显示完整包目录、Charts 14 项，Time series chart 可进入配置。内置部件仍在原生区下方，页面没有再次重叠。
- 夹具不连接真实 ThingsBoard；原图 API 在夹具内故意不可用，不能据此判断真实服务器图片或用户现场权限。未执行真实客户会话和模板保存刷新。临时 4317 服务与测试标签已关闭，资源登记释放。
- 定向 `vue-tsc --noEmit -p tests/tsconfig.native-widgets.json` 仍退出 1，15 条诊断均位于之前已记录的 Table、store、旧图表和 deviceProfilePresentation 文件；本次部件库修改路径没有新增诊断，不能称完整类型检查通过。


## 2026-09-23 状态图与现场抽屉重叠反馈

- nativeStateChart 专项通过：布尔/文本/数字严格映射、区间等值/边界、未知文本断点、窗口前状态查询与开关、截断不错误续画、历史失败、滚动补点、状态文字/数值位置、ECharts SVG 与 JSON 往返。
- nativeWidgetRolling 通过：新增真实 Renderer 的仅窗口前布尔状态可见、无新遥测时每秒更新两端、保留图例/缩放与卸载清理。
- nativeWidgetData 通过：521 项源核对，405 项基础默认配置通过。nativeWidgetIntegration 通过：新增状态配置器编译，所有可选家族都必须有实际 manifest，修复液位遗漏注册。
- 本轮最终 nativeWidgetPersistence、nativeWidgetSettings、nativeStateChart 复验通过；布局两文件与滚动测试 ESLint 通过（首次仅换行/格式问题，Prettier 修正后通过）；治理与 git diff --check 通过。
- 抽屉修复后 nativeWidgetIntegration、nativeWidgetBrowse、nativeWidgetRolling 回归通过。夹具使用八张内置卡片、实际 MapWidgetEditor 抽屉模板/CSS 与 NativeWidgetBrowser。
- 隔离浏览器 1280×720 和 1024×600 验证原生与内置区域分开；低高度下原生区域底边 452px、内置网格顶边 500px，所有部件按钮中心命中按钮自身。所有部件显示 483 个未弃用条目，搜索 state chart 后进入配置；返回包、已导入视图切换通过。
- 状态图隔离浏览器显示离线/在线阶梯线，预览后添加到真实 GridStack/WidgetHost 成功。host 夹具未接入原 onGridClick，重新编辑按钮无效是夹具缺项，因此不记录其为浏览器回显通过；JSON 往返已验证。后续补夹具委托事件。
- 未复现用户的真实服务页面。布局修复基于截图和现有高度约束，浏览器只验证修复后效果；原图 API 在夹具内不可用，无真实设备/权限/模板保存刷新证据。
- 定向类型检查日志 native-state-typecheck.log 有 15 个既有错误，修改的原生路径无错误，不称完整类型检查通过。
- 生成清单为 681 个源、405 个基础适配、0 个全量一致性验收；剩余 116 个 JSON 与 160 个 SCADA 源待适配。
- 临时浏览器验收标签已关闭、尺寸覆盖恢复、4317 测试服务停止并释放登记。未执行 Git 暂存、提交、推送、GitHub 操作或部署。
- 建议将本次布局修复独立提交：`fix(widgets): prevent native library drawer content overlap`；状态图与运行注册作为功能提交：`feat(widgets): add native state chart adapter`，均由用户人工审核提交。


## 2026-09-22 至 09-23 雷达、极区、范围、聚合与液位扩展

### 自动验证

- `nativeWidgetData.test.ts` 通过：521 个 JSON 逐项核对，404 个基础适配默认配置可绑定并验证；原最新/历史/属性与请求生命周期断言保留。
- `nativeRadialCharts.test.ts` 通过：雷达维度与形状/归一化/样式、实际极坐标柱形、零/负/空值、设置往返及 ECharts SSR。
- `nativeRangeChart.test.ts` 最终复验通过：仅历史查询、区间配色与区间图例、边界线/透明度/区间外颜色、零值、配置回显及 SSR；不再额外读取最新值造成错误。
- `nativeAggregate.test.ts` 最终复验通过：独立整窗服务端聚合、NONE 最新值、去重、上一值/差值/百分比、零分母/负值/缺失数据、独立失败、月末和闰年、曲线截断不污染聚合、关闭曲线不请求图线；UTC 日/周/月窗口边界和轮询、JSON 往返。
- `nativeLiquid.test.ts` 最终复验通过：十种原生 SVG × 0/50/100%、全部容量单位换算、空值与合法零、超量/负值仅裁剪液面、独立低液位颜色、属性合并查询与失败、双实例 ID/裁剪引用、Vue 实际更新液面/500ms 过渡样式及卸载、JSON 往返。新增无关属性不读取、隐藏无效配置不阻断百分比、重新启用相关布局恢复校验。
- `nativeWidgetIntegration.test.ts` 最终复验通过：12 个实际 SFC 编译、原三个宿主链路及轴引用迁移；`nativeWidgetRolling.test.ts` 通过，包括无数据推进、日历跨月起点更新和卸载。
- `nativeWidgetSettings.test.ts`、`nativeWidgetPersistence.test.ts` 本轮回归通过，未修改原保存接口。
- 原生目录与受影响新测试 ESLint 最终通过。液位首次测试因 pnpm 未直接暴露 `@vue/server-renderer` 失败，改为从已安装 Vue 包解析其依赖后通过，未新增依赖。
- 定向类型检查仍有 15 条既有诊断（Table、store、旧图表和 deviceProfilePresentation），新增路径无诊断；不宣称全量类型检查通过。本机记录：`frontend/node_modules/.cache/native-complete-typecheck.log`。
- 目录和液位投影生成脚本执行成功，全量清单统计 681 个源（521 JSON + 160 SCADA SVG），基础适配 404，完整一致性验收数 0。
- 治理校验及 `git diff --check` 通过，只有既有 Windows 换行转换提示。

### 隔离浏览器

- 雷达：Charts → Radar，选两个测试字段、圆形网格/填充，预览实际雷达图；字段图例可关闭，添加后重新编辑保持形状与填充。
- 范围图：单字段历史，预览彩色区间、区间图例、边界线与缩放；透明度 0.45 添加及重新编辑保留。
- 聚合卡：Charts → Value and chart card → 测试设备/字段 → 本月至今。预览显示 `25.4 °C`、`▲ 4 %`、`1.0` 与历史曲线。添加并重新编辑，增加左上 AVG 与左下 COUNT；关闭曲线后实际显示五位置，COUNT 为 30.0，再次编辑保持 `month`、`COUNT` 和曲线关闭。
- 液位：Liquid level → Vertical cylinder tank，百分比液面与原始 SVG 显示正常；切换输入 L、容量 1 m³、显示 L，实际显示 25.4 L / 1000.0、约 2.5% 液面和低液位红色。添加后重新编辑保留布局、容量单位与容量值。缺失 `volume` 属性明确提示并隐藏液体；切换 Horizontal Capsule 使用对应原生容器。
- 液位最后的布局从属配置/隐藏校验修复经过单元和 SFC 检查，未额外重复浏览器；500ms 过渡由 Vue 更新测试验证样式与位置，不称作已录制逐帧动画验收。极区图只有 SSR/选项检查，本轮未做浏览器验收。
- 测试使用明确标识的模拟 API，原图服务器 API 在夹具内故意不可用；没有真实设备、客户权限、模板服务保存刷新或 Cesium WebGL 证据。临时 4317 服务与标签已关闭，资源登记释放。

### 独立复核与未完成

- complete_audit 完成只读原生源/聚合语义/液位语义核对。液位实现复核发现布局无效选项、无关属性失败降级、隐藏字段阻断校验；主 Agent 修复并补回归，复核确认本轮限定范围无剩余阻塞项。审查者未运行测试，不替代主 Agent 执行证据。
- 剩余 117 个 JSON 和 160 个生成 SCADA 源尚待适配；已适配家族的全部原生高级样式、脚本/动作、别名、宿主时间窗口继承、任意时区仍未完成，不能以 404 基础适配宣称完全适配。
- 建议本段作为功能提交：`feat(widgets): add radial range aggregate and liquid adapters`。AI 未暂存、提交、推送或执行 GitHub/部署操作。


## 2026-09-16 至 09-17 原生浏览与配置链路扩展

以下是本轮未提交工作区的执行证据，之前小节是历史阶段记录。

### 自动检查

- `nativeWidgetData.test.ts` 通过：原始 521 个定义逐项核对，其中 296 个基础适配；最新/历史数据与属性范围等原有断言继续通过。
- `nativeWidgetBrowse.test.ts` 通过：32 个包的原始元数据、图片与归属、目录搜索/系统筛选、本地回退、资源 URL 与共享图片释放。
- `nativeWidgetSettings.test.ts` 通过：展示设置 JSON 往返、历史轴/序列/阈值、表格、仪表及实际 ECharts SVG 渲染。
- `nativeLatestCharts.test.ts` 最终复验通过：Bars、Doughnut、Horizontal doughnut 的配置往返、最新遥测/属性读取（历史读取次数为零）、数字零与空数据区分、量程/柱宽/方向、内径/图例/合计格式、字体选项及实际 ECharts SVG 渲染。
- `nativeWidgetIntegration.test.ts` 最终复验通过：10 个实际 SFC 编译、普通仪表盘/地图/点位入口、添加后收起抽屉、实际删除轴函数同步转移序列和阈值且保留扩展字段。
- `nativeWidgetRolling.test.ts` 最终复验通过：滚动时钟、固定边界、空数据、停止调度以及轮询保留图例选择。
- `nativeWidgetPersistence.test.ts` 最终复验通过：实际 SFC 保存/取消函数、稳定 ID 编辑/删除、取消不提前写父级、地图未知部件保留、false/0/null/空字符串/数组/扩展字段及外观 JSON 往返。
- `widgetResourceLibrary.test.ts`、`mapScreenResponsive.test.ts` 回归通过。不存在的 `nativeDashboardIntegration.test.ts` 未作为验证证据，普通仪表盘由上述 integration 测试覆盖。
- 受影响原生目录、manifest、地图/点位、资源及测试文件 ESLint 已通过；新增图表和字体修复后再次通过对应 ESLint。
- 本轮最终 `scripts/validate-agent-governance.ps1` 与 `git diff --check` 通过；仅有 Windows 换行转换提示。
- 定向 `vue-tsc --noEmit -p tests/tsconfig.native-widgets.json` 仍返回 15 处诊断，均在未修改的 Table、store、旧图表和 deviceProfilePresentation 文件；本轮修改路径没有诊断。完整类型检查不能标为通过。日志保存在本机 `frontend/node_modules/.cache/native-flow-typecheck-final.log`。

### 隔离浏览器

- 实际 Browser/Picker/Composer/Renderer：Charts → Time series chart → 搜索选择设备和字段 → 修改名称/单位/精度 → 预览 → 添加 → 重新编辑；0–50 坐标轴与 30 的高温阈值实际显示，回到高级配置仍保留。
- 实际 MapWidgetEditor 抽屉模板/样式、添加与挂载函数 + GridStack + WidgetHost：顶部导入、原生包与原有内置缩略图；添加流程结束后“已添加 1 个部件”，图表挂入网格。夹具的导入与内置添加为桩，不据此声称这些动作完成浏览器验证。
- Horizontal doughnut：选择测试字段，设置“总读数”、kW、1 位小数、中心合计，预览真实显示 `25.4 kW` 与右侧图例；添加后重新编辑保持内径 55%、合计开关/标题/单位/精度/字号。截图发现 Canvas 的 `inherit` 字体导致字号无效，改为明确字体后 36px 合计已按设置显示并复验。
- 修复设备/字段下拉层级与受控空值；菜单可见且选中后清空搜索框。修复窄图横轴文字重叠，阈值标签放到绘图区内。
- 原生包内嵌原图已实际显示；需要 ThingsBoard 图片 API 的部件缩略图在隔离夹具显示加载失败，仅验证引用映射，尚未验证服务器图片加载。未用其他图片冒充原图。
- 临时 `127.0.0.1:4317` 服务及测试标签已关闭，中央资源登记已释放。

### 限制与后续

- 测试数据替换 API，没有真实设备、客户权限、实际模板服务保存刷新、全屏/Cesium WebGL 或生产联调证据。未读取密钥或启动共享后端/视频服务，未写设备及用户模板。
- 本轮没有生产依赖、构建配置或路由修改，未重复生产构建；前一阶段构建结果不能作为本轮完整构建证据。
- 本轮只读独立复审因调用额度不可用中断，没有独立复审通过结论；上述检查由主 Agent 实际执行。
- 当前 296 项仅提供基础适配；225 项、完整实体别名、仪表盘时间窗口继承及原生全部高级行为仍未完成，具体链路见 configuration-coverage.md。
- 建议将浏览/配置/运行及保存修复作为一个关联功能提交：`feat(widgets): add native package flow and persistent widget settings`；可将新增最新值图表拆为后续提交 `feat(widgets): support latest bars and doughnut charts`。AI 未暂存、提交、推送或执行 GitHub 操作。

## 2026-09-15 滚动窗口修复验证

- `pnpm exec esno tests/nativeWidgetRolling.test.ts` 通过：编译实际 Renderer 的完整 setup，使用 Vue 响应式、模拟时钟与图表 API 验证完整 5 分钟横轴、无新数据时每秒推进、只更新横轴、空数据范围、固定历史边界、模式切换和卸载释放计时器。这是隔离行为测试，不是真实浏览器绘制或设备联调。
- `nativeWidgetData.test.ts` 与 `nativeWidgetIntegration.test.ts` 通过；新增连续轮询请求边界推进和停止取消调度断言，原目录、数据、固定历史及 SFC 集成检查继续通过。
- Renderer 和上述两个修改/新增测试文件 ESLint 通过；`git diff --check` 通过。
- `pnpm run type:check` 最终退出 2，诊断位于未修改文件（包括租户配置可空字段及 camera-adapter 缺少 mqtt 类型）；本轮 Renderer 和测试文件无诊断。不能宣称全仓库类型检查通过。
- 未执行真实设备页面联调或生产构建：未修改构建、路由、环境变量或依赖。未启动共享服务、读取本地密钥、修改设备或保存用户模板；AI 未执行暂存、提交、推送或 GitHub 操作。

## 基线与环境

2026-09-13 基线工作树干净，HEAD 274777f。2026-09-14 恢复实现。未读取本地密钥文件，未启动 ThingsBoard、视频或数据库服务，未修改任何设备或用户模板。

## 自动验证

- nativeWidgetData.test.ts：521 个定义逐项识别，292 个已适配预设绑定后全部可通过配置校验；未知/修改控制脚本拒绝，原始定义保留，阈值实例隔离与等值条件；多实体同名字段、属性 scope、最新值/历史分离、固定时间、聚合参数、部分失败、截断、去重、卸载后响应丢弃及固定历史不轮询。
- nativeWidgetIntegration.test.ts：7 个实际 SFC 编译；实际添加/编辑函数、当前点位草稿不提前保存、外观/原始标识保留、字段范围请求竞态、全屏挂载目标、透明绘图和嵌套容器不叠加模糊。
- widgetResourceLibrary.test.ts：完整导出及 API 参数、原始定义保留、格式错误、资源 URL 安全边界、真实下载 DOM/URL 释放及资源页面 SFC 编译。
- 回归通过：mapDeviceProfile、mapProfileBillboard、mapProfileRendering、mapModelAnchorEditor、mapModelAnchor、mapUnifiedPoint、templateAggregateCore。
- 上述合计 10 组测试通过；最终复验记录保存在本机 node_modules/.cache/native-test-results.json。
- 修改的 TS/Vue 文件 ESLint 通过，未引入生产依赖。
- 定向 vue-tsc（tests/tsconfig.native-widgets.json）仍有 15 条既有诊断，均位于本次未修改的 EditableCell、store、旧告警/时序图和 deviceProfilePresentation 文件；新增部件/资源/编辑入口无诊断。不能宣称仓库完整类型检查通过。

## 构建

发现并修复四个遗留空编辑器 SFC（CommonWidgetEditor、DataKeyEditor、DatasourceEditor、TimewindowEditor）；现在转接统一配置器，避免全量页面扫描阻断构建。

本机缺少 .env.production 且缺省压缩配置为空。通过子进程临时 VITE_BUILD_COMPRESS=none、VITE_OUTPUT_DIR=node_modules/.cache/vue-widget-library-build 执行现有 Vite production 构建，不创建或读取密钥文件、不覆盖部署目录。独立审查修复后最终构建 exit 0（7263 模块，约 3 分钟），记录于本机 node_modules/.cache/native-build-final.log。缺失 .env.production 的提示仍存在，不能把此次产物当作已配置的生产部署包。

## 浏览器与人工验收边界

本机 8080、5173、5174、3100 未监听。采用 tests/preview-native-widgets.mjs 在临时 127.0.0.1:4317 上编译实际 Vue Picker/Composer/Renderer，并以明确标识的测试数据替换 API；未修改生产路由。

浏览器实际操作通过：搜索温度卡片、选测试设备与遥测字段、查看 25 °C 预览、添加卡片、重新打开配置并改为 25.40 °C、添加折线图。截图检查到透明绘图区、玻璃高光、阈值颜色、窄屏配置器滚动均可用。临时浏览器标签和 4317 服务已关闭。

这不是后端联调证明。真实客户会话、资源服务器下载、实际设备数据、大屏模板保存刷新与 Cesium WebGL 叠加效果尚未现场验证；需服务启动后验收。

## 独立审查

runtime_review 与 ui_review 各指出两个 P2：共享阈值预设污染、12 个零值等值阈值预设校验失败、全屏弹窗不可见、字段范围切换混入旧字段。主 Agent 已修复并增加回归测试；两位审查者复核后均确认无剩余阻塞问题。审查为只读代码复核，未冒充浏览器或后端测试。

## 治理与 Git

scripts/validate-agent-governance.ps1 通过（1 个活动任务、4 个角色投影）；最终 git diff --check 通过，仅提示 Windows 换行转换。AI 未执行暂存、提交、推送、PR 或生产部署。

## 2026-09-15 生成无反应反馈跟进

- 基线 HEAD 9bc7ae6，工作树干净；本次未改后端、API、设备或模板。
- nativeWidgetIntegration、nativeWidgetData 两组测试通过；NativeWidgetComposer.vue 的 ESLint 通过。无依赖或构建配置变更，未重复生产构建。
- 浏览器运行 `node tests/preview-native-widgets.mjs --host`：实际大屏 applyNativeWidget/mountWidget 函数 + GridStack + WidgetHost + 原生 manifest，遥测 API 和旧宿主运行时使用隔离夹具。温度卡片成功加入网格并显示 25 °C。
- 修改提示位置后再次实测：未选设备显示“请选择至少一个设备或资产”，仅选设备显示“每个数据源至少选择一个字段”，截图确认提示位于按钮同一固定底栏；补选字段后生成并显示卡片。不能替代真实模板或用户现场联调。
- 临时标签与 4317 服务已关闭；现场根因仍待具体页面信息，不宣称已完全解决原始反馈。

## 2026-09-15 缩放与只读状态修复

- 浏览器隔离夹具复用实际 MapWidgetEditor 添加、挂载、尺寸计算、resizestart 函数和实际 scoped CSS；真实 GridStack / WidgetHost，数据为测试 API。宽度 5→8 格，高度 4→2 格；420px→210px。配置 JSON 标准化并重建网格、切到查看态，配置按钮 display:none 且无缩放手柄；重新编辑按钮恢复，210px 高度保留。未调用真实模板保存或设备接口。
- nativeWidgetIntegration 通过：新增 8 个 SFC 编译、主动缩放后 JSON 往返保持画布行数、客户 MapWidgetLayer 实际尺寸函数、旧 fill 兼容、查看状态不修改配置。
- mapScreenResponsive 通过；该测试原有迁移版本断言为 6，而当前实现已为 7，修正过期断言后复验通过。mapProfileRendering 回归通过。受影响 TS/Vue 和测试文件 ESLint 通过。
- 缩放句柄改为编辑时常显并设置层级；拖边缘时应命中句柄，拖内容仍移动部件。主要高度回弹原因是按占用行数自动铺满，与遥测数据无关。
- 临时 4317 服务及测试标签已关闭；未更改生产依赖/构建配置，未重复全量构建。
