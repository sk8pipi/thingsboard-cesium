# Video API 中文调用文档

> 当前版本：直播、状态、截图、播放会话和摄像头绑定 API  
> 身份主键：ThingsBoard Device UUID  
> 鉴权方式：ThingsBoard JWT  
> 浏览器播放协议：HLS  
> 最后更新：2026-07-29

## 1. API 的职责

Video API 是前端、Cesium 和后续监控页面访问视频能力的唯一业务入口。

调用方只需要提供 ThingsBoard Device UUID，不需要知道 WVP 账号、ZLMediaKit
Secret、摄像头 RTSP 密码或媒体服务器内部地址。

当前已经提供：

- 查询当前用户可访问的摄像头。
- 查询单个摄像头的视频绑定和流状态。
- 创建和释放直播观看会话。
- 获取缓存截图。
- 管理 ThingsBoard 摄像头与 WVP/ZLMediaKit 流的绑定。

当前暂未提供：

- PTZ。
- 录像检索与回放。
- ZLMediaKit Hook。
- 生产播放 Ticket。

这些能力后续仍会沿用相同的 `tbDeviceId + VideoProvider` 扩展方式。

## 2. 调用约定

### 2.1 基础地址

前端同源调用：

```text
/api/video
```

本地直接调用 ThingsBoard 后端：

```text
http://127.0.0.1:8080/api/video
```

如果本地后端端口不同，请替换 `8080`。

### 2.2 鉴权

除 HLS 分片地址外，所有 `/api/video/**` 接口都使用 ThingsBoard JWT：

```http
X-Authorization: Bearer <THINGSBOARD_JWT>
```

前端项目使用现有 `defHttp` 时会自动携带登录用户的 JWT，不需要手工拼接。

PowerShell 示例：

```powershell
$tbJwt = "<登录后获得的 JWT>"
$headers = @{
  "X-Authorization" = "Bearer $tbJwt"
}
```

### 2.3 摄像头主键

正式接口路径中的 `{tbDeviceId}` 必须是 ThingsBoard Device UUID，例如：

```text
4d6f7eb0-5c25-11f1-86cb-01b6b6f1aba4
```

不要使用：

- Device Token。
- ThingsBoard Device Name。
- Label。
- WVP 通道编号。
- ZLMediaKit `streamId`。

旧的 `cameraCode` 播放兼容入口只用于迁移，新代码禁止依赖。

### 2.4 权限

| 用户类型 | 查询列表 | 查询/播放已授权设备 | 修改绑定 | 强制停止 |
| --- | --- | --- | --- | --- |
| `TENANT_ADMIN` | 是 | 是 | 是 | 是 |
| `CUSTOMER_USER` | 是，只返回有 READ 权限的设备 | 是 | 否 | 否 |

所有单摄像头接口都会复用 ThingsBoard Device `READ` 权限校验。

## 3. 接口总览

| 方法 | 路径 | 功能 |
| --- | --- | --- |
| `GET` | `/api/video/cameras` | 查询当前用户可访问的已绑定摄像头 |
| `GET` | `/api/video/cameras/{tbDeviceId}` | 查询摄像头绑定详情和当前状态 |
| `GET` | `/api/video/cameras/{tbDeviceId}/status` | 查询流状态，不启动流 |
| `POST` | `/api/video/cameras/{tbDeviceId}/play` | 创建播放会话并获得播放地址 |
| `POST` | `/api/video/cameras/{tbDeviceId}/stop` | 释放播放会话或强制停止 |
| `GET` | `/api/video/cameras/{tbDeviceId}/snapshot` | 获取短期缓存截图 |
| `GET` | `/api/video/devices/{tbDeviceId}/binding` | 查询视频绑定 |
| `PUT` | `/api/video/devices/{tbDeviceId}/binding` | 创建或更新视频绑定 |
| `DELETE` | `/api/video/devices/{tbDeviceId}/binding` | 删除视频绑定 |

## 4. 查询摄像头列表

### 4.1 功能

返回当前用户有权读取、并且已经存在 `video_camera_binding` 的摄像头。

该接口不会创建播放会话。后续监控页面可以先调用列表接口，再对可见卡片调用
截图接口；用户真正打开视频时才调用 `play`。

### 4.2 请求

```http
GET /api/video/cameras
```

