import os from 'node:os';
import path from 'node:path';
import type { CameraAdapterConfig } from './types.js';

function getEnvNumber(name: string, fallback: number) {
  const raw = process.env[name];
  if (!raw) return fallback;

  const value = Number(raw);
  return Number.isFinite(value) ? value : fallback;
}

function getEnvBoolean(name: string, fallback: boolean) {
  const raw = process.env[name];
  if (!raw) return fallback;

  return ['1', 'true', 'yes', 'on'].includes(raw.toLowerCase());
}

const defaultStreamRoot = path.join(os.homedir(), 'camera-streams', 'live', 'camera-001');

export const cameraAdapterConfig: CameraAdapterConfig = {
  mqtt: {
    brokerUrl: process.env.CAMERA_ADAPTER_MQTT_URL || 'mqtt://127.0.0.1:1883',
    username: process.env.CAMERA_ADAPTER_MQTT_USERNAME || '',
    password: process.env.CAMERA_ADAPTER_MQTT_PASSWORD || '',
    clientId: process.env.CAMERA_ADAPTER_CLIENT_ID || `preview-camera-adapter-${process.pid}`,
    topicPrefix: process.env.CAMERA_ADAPTER_TOPIC_PREFIX || 'camera',
    qos: Math.min(2, Math.max(0, getEnvNumber('CAMERA_ADAPTER_MQTT_QOS', 1))) as 0 | 1 | 2,
    retainMeta: getEnvBoolean('CAMERA_ADAPTER_RETAIN_META', true),
  },
  publishIntervalMs: getEnvNumber('CAMERA_ADAPTER_PUBLISH_INTERVAL_MS', 10000),
  cameras: [
    {
      cameraId: process.env.CAMERA_ADAPTER_CAMERA_ID || 'camera-001',
      name: process.env.CAMERA_ADAPTER_CAMERA_NAME || '北门摄像头',
      manufacturer: process.env.CAMERA_ADAPTER_CAMERA_MANUFACTURER || 'Unknown',
      model: process.env.CAMERA_ADAPTER_CAMERA_MODEL || 'PreviewOnlyCamera',
      ip: process.env.CAMERA_ADAPTER_CAMERA_IP || '192.168.31.100',
      lng: Number(process.env.CAMERA_ADAPTER_CAMERA_LNG || 127.00035),
      lat: Number(process.env.CAMERA_ADAPTER_CAMERA_LAT || 37.50016),
      alt: Number(process.env.CAMERA_ADAPTER_CAMERA_ALT || 6),
      customerId: process.env.CAMERA_ADAPTER_CUSTOMER_ID || 'customer-001',
      siteId: process.env.CAMERA_ADAPTER_SITE_ID || 'site-north-gate',
      streamType: 'hls',
      streamUrlMain: process.env.CAMERA_ADAPTER_STREAM_URL_MAIN || '/live/camera-001/index.m3u8',
      streamUrlSub: process.env.CAMERA_ADAPTER_STREAM_URL_SUB || '',
      previewOnly: true,
      hlsRootDir: process.env.CAMERA_ADAPTER_HLS_DIR || defaultStreamRoot,
      streamAliveThresholdMs: getEnvNumber('CAMERA_ADAPTER_STREAM_ALIVE_THRESHOLD_MS', 15000),
      normalBitrateKbps: getEnvNumber('CAMERA_ADAPTER_NORMAL_BITRATE_KBPS', 2048),
      defaultAlarmText: process.env.CAMERA_ADAPTER_DEFAULT_ALARM_TEXT || '',
      defaultAlarmLevel: (process.env.CAMERA_ADAPTER_DEFAULT_ALARM_LEVEL as any) || 'none',
    },
  ],
};

