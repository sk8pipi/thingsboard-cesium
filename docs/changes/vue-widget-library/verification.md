# 验证记录

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