```powershell
Invoke-RestMethod `
  -Method Get `
  -Uri "http://127.0.0.1:8080/api/video/cameras" `
  -Headers $headers
```

### 4.3 响应示例

```json
[
  {
    "tbDeviceId": "4d6f7eb0-5c25-11f1-86cb-01b6b6f1aba4",
    "cameraCode": "sim-camera-001",
    "name": "sim-camera-001",
    "provider": "WVP_STREAM_PROXY",
    "sourceType": "WVP_STREAM_PROXY",
    "app": "live",
    "stream": "virtual-oilwell-cam-001",
    "enabled": true,
    "online": true,
    "hlsUrl": "/video-stream/live/virtual-oilwell-cam-001/hls.m3u8",
    "flvUrl": "/video-stream/live/virtual-oilwell-cam-001.live.flv"
  }
]
```

兼容字段 `hlsUrl` 和 `flvUrl` 不应作为正式播放入口。正式播放必须调用
`POST .../play` 并使用该响应中的 `url`。

## 5. 查询摄像头详情

### 5.1 功能

返回一条视频绑定及当前 Provider 状态。该接口不会启动流。

### 5.2 请求

```http
GET /api/video/cameras/{tbDeviceId}
```

```powershell
$tbDeviceId = "4d6f7eb0-5c25-11f1-86cb-01b6b6f1aba4"
Invoke-RestMethod `
  -Method Get `
  -Uri "http://127.0.0.1:8080/api/video/cameras/$tbDeviceId" `
  -Headers $headers
```

### 5.3 响应示例

```json
{
  "tbDeviceId": "4d6f7eb0-5c25-11f1-86cb-01b6b6f1aba4",
  "cameraCode": "sim-camera-001",
  "provider": "WVP_STREAM_PROXY",
  "providerDeviceId": null,
  "providerChannelId": null,
  "mediaServerId": "polaris",
  "app": "live",
  "stream": "virtual-oilwell-cam-001",
  "preferredProtocol": "hls",
  "enabled": true,
  "status": {
    "status": "ready",
    "online": true,
    "readerCount": 1,
    "activeSessions": 1,
    "updatedAt": 1785290000000
  }
}
```

## 6. 查询流状态

### 6.1 功能

直接查询 Provider/ZLMediaKit 中的媒体状态，不调用 WVP 启动接口。

适合：

- 单个摄像头状态刷新。
- 播放故障诊断。
- 管理页面验证绑定。

不要用它代替 ThingsBoard 遥测的大规模实时订阅。生产状态同步完成后，页面列表
状态应主要来自 ThingsBoard WebSocket。

### 6.2 请求

```http
GET /api/video/cameras/{tbDeviceId}/status
```

```powershell
Invoke-RestMethod `
  -Method Get `
  -Uri "http://127.0.0.1:8080/api/video/cameras/$tbDeviceId/status" `
  -Headers $headers
```

### 6.3 响应示例

```json
{
  "tbDeviceId": "4d6f7eb0-5c25-11f1-86cb-01b6b6f1aba4",
  "cameraCode": "sim-camera-001",
  "provider": "WVP_STREAM_PROXY",
  "app": "live",
  "stream": "virtual-oilwell-cam-001",
  "status": "ready",
  "online": true,
  "readerCount": 1,
  "activeSessions": 1,
  "message": null,
  "updatedAt": 1785290000000,
  "scheduledStopAt": null
}
```

字段说明：

| 字段 | 说明 |
| --- | --- |
| `online` | Provider 是否确认流在线 |
| `readerCount` | ZLMediaKit 观察到的媒体读取者数量 |
| `activeSessions` | Video API 当前有效播放会话数量 |
| `scheduledStopAt` | 最后一个会话释放后的计划停止时间 |
| `message` | 降级或失败原因 |

`readerCount` 和 `activeSessions` 不是同一个概念。一个浏览器会话可能产生多个
媒体请求，媒体服务器读取者也可能来自 Video API 之外。

状态值：

| 状态 | 含义 |
| --- | --- |
| `offline` | 流未运行 |
| `starting` | 正在启动 |
| `ready` | 流可正常播放 |
| `degraded` | API 可响应，但 Provider 未确认流完全就绪 |
| `stopping` | 最后会话已释放，正在等待延迟停止或执行停止 |
| `failed` | Provider 操作失败 |

## 7. 创建播放会话

### 7.1 功能

校验 ThingsBoard 设备权限，查找绑定，选择 Provider，启动或复用流，并创建一个
属于当前用户的短期播放会话。

### 7.2 请求

```http
POST /api/video/cameras/{tbDeviceId}/play
Content-Type: application/json
```

```json
{
  "protocol": "hls",
  "streamProfile": "main"
}
```

当前支持：

- `protocol`: `hls`
- `streamProfile`: `main`

请求体可以省略，默认值仍然是 `hls + main`，以兼容现有调用。

```powershell
$playBody = @{
  protocol = "hls"
  streamProfile = "main"
} | ConvertTo-Json

