# Video Platform Validation Environment

This directory contains the isolated WVP and ZLMediaKit validation environment
for the ThingsBoard + Cesium project.

## Directory layout

- `deploy/`: Docker Compose and environment templates.
- `config/wvp/`: WVP configuration overrides.
- `config/zlm/`: ZLMediaKit configuration overrides.
- `source/`: local upstream source checkouts; ignored by the parent repository.
- `data/`: database and Redis runtime data; ignored.
- `logs/`: service logs; ignored.
- `recordings/`: test video recordings and snapshots; ignored.

The validation environment must not expose camera credentials, WVP credentials,
or ZLMediaKit API secrets to the frontend.
## Windows quick commands

Run these commands from this directory:

```powershell
.\manage-video-platform.ps1 start
.\manage-video-platform.ps1 status
.\manage-video-platform.ps1 validate
.\manage-video-platform.ps1 logs
.\manage-video-platform.ps1 stop
```

`start` uses the PostgreSQL deployment override and does not start the MySQL
service. The WVP page is available at <http://127.0.0.1:18080>.

The local validation defaults publish ZLMediaKit HTTP on port `80` and keep its
diagnostic API on <http://127.0.0.1:18081>. Before deploying to another host,
set `WVP_STREAM_IP` and protect the public media port with a reverse proxy and
network access controls.
## Validated local stream

The project-owned ZLMediaKit configuration enables HLS. After the WVP proxy is
started, the virtual camera is available at:

```text
http://127.0.0.1/live/virtual-oilwell-cam-001/hls.m3u8
```

The Vue development server exposes the same stream through the same-origin URL:

```text
/video-stream/live/virtual-oilwell-cam-001/hls.m3u8
```
## ThingsBoard Video API

完整的中文接口说明和调用示例见 [`docs/api/video-api.md`](../docs/api/video-api.md)。

The ThingsBoard application integration is disabled by default. Configure these
environment variables before starting the backend:

```text
VIDEO_WVP_ENABLED=true
VIDEO_WVP_BASE_URL=http://127.0.0.1:18080
VIDEO_WVP_USERNAME=admin
VIDEO_WVP_PASSWORD=<local WVP password>
VIDEO_WVP_DEFAULT_APP=live
VIDEO_BINDING_AUTO_INITIALIZE_SCHEMA=true
VIDEO_ZLM_ENABLED=true
VIDEO_ZLM_BASE_URL=http://127.0.0.1:18081
VIDEO_ZLM_SECRET=<local ZLMediaKit secret>
VIDEO_ZLM_RTSP_BASE_URL=rtsp://127.0.0.1:10002
VIDEO_SESSION_TTL_SECONDS=900
VIDEO_SESSION_STOP_DELAY_SECONDS=20
VIDEO_SNAPSHOT_CACHE_SECONDS=5
```

The UUID binding slice exposes:

```text
GET    /api/video/cameras
GET    /api/video/cameras/{tbDeviceId}
POST   /api/video/cameras/{tbDeviceId}/play
POST   /api/video/cameras/{tbDeviceId}/stop
GET    /api/video/cameras/{tbDeviceId}/status
GET    /api/video/cameras/{tbDeviceId}/snapshot
GET    /api/video/devices/{tbDeviceId}/binding
PUT    /api/video/devices/{tbDeviceId}/binding
DELETE /api/video/devices/{tbDeviceId}/binding

```

All endpoints use the existing ThingsBoard JWT authorization model.

`play` returns a short-lived `sessionId`. Pass it to `stop` when the viewer is
closed. If no session ID is supplied, `stop` releases all sessions owned by the
current user for that camera. The last released session schedules a delayed
provider stop; tenant administrators may send `{"force": true}` for an
immediate stop. Snapshot responses are private, short-lived cached image bytes.

## Containerized virtual camera

The local virtual camera no longer requires host-side FFmpeg or camera-status
PowerShell windows. The Docker stack now provides:

- `camera-simulator-local`: continuously publishes the test pattern to MediaMTX.
- `virtual-camera-stream-registrar`: registers the MediaMTX RTSP source in ZLMediaKit and restores it after media-server restarts.
- `camera-status-publisher-local`: probes the real ZLMediaKit HLS manifest and publishes camera telemetry directly to Mosquitto.

The three Compose projects communicate through the external `video-iot-net`
network. `manage-video-platform.ps1 start` creates this network when necessary.
To start the complete camera, video platform, MQTT, and Gateway stack in one
command, run:

```powershell
E:\simulationEquipment\start-all.ps1
```

The original PowerShell camera scripts remain available only for manual
troubleshooting and must not run at the same time as the containerized status
publisher.

## Starting the ThingsBoard backend for local video validation

Keep credentials in the Git-ignored `.env.video.local` file and start
ThingsBoard from the repository root with:

```powershell
Copy-Item .env.video.example .env.video.local
# Fill in the local-only values once.
.\scripts\start-thingsboard-video-local.ps1
```

Do not start the backend with plain `mvn spring-boot:run` for video validation.
That omits `VIDEO_WVP_ENABLED` and `VIDEO_ZLM_ENABLED`, so the Video API returns
HTTP `503` even when the WVP and ZLMediaKit containers are healthy.
