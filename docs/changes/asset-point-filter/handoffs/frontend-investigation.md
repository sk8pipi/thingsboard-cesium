# 前端调用链调查交接

- Agent：frontend_investigation（只读）
- 状态：已完成
- 结论：资产过滤应放在 `MapHome.vue` 的 `visibleSensorPoints` / `visibleCameraPoints` 输入层，不修改模板原始点位。
- 入口：`MapScreenTopBar.vue` 动作容器增加运行时具名插槽，避免把资产选择写入管理员模板动作配置。
- 生命周期：筛选隐藏当前摄像头时调用 `closeCameraPopup()`；`CameraMonitorPopup` 与视频操作组件既有 watcher 会释放会话。
- 补充：报警聚焦需改为只搜索可见点位；资产列表必须完整分页；快速切换需请求代次。
- 建议范围：`MapHome.vue`、`MapScreenTopBar.vue`、新资产选择器、筛选服务、本地存储、关系 API 类型与专项测试。