$play = Invoke-RestMethod `
  -Method Post `
  -Uri "http://127.0.0.1:8080/api/video/cameras/$tbDeviceId/play" `
  -Headers $headers `
  -ContentType "application/json" `
  -Body $playBody
```

### 7.3 响应示例

```json
{
  "tbDeviceId": "4d6f7eb0-5c25-11f1-86cb-01b6b6f1aba4",
  "cameraCode": "sim-camera-001",
  "provider": "WVP_STREAM_PROXY",
  "app": "live",
  "stream": "virtual-oilwell-cam-001",
  "online": true,
  "hlsUrl": "/video-stream/live/virtual-oilwell-cam-001/hls.m3u8",
  "protocol": "hls",
  "url": "/video-stream/live/virtual-oilwell-cam-001/hls.m3u8",
  "flvUrl": "/video-stream/live/virtual-oilwell-cam-001.live.flv",
  "webRtcUrl": "/video-stream/index/api/webrtc?app=live&stream=virtual-oilwell-cam-001&type=play",
  "sessionId": "e638c918-a50a-4d37-8e76-20f1bb01de31",
  "status": "ready",
  "activeSessions": 1,
  "expiresAt": 1785290900000,
  "alternates": {
    "webRtc": "/video-stream/index/api/webrtc?app=live&stream=virtual-oilwell-cam-001&type=play",
    "flv": "/video-stream/live/virtual-oilwell-cam-001.live.flv"
  }
}
```

调用方必须：

1. 保存 `tbDeviceId` 和 `sessionId`。
2. 把 `url` 原样交给 `hls.js`。
3. 关闭、切换摄像头或卸载播放器时调用 `stop`。

调用方禁止：

- 从 RTSP 或 WebRTC 地址推导 HLS。
- 将 `hls.m3u8` 修改成 `index.m3u8`。
- 自动补 `/live`。
- 把地址改成 `localhost:8888`。

## 8. 释放播放会话

### 8.1 释放指定会话

这是浏览器和普通业务页面应使用的方式。

```http
POST /api/video/cameras/{tbDeviceId}/stop
Content-Type: application/json
```

```json
{
  "sessionId": "e638c918-a50a-4d37-8e76-20f1bb01de31",
  "force": false
}
```

```powershell
$stopBody = @{
  sessionId = $play.sessionId
  force = $false
} | ConvertTo-Json

Invoke-RestMethod `
  -Method Post `
  -Uri "http://127.0.0.1:8080/api/video/cameras/$tbDeviceId/stop" `
  -Headers $headers `
  -ContentType "application/json" `
  -Body $stopBody
```

### 8.2 释放当前用户在该摄像头上的全部会话

省略请求体或不提供 `sessionId`：

```http
POST /api/video/cameras/{tbDeviceId}/stop
```

这不会释放其他用户的会话。

### 8.3 管理员强制停止

仅 `TENANT_ADMIN` 可以调用：

```json
{
  "force": true
}
```

它会清除该摄像头的全部 API 会话并立即调用 Provider 停流。普通用户调用返回
`403`。

### 8.4 响应示例

```json
{
  "tbDeviceId": "4d6f7eb0-5c25-11f1-86cb-01b6b6f1aba4",
  "cameraCode": "sim-camera-001",
  "sessionId": "e638c918-a50a-4d37-8e76-20f1bb01de31",
  "status": "stopping",
  "activeSessions": 0,
  "scheduledStopAt": 1785290020000
}
```

默认行为：

- 会话有效期为 900 秒。
- 最后一个会话释放后延迟 20 秒停流。
- 延迟期间重新调用 `play` 会取消计划停止并复用流。
- 页面异常关闭未成功调用 `stop` 时，后端 TTL 会最终清理会话。

## 9. 获取截图

### 9.1 功能

通过 Provider 调用 ZLMediaKit 截图，并在 Video API 中短期缓存。适合缩略图、列表
预览和绑定验证。

截图接口返回图片二进制，不返回 JSON。

### 9.2 请求

```http
GET /api/video/cameras/{tbDeviceId}/snapshot
```

```powershell
Invoke-WebRequest `
  -Method Get `
  -Uri "http://127.0.0.1:8080/api/video/cameras/$tbDeviceId/snapshot" `
  -Headers $headers `
  -OutFile ".\camera-snapshot.jpg"
