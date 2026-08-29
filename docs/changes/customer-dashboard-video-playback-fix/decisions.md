# 用户大屏视频播放修复决策记录

## 待确认决策

当前尚未改变公共 API、权限模型、数据库结构或视频架构。先以运行时实际错误为准，
在现有 `tbDeviceId + Video API + video_camera_binding + VideoProvider` 边界内选择最小修复。

## 已冻结约束

- 不绕过 ThingsBoard Device 权限校验。
- 不恢复前端旧 HLS/RTSP/WebRTC 地址推导或属性回退。
- 不把 WVP/ZLMediaKit 凭证暴露给浏览器。
- 点位必须使用 ThingsBoard Device UUID，运行时播放地址必须来自 Video API。

## 2026-08-28 实施决定

- 客户用户点击摄像头时只读获取当前分配的 Dashboard，不替换当前地图状态；优先按点位 ID，必要时按唯一设备名称或唯一显示名称定位最新点位，再使用该点位的 `tbDeviceId`。不使用 `cameraCode` 绕过 UUID 主键，也不为已删除 Device 建立别名。
- 录像能力采用显式声明：只有 `supportsPlayback=true` 才展示并查询录像。未声明能力不再按“支持”处理。

## 2026-08-28 最终兼容决定

- 只在 `MapHome.vue` 重新读取客户 Dashboard 不能覆盖租户模板、手工点位、本地缓存和长期存活的旧页面状态，因此摄像头身份迁移必须在所有地图入口共用的 `cameraDeviceRuntimeService.ts` 完成。
- 运行时先查询当前用户权限过滤后的 `GET /api/video/cameras`。旧点位 UUID 不在列表中时，只允许用点位设备名称或显示名称与列表中的 `cameraCode`/设备名称做唯一匹配；匹配结果仍必须是当前 ThingsBoard Device UUID，`play` 不得直接使用 `cameraCode`。
- 列表查询失败、没有匹配或存在多个匹配时不自动改写 UUID，保留原请求并暴露失败，避免错误串流和权限越界。
- 身份匹配同时使用点位设备名称、显示名称和稳定点位 ID；`camera-<cameraCode>`、`video-camera-<cameraCode>`、`device-<cameraCode>` 只去除明确前缀后再做精确唯一匹配，不使用包含或模糊匹配。
- 在任何身份迁移前先按点位 UUID 查询 Device；当前用户能够读取原 Device 时必须保留原 UUID，即使另一个视频绑定具有相同设备名称或 `cameraCode`，也禁止自动重定向。
- 当旧点位身份仍无法匹配时，只有同时满足“原 Device 对当前用户明确返回 403/404”和“当前用户权限过滤后仅有一个视频 Device UUID”才允许使用该唯一 UUID；原 Device 仍可读取或可访问视频设备不唯一时禁止该回退。
- 解析出的当前 UUID 必须保留在摄像头运行时对象中，页面不得再用旧点位 `entityId` 覆盖；兼容解析不得修改整张地图状态或点位颜色。

## 2026-08-29 请求编码决定

- Video API 中带 JSON 请求体的播放、停止、PTZ、录像播放/控制/停止必须使用 `defHttp.postJson`，不得使用继承全局表单编码的 `defHttp.post`。
- 视频绑定 PUT 必须显式声明 `application/json`；不改变后端接口契约、权限模型或部署拓扑。
- 保留不含令牌和上游凭据的结构化播放失败日志，便于区分请求编码、权限、绑定和上游故障。
