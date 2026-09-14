# Vue 原生部件适配与液态玻璃

## 范围与正式来源

适用于 frontend/ 的资源部件列表、部件包列表、普通仪表盘、Cesium 大屏和点位详情。ThingsBoard 后端仍拥有资源定义、实体、遥测、属性与权限；不改 Angular UI、数据库、Gateway 或视频接口。

backend/application/src/main/data/json/system/widget_types/ 是本仓库原生定义的参照源。scripts/generate-native-widget-catalog.py（位于 frontend/）生成 nativeWidgetCatalog.generated.json 兼容索引；该文件仅是编译期投影，不代替后端资源目录。资源详情和下载使用后端完整定义。

## 适配契约

- 521 个原生定义逐项列入目录。本次 292 项提供 8 类 Vue 基础实现：数值卡片 158、数值曲线 79、进度条 27、仪表 21、时序折线/柱形/散点 3、饼图 2、分类柱形图 1、历史表格 1。
- “基础适配”表示按对应类别重新配置 Vue 数据显示，不等于原生控件全部行为或造型复刻。水平/垂直卡片、原生背景等使用统一玻璃布局；数字仪表变体采用统一仪表显示。原生高级布局、脚本、动作、函数数据源和后处理不执行。
- 另外 229 项标为待适配，包括聚合比较卡片、范围着色图、液位、状态时间段、混合图、RPC、SCADA、网关管理等，不以折线图替代。原有本地部件继续可用。
- 通过原始 fqn 精确关联，不按名称或文件名猜测。完整定义的模板与控制脚本指纹用于检测版本变化；不是安全签名。未知定义保留原始 JSON，不能自动运行。
- config.native 保存 version:1、原始 fqn、family、时间/展示配置及 rawSource；config.datasources 保存实体与字段。DashboardWidget.widgetKey 使用 native_ 家族键。归一化保留原始 typeFullFqn 和配置；原始脚本始终只作为数据存储。

## 数据与配置

NativeWidgetPicker → NativeWidgetComposer → DashboardWidget 是通用流程。Composer 在确认前维护独立草稿；点击“更新预览”复制配置，预览与正式展示共用 NativeWidgetRenderer。点位详情锁定当前设备 UUID，部件设置不提前保存点位或设备位置。

设备配置筛选使用 deviceProfileId；属性区分 CLIENT_SCOPE、SERVER_SCOPE 和 SHARED_SCOPE。资产选择读取资产自身字段，下属设备汇总继续使用既有资产聚合部件。一个部件最多 8 个实体、32 个字段；仪表最多 4 个字段。

Renderer 自行维护只读数据生命周期，注册表的 dataProvider 为 static，以免旧单设备运行时重复订阅。数据服务复用现有认证遥测 API，最新值和历史值分别查询；多实体同名字段使用独立标识。历史范围最多 31 天，支持服务端 NONE/AVG/MIN/MAX/SUM/COUNT 聚合、绝对历史和滚动时间窗。

共享客户端最多 6 个在途请求，同一请求在途去重；每轮完成后再轮询，5–300 秒间隔。固定历史只查询一次。卸载和配置变化用代次丢弃过期结果，并停止后续调度；已经发出的 HTTP 请求不保证中止。历史每序列保留最近 2000 点，额外探测一条判断截断并提示。空值、失败和数字零明确区分，不伪造数据。

## 展示与保存边界

外层 WidgetHost 宿主使用现有 widgetSurface.css 和 WidgetAppearance；Renderer 内部透明，不增加 backdrop-filter。大屏全局玻璃设置优先于单部件设置。点位嵌套容器只保留高光与边框，由弹窗外层执行一次模糊；不改变地图位置、模型锚点或视频业务身份。

大屏仍由原模板显式保存；点位配置先返回编辑草稿，再由既有确认保存流程持久化。普通仪表盘继续写 configuration.__vueWidgets/__vueLayout。资源导入入口仅本地解析与预览，不覆盖后端部件；大屏导入保留原始定义并在添加时重新选择数据。

## 兼容、回退与验收

无数据库迁移、无用户模板批量重写。新配置为增量保存；旧前端不认识 native_ 键，不能用旧编辑器覆盖已含新部件的模板。回退代码前保留模板 JSON，可在当前编辑器删除新部件后再回退；历史设备数据和位置不受影响。

单元测试覆盖目录逐项识别、未知/自定义版本拒绝、多实体同名字段、属性范围、时间窗口、聚合、截断、失败和卸载。SFC 行为测试覆盖添加/重新编辑与草稿不提前保存。真实 API、客户权限、保存刷新和 Cesium WebGL 验收独立记录，不能用模拟视觉夹具代替。

2026-09-14：按用户批准的逐类适配方案实现本次基础类别和完整配置入口，无新增生产依赖。执行证据见 docs/changes/vue-widget-library/verification.md。