```

重要响应头：

```text
Content-Type: image/jpeg
Cache-Control: private, max-age=5
X-Video-Captured-At: 1785290000000
```

前端调用：

```ts
import { getVideoSnapshot } from '/@/api/tb/video';

const blob = await getVideoSnapshot(tbDeviceId);
const objectUrl = URL.createObjectURL(blob);

// 图片不再使用时必须释放
URL.revokeObjectURL(objectUrl);
```

## 10. 查询视频绑定

### 10.1 功能

查询 ThingsBoard Device UUID 对应的视频 Provider 和媒体流标识。

### 10.2 请求

```http
GET /api/video/devices/{tbDeviceId}/binding
```

```powershell
Invoke-RestMethod `
  -Method Get `
  -Uri "http://127.0.0.1:8080/api/video/devices/$tbDeviceId/binding" `
  -Headers $headers
```

### 10.3 响应示例

```json
{
  "id": "b6e37ad5-c91f-4d85-9b7a-68cab7ae9f22",
  "tenantId": "tenant-uuid",
  "tbDeviceId": "4d6f7eb0-5c25-11f1-86cb-01b6b6f1aba4",
  "cameraCode": "sim-camera-001",
  "provider": "WVP_STREAM_PROXY",
  "providerDeviceId": null,
  "providerChannelId": null,
  "mediaServerId": "polaris",
  "streamApp": "live",
  "streamId": "virtual-oilwell-cam-001",
  "preferredProtocol": "hls",
  "enabled": true,
  "createdTime": 1785280000000,
  "updatedTime": 1785280000000
}
```

## 11. 创建或更新视频绑定

### 11.1 权限

仅 `TENANT_ADMIN`。

### 11.2 请求

```http
PUT /api/video/devices/{tbDeviceId}/binding
Content-Type: application/json
```

```json
{
  "cameraCode": "sim-camera-001",
  "provider": "WVP_STREAM_PROXY",
  "providerDeviceId": null,
  "providerChannelId": null,
  "mediaServerId": "polaris",
  "streamApp": "live",
  "streamId": "virtual-oilwell-cam-001",
  "preferredProtocol": "hls",
  "enabled": true
}
```

```powershell
$bindingBody = @{
  cameraCode = "sim-camera-001"
  provider = "WVP_STREAM_PROXY"
  mediaServerId = "polaris"
  streamApp = "live"
  streamId = "virtual-oilwell-cam-001"
  preferredProtocol = "hls"
  enabled = $true
} | ConvertTo-Json

Invoke-RestMethod `
  -Method Put `
  -Uri "http://127.0.0.1:8080/api/video/devices/$tbDeviceId/binding" `
  -Headers $headers `
  -ContentType "application/json" `
  -Body $bindingBody
```

字段说明：

| 字段 | 必填 | 说明 |
| --- | --- | --- |
| `cameraCode` | 是 | 稳定业务编号，同一租户唯一 |
| `provider` | 否 | 默认 `WVP_STREAM_PROXY` |
| `providerDeviceId` | 否 | GB28181/厂商设备编号 |
| `providerChannelId` | 否 | GB28181/厂商通道编号 |
| `mediaServerId` | 否 | 媒体节点编号 |
| `streamApp` | 否 | 默认 `live` |
| `streamId` | 否 | 默认使用 `cameraCode` |
| `preferredProtocol` | 否 | 当前使用 `hls` |
| `enabled` | 否 | 默认 `true` |

绑定中禁止保存：

- WVP 密码。
- ZLMediaKit Secret。
- 摄像头 RTSP 用户名和密码。
- ThingsBoard Device Token。
- 完整的运行时播放 URL。

## 12. 删除视频绑定

### 12.1 权限

仅 `TENANT_ADMIN`。

### 12.2 请求

```http
DELETE /api/video/devices/{tbDeviceId}/binding
```

```powershell
Invoke-RestMethod `
  -Method Delete `
  -Uri "http://127.0.0.1:8080/api/video/devices/$tbDeviceId/binding" `
  -Headers $headers
```

