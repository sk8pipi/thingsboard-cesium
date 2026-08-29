# 用户大屏视频播放修复交付记录

## 基本信息

- 任务编号：customer-dashboard-video-playback-fix
- 任务名称：修复用户大屏监控点位提示无视频服务
- 当前状态：已完成
- 当前主 Agent：主 Agent
- 最后更新：2026-08-29

## 目标

- 复现用户大屏点击监控点位后 Video API 播放失败的真实错误。
- 校验点位 ThingsBoard Device UUID、客户权限、视频绑定与 WVP/ZLMediaKit 流的一致性。
- 在不绕过 Video API、不削弱设备权限校验的前提下修复端到端播放。
- 让前端保留可操作的错误语义，避免把权限、绑定、配置和上游故障全部显示为同一句提示。

## 非目标

- 不恢复 ThingsBoard 旧播放 URL 属性回退。
- 不让前端直接访问带凭证的 WVP、ZLMediaKit 或 RTSP 地址。
- 不执行生产部署、批量数据迁移或 Git 写操作。

## 当前发现

- 目标 Device UUID `e51a1860-4950-11f1-98c2-611f9ce73932` 确实存在，属于租户“管涵奇”，设备名为 `sim-camera-001`，且已为所属客户用户授予读取权限。
- 该 UUID 的视频绑定存在并启用，指向 `polaris-media/live/virtual-oilwell-cam-001`；同一客户用户直接调用播放接口和 HLS 都成功。
- 页面失败的真实原因是 `frontend/src/api/tb/video.ts` 使用 `defHttp.post`，继承了全局 `application/x-www-form-urlencoded` 默认值；后端 JSON 控制器因此返回 `Content-Type 'application/x-www-form-urlencoded;charset=UTF-8' is not supported`。
- 页面把上述 500 折叠为 `playbackStatus=failed`，所以弹窗只显示“视频服务暂不可用”，同时没有播放协议和直播会话。
- 弹窗标题先显示 `sim-camera-001` 再变成 `virtual-camera-001`，是点位名称被设备属性 `cameraName` 异步覆盖；不是设备身份变化。
- 录像接口 502 与直播失败不是同一个问题；未明确声明 `supportsPlayback=true` 的直播点位不应自动查询录像。

## 文件范围

- `backend/application/src/main/java/org/thingsboard/server/service/map/MapTemplateRuntimeService.java`
- `backend/application/src/main/java/org/thingsboard/server/controller/VideoController.java`
- `backend/application/src/main/java/org/thingsboard/server/service/video/`
- `backend/application/src/test/java/org/thingsboard/server/controller/`
- `backend/application/src/test/java/org/thingsboard/server/service/map/`
- `frontend/src/api/tb/video.ts`
- `frontend/src/views/tb/map/MapHome.vue`
- `frontend/src/views/tb/map/components/CameraMonitorPopup.vue`
- `frontend/src/views/tb/map/services/cameraDeviceRuntimeService.ts`
- `docs/changes/customer-dashboard-video-playback-fix/`
- `docs/changes/active-tasks.json`

## 当前进度

- `startVideoPlayback`、直播停止、PTZ、录像播放/控制/停止已统一改为 `postJson`，视频绑定 PUT 显式使用 `application/json`，消除同类请求体编码错误。
- `cameraDeviceRuntimeService.ts` 会保留可读且已有精确视频绑定的原 UUID；不会因其他租户存在同名设备而改写 `e51a...`。
- 地图查看页和编辑器固定保留点位配置名称作为弹窗标题，避免异步闪变。
- 点击兼容过程不修改地图点位集合或状态，其他点位不会变灰。
- 未明确声明 `supportsPlayback=true` 的直播点位不再自动查询录像。
- 已在用户当前登录的 5173 大屏点击目标点位实测：显示真实彩条视频、`设备在线`、`视频流正常`、协议 `hls`、直播会话 `已建立`；其他点位颜色保持正常。
- 关闭弹窗后会话释放路径无新错误。

## 风险

- 客户设备权限、Dashboard 可见性和视频访问是安全边界，不能为了播放而跳过校验。
- 当前工作树包含既有视频端到端与容量测试未提交修改，必须增量兼容。
- 本地 Docker、ThingsBoard、PostgreSQL、WVP 与 ZLMediaKit 是共享资源，只能串行操作。
