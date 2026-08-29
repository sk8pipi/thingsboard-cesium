# 用户大屏视频播放修复验证记录

## 已完成只读检查

- 当前前端点击点位会调用 `POST /api/video/cameras/{tbDeviceId}/play`。
- 播放请求拒绝后前端统一设置 `playbackStatus=failed`。
- 地图模板运行时按租户读取点位设备，Video API 播放接口执行 Device READ 权限校验。
- 视频绑定 Repository 启动时只创建表结构，不自动插入模拟摄像头绑定。
- 当前本地 Docker 与 ThingsBoard/前端进程未运行，无法从已停止环境回取当时 HTTP 响应。
- 本机 PostgreSQL 仍运行，但只读查询因密码认证被拒绝；未读取本地密钥文件。

## 待验证

- 恢复共享环境后的播放接口 HTTP 状态和响应消息。
- 当前用户大屏点位 `entityId` 是否为模拟摄像头真实 Device UUID。
- 该 Device 是否分配给当前客户并具备 READ 权限。
- `video_camera_binding` 是否存在且指向 `polaris/live/virtual-oilwell-cam-001`。
- 前后端专项测试、HLS 播放及会话释放。

## 2026-08-28 身份与权限验证

- 跨租户只读核对确认目标设备 `e51a1860-4950-11f1-98c2-611f9ce73932` 属于租户“管涵奇”，设备名为 `sim-camera-001`、在线且视频绑定已启用。
- 另一个租户存在同名设备 `443b4b20-9d7f-11f1-bdae-d78c6fd10270`；早期把该设备误认为目标设备的替代 UUID，后续已纠正。原 UUID 可读且存在精确绑定时，运行时必须保留原 UUID。
- 目标租户管理员和目标设备所属客户的普通用户直接调用 `play` 均返回 HTTP 200、`ready/online=true`，HLS 返回 HTTP 200，会话已释放。
- 目标 Dashboard 点位的 `name/entityName` 均为 `sim-camera-001`，设备属性 `cameraName` 为 `virtual-camera-001`，与弹窗标题闪变现象一致。

## 2026-08-29 浏览器端根因与最终验收

- 在用户当前已登录的 Edge 大屏中点击目标点位，前端诊断捕获原始响应：HTTP 500、`errorCode=2`、`Content-Type 'application/x-www-form-urlencoded;charset=UTF-8' is not supported`。
- `docs/api/video-api.md` 明确要求播放、停止、PTZ 和录像控制请求使用 `application/json`；前端原实现使用 `defHttp.post`，继承全局表单编码默认值。
- 将全部视频 JSON POST 改为 `defHttp.postJson`，绑定 PUT 显式设置 JSON Content-Type 后，在同一页面、同一点位复测成功。
- 页面实测显示真实彩条视频、`设备在线`、`视频流正常`、`播放协议: hls`、`直播会话: 已建立`；标题保持 `sim-camera-001`，地图其他点位颜色正常。
- 关闭弹窗后会话释放完成，控制台没有出现新的播放或停止请求错误。
- `pnpm exec prettier --write src/api/tb/video.ts src/views/tb/map/services/cameraDeviceRuntimeService.ts` 通过。
- `pnpm exec eslint --max-warnings 0 src/api/tb/video.ts src/views/tb/map/services/cameraDeviceRuntimeService.ts` 通过。
- `pnpm run type:check` 被仓库既有无关 TypeScript 错误阻断；错误列表不包含本次修改文件。
