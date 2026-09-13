# 设备配置驱动大屏点位

## 范围和正式来源

Vue 用户大屏、地图编辑器、传感器详情与编辑预览、摄像头详情以及设备类别统计统一使用 ThingsBoard Device Profile。设备实体所属配置 ID 是关联键，配置名称是显示文本；模板中的名称只是快照。客户端属性 deviceType 只用于旧样式迁移，不参与新分类。default 是真实配置，缺失配置单列为暂不可用，两者不得混合。

不改变 Gateway 接入、视频绑定、Video API、设备权限、设备 UUID、数据库或网络拓扑。ThingsBoard 原生 Angular UI 继续负责管理设备配置；本次不修改原生 UI。

## 运行时契约

现有 GET /api/map-template/{dashboardId}/runtime 和对应 /runtime/events SSE 在 devices[设备UUID] 中增加 entityMetadata：

```json
{"entityMetadata":{"deviceProfileId":"配置UUID","deviceProfileName":"temperature","deviceProfileImage":"tb-image;/api/images/tenant/图片键"}}
```

image 可省略。设备信息读取失败返回空 entityMetadata，前端显示暂不可用，不把遥测里的同名字段或过期快照伪装成最新配置。后台合并全部属性、遥测、状态后最后写入这个保留字段；仅暴露 ID、名称、图片，不序列化完整配置。每个运行时快照按配置 ID 缓存成功和失败查询，下一快照重新查询以发现改名、换图及换配置。

沿用 dashboard/租户运行时权限边界，不宣称增加了逐设备客户授权检查。私有图片复用现有认证图片下载接口。用户页和编辑页订阅现有 runtime SSE，离开页面取消订阅；后端现有轮询延迟为 2 秒，实际间隔还包括查询耗时，不承诺固定两秒或千点容量。

## 模板和展示规则

管理员保存生成 version 8 模板。deviceProfileStyles 按配置 ID 存储：profileName 快照、preset 内置图标、pointKind（sensor 数据详情 / camera 视频详情）和颜色/SVG 图标覆盖。新点位保留配置 ID/名称快照；外观单点覆盖使用 pointStyleOverride，旧 sensorStyleOverride 继续兼容。标准化和业务引用保留配置身份，不把排除点重新加入地图。

样式按字段继承：单点覆盖 > 当前大屏配置覆盖 > 原生设备配置图片（图标）> 内置预设 > 通用图标。仅覆盖颜色不会屏蔽原生图片；单点恢复继承清除新旧两种覆盖。规则绑定配置 ID，已经保存的预设不会因配置改名丢失。原生图片接受 tb-image 前缀、同源相对路径或内嵌图片，其他地址回退内置；不向任意远程地址发送认证信息。图片按页面缓存、请求去重，失败后保留回退图标，刷新页面可重试；卸载释放资源。

默认精确识别 temperature、humidity、electricity_consumption、noise、illuminance、water_consumption 和 camera。未知自定义名称不靠关键词猜测：管理员在“点位自定义 → 按设备配置”选择内置图标和展示方式。camera 默认为视频详情，其他新配置默认为数据详情；未能读到配置的旧点位暂保留原展示方式。

新增点位为位置 → 选择设备 → 根据配置自动确定展示方式；重新定位和恢复仍需确认位置。展示方式控制弹窗入口，不授予视频能力；播放继续使用 tbDeviceId 和 Video API 返回的结果。切换配置不重建 UUID、坐标、模型锚点或视频绑定。地图只重建位置、标签、状态、样式等可见信息变化的实体，等价运行时刷新不重复计算全部点位位置。

## 迁移和回退

旧 sensorDeviceTypeStyles 按该点旧运行时 deviceType（支持包装值）→ 点位 deviceType → 遗留 sensorType 查找，映射至当前配置 ID。预览只在内存发生，用户大屏不持久化。多个旧分类映射到同一配置且样式不同，编辑页显式列出选择项，也允许采用默认样式；冲突未解决禁止保存。未知配置保留旧规则，待元数据恢复后再迁移。

管理员确认保存时才写入新规则，首次迁移在 profileMigrationBackup 保存原模板快照并保留旧样式字段；面板可下载该快照。快照可能包含模板当时的位置，但不备份也不回滚 ThingsBoard 设备位置。恢复旧模板需要人工检查并执行，不能盲用旧编辑器覆盖版本 8 模板。代码回退不撤销此前单独确认的位置写回。此次实现没有实际执行用户模板批量迁移。

## 验收标准和决策

配置改名图标稳定，换配置同步类型；不同 ID 同名配置分别统计；配置元数据不受遥测覆盖；图片异步加载、失败回退、卸载无后续渲染；单点与配置继承正确；新选点自动分类，旧样式冲突可解；坐标、模型锚点、模板排除和保存重试仍成立。真实 WebGL、客户会话、原生图片接口和视频播放的现场验收与自动测试分开记录。

2026-09-12：用户批准统一改为设备配置驱动、复用原生图片、摄像头统一外观、自动选点和旧模板迁移方案。实现与实测记录见 docs/changes/map-device-profile/。