成功返回：

```text
HTTP 200
```

删除绑定不会删除 ThingsBoard Device，也不会删除设备历史遥测和 Cesium 点位。

## 13. 错误响应

Video API 使用 ThingsBoard 标准错误结构：

```json
{
  "status": 404,
  "message": "No video binding exists for ThingsBoard device: ...",
  "errorCode": 32,
  "timestamp": 1785290000000
}
```

常见 HTTP 状态：

| 状态 | 含义 |
| --- | --- |
| `400` | UUID、`sessionId`、协议、码流档位或绑定参数非法 |
| `401` | JWT 缺失或失效 |
| `403` | 无 ThingsBoard Device 权限，或普通用户执行管理员操作 |
| `404` | ThingsBoard Device、视频绑定、播放会话或 WVP 代理不存在 |
| `409` | 视频绑定被禁用 |
| `502` | WVP 或 ZLMediaKit 请求失败 |
| `503` | 视频集成未启用或必要凭证未配置 |

前端遇到 Video API 错误时，应只在视频区域提示错误，不得删除 Cesium 点位，也
不得把 ThingsBoard 设备直接标记为不存在。

## 14. 前端 TypeScript 调用

封装位置：

```text
frontend/src/api/tb/video.ts
```

示例：

```ts
import {
  getVideoCameraStatus,
  getVideoSnapshot,
  startVideoPlayback,
  stopVideoPlayback,
} from '/@/api/tb/video';

const playback = await startVideoPlayback(tbDeviceId, {
  protocol: 'hls',
  streamProfile: 'main',
});

hls.loadSource(playback.url);

const status = await getVideoCameraStatus(tbDeviceId);
const snapshot = await getVideoSnapshot(tbDeviceId);

await stopVideoPlayback(tbDeviceId, {
  sessionId: playback.sessionId,
});
```

## 15. 推荐页面生命周期

```text
用户点击摄像头
  -> POST play
  -> 保存 tbDeviceId + sessionId
  -> 使用响应 url 播放
  -> 用户关闭 / 切换摄像头 / 组件卸载
  -> POST stop(sessionId)
```

并发和异常要求：

- 同一个页面重复点击时不要为同一次展示重复调用 `play`。
- 新摄像头加载前释放旧摄像头会话。
- 如果旧的异步 `play` 在切换后才返回，立即释放旧响应中的 `sessionId`。
- `stop` 失败时记录警告，依赖后端 TTL 最终清理。
- 不依赖浏览器关闭事件保证释放，浏览器关闭并不可靠。

## 16. 配置项

后端通过环境变量配置：

```text
VIDEO_WVP_ENABLED
VIDEO_WVP_BASE_URL
VIDEO_WVP_USERNAME
VIDEO_WVP_PASSWORD
VIDEO_ZLM_ENABLED
VIDEO_ZLM_BASE_URL
VIDEO_ZLM_SECRET
VIDEO_ZLM_RTSP_BASE_URL
VIDEO_SESSION_TTL_SECONDS
VIDEO_SESSION_STOP_DELAY_SECONDS
VIDEO_SNAPSHOT_CACHE_SECONDS
```

凭证只能放在后端环境变量或安全配置中，不得通过任何 Video API 返回给浏览器。

### 16.1 Windows 本地启动

仓库提供了不包含密钥的模板和本地启动脚本：

```powershell
Copy-Item .env.video.example .env.video.local
# 只在被 Git 忽略的 .env.video.local 中填写本机密码和 Secret。
.\scripts\start-thingsboard-video-local.ps1
```

脚本会同时加载 PostgreSQL、WVP、ZLMediaKit 和播放会话配置，再从
`backend` 模块启动 ThingsBoard。`.env.video.local` 不得提交。

