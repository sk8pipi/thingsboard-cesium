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

The ThingsBoard application integration is disabled by default. Configure these
environment variables before starting the backend:

```text
VIDEO_WVP_ENABLED=true
VIDEO_WVP_BASE_URL=http://127.0.0.1:18080
VIDEO_WVP_USERNAME=admin
VIDEO_WVP_PASSWORD=<local WVP password>
VIDEO_WVP_DEFAULT_APP=live
```

The first API slice exposes:

```text
GET  /api/video/cameras
POST /api/video/cameras/{cameraCode}/play
```

Both endpoints use the existing ThingsBoard JWT authorization model.

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
