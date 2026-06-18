# Preview Camera Adapter

This tool is a minimal **preview-only camera adapter**.

It does only two things:

1. Publishes preview camera metadata to MQTT.
2. Publishes mock/derived camera state and health to MQTT.

It does **not** do any of the following:

- PTZ
- RPC
- ONVIF
- reboot commands
- motion enable/disable commands
- video forwarding through ThingsBoard Gateway

The existing video path remains unchanged:

`RTSP -> FFmpeg -> HLS -> http-server -> hls.js`

The adapter is only responsible for `attributes + telemetry`.

## Directory

```text
tools/camera-adapter/
  package.json
  tsconfig.json
  src/
    config.ts
    index.ts
    types.ts
```

## Topics

- `camera/{cameraId}/meta`
- `camera/{cameraId}/state`
- `camera/{cameraId}/health`

## Payload examples

### 1. Meta topic

Topic:

```text
camera/camera-001/meta
```

Payload:

```json
{
  "cameraId": "camera-001",
  "name": "北门摄像头",
  "manufacturer": "Unknown",
  "model": "PreviewOnlyCamera",
  "ip": "192.168.31.100",
  "lng": 127.00035,
  "lat": 37.50016,
  "alt": 6,
  "customerId": "customer-001",
  "siteId": "site-north-gate",
  "streamType": "hls",
  "streamUrlMain": "/live/camera-001/index.m3u8",
  "streamUrlSub": "",
  "previewOnly": true
}
```

### 2. State topic

Topic:

```text
camera/camera-001/state
```

Payload:

```json
{
  "cameraId": "camera-001",
  "online": true,
  "playerError": "",
  "previewOpenCount": 0,
  "previewLastOpenTs": 0,
  "alarmText": "",
  "alarmLevel": "none",
  "ts": 1776902400000
}
```

### 3. Health topic

Topic:

```text
camera/camera-001/health
```

Payload:

```json
{
  "cameraId": "camera-001",
  "online": true,
  "streamAlive": true,
  "bitrateKbps": 2048,
  "lastHeartbeatTs": 1776902400000,
  "ts": 1776902400000
}
```

## How stream health is derived

This adapter does not use any camera SDK.

It uses the local HLS output directory:

1. Check whether `index.m3u8` exists.
2. Check whether a recent `.ts` or `.m4s` segment was updated.
3. If the latest segment update time is within the configured threshold, then `streamAlive=true`.

This is intentionally simple and easy to maintain.

## Environment variables

You can run the adapter with defaults, or override values with environment variables.

Common variables:

- `CAMERA_ADAPTER_MQTT_URL`
- `CAMERA_ADAPTER_MQTT_USERNAME`
- `CAMERA_ADAPTER_MQTT_PASSWORD`
- `CAMERA_ADAPTER_TOPIC_PREFIX`
- `CAMERA_ADAPTER_PUBLISH_INTERVAL_MS`
- `CAMERA_ADAPTER_CAMERA_ID`
- `CAMERA_ADAPTER_CAMERA_NAME`
- `CAMERA_ADAPTER_CAMERA_IP`
- `CAMERA_ADAPTER_CAMERA_LNG`
- `CAMERA_ADAPTER_CAMERA_LAT`
- `CAMERA_ADAPTER_CAMERA_ALT`
- `CAMERA_ADAPTER_STREAM_URL_MAIN`
- `CAMERA_ADAPTER_HLS_DIR`
- `CAMERA_ADAPTER_STREAM_ALIVE_THRESHOLD_MS`
- `CAMERA_ADAPTER_NORMAL_BITRATE_KBPS`

## Run locally

Install dependencies:

```bash
cd tools/camera-adapter
pnpm install
```

Run in development mode:

```bash
pnpm dev
```

Build:

```bash
pnpm build
```

Run compiled output:

```bash
pnpm start
```

## PowerShell example

```powershell
$env:CAMERA_ADAPTER_MQTT_URL='mqtt://127.0.0.1:1883'
$env:CAMERA_ADAPTER_CAMERA_ID='camera-001'
$env:CAMERA_ADAPTER_CAMERA_NAME='北门摄像头'
$env:CAMERA_ADAPTER_HLS_DIR="$env:USERPROFILE\camera-streams\live\camera-001"
pnpm dev
```

## ThingsBoard Gateway MQTT mapping suggestion

Use three data mappings in the MQTT connector.

### Mapping A: meta

- Topic filter: `camera/+/meta`
- Payload type: `JSON`
- Device name source: `Topic`
- Device name expression: `(?<=camera/)(.*?)(?=/meta)`
- Device profile source: `Constant`
- Device profile expression: `PreviewOnlyCameraProfile`
- Attributes:
  - `cameraId` <- `${cameraId}`
  - `name` <- `${name}`
  - `manufacturer` <- `${manufacturer}`
  - `model` <- `${model}`
  - `ip` <- `${ip}`
  - `lng` <- `${lng}`
  - `lat` <- `${lat}`
  - `alt` <- `${alt}`
  - `customerId` <- `${customerId}`
  - `siteId` <- `${siteId}`
  - `streamType` <- `${streamType}`
  - `streamUrlMain` <- `${streamUrlMain}`
  - `streamUrlSub` <- `${streamUrlSub}`
  - `previewOnly` <- `${previewOnly}`

### Mapping B: state

- Topic filter: `camera/+/state`
- Payload type: `JSON`
- Device name source: `Topic`
- Device name expression: `(?<=camera/)(.*?)(?=/state)`
- Device profile source: `Constant`
- Device profile expression: `PreviewOnlyCameraProfile`
- Timeseries:
  - `online` <- `${online}`
  - `playerError` <- `${playerError}`
  - `previewOpenCount` <- `${previewOpenCount}`
  - `previewLastOpenTs` <- `${previewLastOpenTs}`
  - `alarmText` <- `${alarmText}`
  - `alarmLevel` <- `${alarmLevel}`

### Mapping C: health

- Topic filter: `camera/+/health`
- Payload type: `JSON`
- Device name source: `Topic`
- Device name expression: `(?<=camera/)(.*?)(?=/health)`
- Device profile source: `Constant`
- Device profile expression: `PreviewOnlyCameraProfile`
- Timeseries:
  - `online` <- `${online}`
  - `streamAlive` <- `${streamAlive}`
  - `bitrateKbps` <- `${bitrateKbps}`
  - `lastHeartbeatTs` <- `${lastHeartbeatTs}`

## Important limits

This solution is **preview-only**:

- no control topic
- no RPC mapping
- no PTZ
- no ONVIF
- no vendor cloud account dependency
- video stream does not pass through Gateway