如果 `POST /api/video/cameras/{tbDeviceId}/play` 返回：

```text
503 WVP video integration is disabled
```

说明当前后端不是通过上述脚本启动，或者缺少
`VIDEO_WVP_ENABLED=true`。这与 ThingsBoard 设备在线状态、摄像头 UUID
绑定和 Docker 容器是否在线无关；加载环境变量并重启后端即可。

## 17. PTZ 统一 API

### 17.1 请求

```http
POST /api/video/cameras/{tbDeviceId}/ptz
Content-Type: application/json
X-Authorization: Bearer <THINGSBOARD_JWT>
```

```json
{
  "command": "ptz.up",
  "speed": 50,
  "durationMs": 500,
  "presetId": null
}
```

支持的 `command`：

- 方向：`ptz.up`、`ptz.down`、`ptz.left`、`ptz.right`、
  `ptz.up-left`、`ptz.up-right`、`ptz.down-left`、`ptz.down-right`、`ptz.stop`。
- 变焦：`zoom.in`、`zoom.out`。
- 预置位：`preset.call`、`preset.save`、`preset.delete`，必须提供
  `presetId`（1～255）。

`speed` 范围为 1～100，默认 50；`durationMs` 可选，范围为
100～10000。调用者必须拥有 ThingsBoard Device 的 `RPC_CALL` 权限。

```powershell
$ptzBody = @{
  command = "ptz.left"
  speed = 50
  durationMs = 500
} | ConvertTo-Json

Invoke-RestMethod `
  -Method Post `
  -Uri "http://127.0.0.1:8080/api/video/cameras/$tbDeviceId/ptz" `
  -Headers $headers `
  -ContentType "application/json" `
  -Body $ptzBody
```

### 17.2 路由规则与响应

绑定同时存在 `providerDeviceId` 和 `providerChannelId` 时，WVP Provider
把统一命令翻译为 GB28181 PTZ；否则通过 ThingsBoard 单向 RPC 发送同名
命令，供当前模拟摄像头或网关设备消费。

```json
{
  "tbDeviceId": "4d6f7eb0-5c25-11f1-86cb-01b6b6f1aba4",
  "cameraCode": "sim-camera-001",
  "provider": "WVP_STREAM_PROXY",
  "transport": "thingsboard-rpc",
  "command": "ptz.left",
  "accepted": true,
  "requestId": "6a9498cc-90f6-4c61-b769-b2a2881ab079",
  "requestedAt": 1785290000000
}
```

`accepted=true` 表示后端已接受并投递，不代表摄像头机械动作一定成功。
真实 GB28181 通道的 `transport` 为 `wvp-gb28181`。

## 18. 录像检索与回放 API

录像能力要求绑定配置真实的 `providerDeviceId` 和
`providerChannelId`。当前仅有直播流的 `sim-camera-001` 可以验证 PTZ RPC，
但不能伪造 WVP 设备录像。

### 18.1 检索录像

```http
GET /api/video/cameras/{tbDeviceId}/recordings?startTime=<epochMs>&endTime=<epochMs>
```

时间使用 Unix epoch 毫秒，查询范围最大 31 天。

```powershell
$startTime = [DateTimeOffset]::Now.AddHours(-6).ToUnixTimeMilliseconds()
$endTime = [DateTimeOffset]::Now.ToUnixTimeMilliseconds()
Invoke-RestMethod `
  -Method Get `
  -Uri "http://127.0.0.1:8080/api/video/cameras/$tbDeviceId/recordings?startTime=$startTime&endTime=$endTime" `
  -Headers $headers
```

响应只返回业务需要的元数据，不返回 Provider 内部下载地址或凭证：

```json
{
  "tbDeviceId": "4d6f7eb0-5c25-11f1-86cb-01b6b6f1aba4",
  "cameraCode": "cam-gb-001",
  "startTime": 1785268400000,
  "endTime": 1785290000000,
  "total": 1,
  "recordings": [
    {
      "recordingId": "provider-recording-id",
      "startTime": 1785286400000,
      "endTime": 1785290000000,
      "durationMs": 3600000,
      "fileSize": 104857600,
      "recordType": "time"
    }
  ]
}
```

### 18.2 创建回放会话

```http
POST /api/video/cameras/{tbDeviceId}/recordings/play
Content-Type: application/json
```

```json
{
  "startTime": 1785286400000,
  "endTime": 1785290000000,
  "protocol": "hls"
}
```

响应中的 `url` 是唯一应交给播放器的地址：

```json
{
  "tbDeviceId": "4d6f7eb0-5c25-11f1-86cb-01b6b6f1aba4",
  "cameraCode": "cam-gb-001",
  "provider": "WVP_STREAM_PROXY",
  "sessionId": "7936b4dc-f436-483c-a7b2-9e4b425ab45e",
  "app": "rtp",
  "stream": "playback-stream-id",
  "protocol": "hls",
  "url": "/video-stream/rtp/playback-stream-id/hls.m3u8",
  "online": true,
  "startTime": 1785286400000,
  "endTime": 1785290000000,
  "expiresAt": 1785290900000
}
```

### 18.3 控制回放

```http
POST /api/video/cameras/{tbDeviceId}/recordings/control
```

暂停或恢复：

```json
{"sessionId":"7936b4dc-f436-483c-a7b2-9e4b425ab45e","action":"pause"}
```

定位，单位为相对录像开始时间的秒数：

```json
{"sessionId":"7936b4dc-f436-483c-a7b2-9e4b425ab45e","action":"seek","positionSeconds":120}
```

倍速只允许 `0.25`、`0.5`、`1`、`2`、`4`、`8`：

```json
{"sessionId":"7936b4dc-f436-483c-a7b2-9e4b425ab45e","action":"speed","speed":2}
```

### 18.4 停止回放

```http
POST /api/video/cameras/{tbDeviceId}/recordings/stop
```

```json
{"sessionId":"7936b4dc-f436-483c-a7b2-9e4b425ab45e"}
```

回放会话默认 900 秒到期；过期后后端自动调用 Provider 停止接口。
普通用户只能操作自己的会话，`TENANT_ADMIN` 可以释放同租户设备上的会话。

## 19. ZLMediaKit Hook API

Hook 不使用 ThingsBoard JWT，而使用独立的 `VIDEO_ZLM_HOOK_TOKEN`。
未配置该变量时接口返回 `503`；Token 错误返回 `401`。

直接事件路由：

```http
POST /api/noauth/video/hooks/zlm/on_stream_changed
X-Video-Hook-Token: <VIDEO_ZLM_HOOK_TOKEN>
Content-Type: application/json
```

也支持受信任转发器统一转发：

```http
POST /api/noauth/video/hooks/zlm
X-Zlm-Hook-Event: on_stream_changed
X-Video-Hook-Token: <VIDEO_ZLM_HOOK_TOKEN>
```

如果 WVP 已独占 ZLMediaKit Hook 地址，必须使用受信任的 Nginx/Hook
转发器把原请求继续发给 WVP，同时镜像一份到上述统一转发入口；不要直接覆盖
WVP Hook 地址。Token 只能保存在 ZLMediaKit 或转发器的服务端配置中。

当前处理的状态事件包括：

- `on_stream_changed`
- `on_stream_none_reader`
- `on_play`
- `on_record_start`、`on_record_stop`
- `on_record_mp4`、`on_record_ts`

Hook 根据 `mediaServerId + app + stream` 查找 `video_camera_binding`，写入：

```text
streamOnline
videoLoss
readerCount
recording
videoHookUpdatedAt
videoStreamStatus
lastRecordingAt
```

写入同时更新历史遥测、最新值和 ThingsBoard WebSocket。对于
`on_stream_none_reader`，响应固定包含 `{"code":0,"close":false}`，流是否关闭
仍由 Video API 会话策略决定。

## 20. 新增配置项

```text
VIDEO_PTZ_RPC_TIMEOUT_MS=10000
VIDEO_RECORDING_SESSION_TTL_SECONDS=900
VIDEO_RECORDING_SESSION_CLEANUP_INTERVAL_MS=30000
VIDEO_ZLM_HOOK_TOKEN=<独立随机密钥>
VIDEO_WVP_TIME_ZONE=Asia/Shanghai
```

`VIDEO_ZLM_HOOK_TOKEN` 不得与 WVP 密码、ZLMediaKit Secret、ThingsBoard
JWT 或 Device Token 复用，也不得提交到 Git。
