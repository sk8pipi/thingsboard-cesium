import fs from 'node:fs/promises';
import path from 'node:path';
import mqtt from 'mqtt';
import { cameraAdapterConfig } from './config.js';
import type {
  CameraAdapterCameraConfig,
  PreviewCameraHealthPayload,
  PreviewCameraStatePayload,
} from './types.js';

type StreamProbeResult = {
  playlistExists: boolean;
  latestActivityTs: number;
  latestSegmentName: string;
  streamAlive: boolean;
};

const { mqtt: mqttConfig, cameras, publishIntervalMs } = cameraAdapterConfig;

function buildTopic(cameraId: string, suffix: 'meta' | 'state' | 'health') {
  return `${mqttConfig.topicPrefix}/${cameraId}/${suffix}`;
}

async function fileExists(filePath: string) {
  try {
    await fs.access(filePath);
    return true;
  } catch {
    return false;
  }
}

async function getLatestSegmentMtimeMs(hlsRootDir: string) {
  const entries = await fs.readdir(hlsRootDir, { withFileTypes: true });
  const segmentFiles = entries
    .filter((entry) => entry.isFile() && /\.(ts|m4s)$/i.test(entry.name))
    .map((entry) => entry.name);

  if (!segmentFiles.length) {
    return { latestActivityTs: 0, latestSegmentName: '' };
  }

  let latestActivityTs = 0;
  let latestSegmentName = '';

  for (const fileName of segmentFiles) {
    const fullPath = path.join(hlsRootDir, fileName);
    const stats = await fs.stat(fullPath);
    if (stats.mtimeMs > latestActivityTs) {
      latestActivityTs = stats.mtimeMs;
      latestSegmentName = fileName;
    }
  }

  return { latestActivityTs, latestSegmentName };
}

async function probeStream(camera: CameraAdapterCameraConfig): Promise<StreamProbeResult> {
  const playlistPath = path.join(camera.hlsRootDir, 'index.m3u8');
  const playlistExists = await fileExists(playlistPath);

  if (!playlistExists) {
    return {
      playlistExists: false,
      latestActivityTs: 0,
      latestSegmentName: '',
      streamAlive: false,
    };
  }

  let latestActivityTs = 0;
  let latestSegmentName = '';

  try {
    const latestSegment = await getLatestSegmentMtimeMs(camera.hlsRootDir);
    latestActivityTs = latestSegment.latestActivityTs;
    latestSegmentName = latestSegment.latestSegmentName;
  } catch (error) {
    console.warn(`[camera-adapter] Failed to scan HLS directory: ${camera.hlsRootDir}`, error);
  }

  if (!latestActivityTs) {
    try {
      const playlistStats = await fs.stat(playlistPath);
      latestActivityTs = playlistStats.mtimeMs;
    } catch {
      latestActivityTs = 0;
    }
  }

  const streamAlive =
    latestActivityTs > 0 && Date.now() - latestActivityTs <= camera.streamAliveThresholdMs;

  return {
    playlistExists,
    latestActivityTs,
    latestSegmentName,
    streamAlive,
  };
}

function buildHealthPayload(
  camera: CameraAdapterCameraConfig,
  probe: StreamProbeResult,
): PreviewCameraHealthPayload {
  const ts = Date.now();
  const online = probe.playlistExists;

  return {
    cameraId: camera.cameraId,
    online,
    streamAlive: probe.streamAlive,
    bitrateKbps: probe.streamAlive ? camera.normalBitrateKbps : 0,
    lastHeartbeatTs: probe.latestActivityTs || ts,
    ts,
  };
}

function buildStatePayload(
  camera: CameraAdapterCameraConfig,
  health: PreviewCameraHealthPayload,
): PreviewCameraStatePayload {
  const ts = Date.now();

  let alarmText = camera.defaultAlarmText || '';
  let alarmLevel = camera.defaultAlarmLevel || 'none';

  if (!health.online) {
    alarmText = 'HLS playlist missing';
    alarmLevel = 'critical';
  } else if (!health.streamAlive) {
    alarmText = 'HLS segment update timeout';
    alarmLevel = 'warning';
  }

  return {
    cameraId: camera.cameraId,
    online: health.online,
    playerError: '',
    previewOpenCount: 0,
    previewLastOpenTs: 0,
    alarmText,
    alarmLevel,
    ts,
  };
}

async function publishMeta(client: mqtt.MqttClient, camera: CameraAdapterCameraConfig) {
  const payload = JSON.stringify({
    cameraId: camera.cameraId,
    name: camera.name,
    manufacturer: camera.manufacturer,
    model: camera.model,
    ip: camera.ip,
    lng: camera.lng,
    lat: camera.lat,
    alt: camera.alt,
    customerId: camera.customerId,
    siteId: camera.siteId,
    streamType: camera.streamType,
    streamUrlMain: camera.streamUrlMain,
    streamUrlSub: camera.streamUrlSub,
    previewOnly: true,
  });

  await publish(client, buildTopic(camera.cameraId, 'meta'), payload, mqttConfig.retainMeta);
}

async function publishCameraState(client: mqtt.MqttClient, camera: CameraAdapterCameraConfig) {
  const probe = await probeStream(camera);
  const health = buildHealthPayload(camera, probe);
  const state = buildStatePayload(camera, health);

  await publish(client, buildTopic(camera.cameraId, 'health'), JSON.stringify(health), false);
  await publish(client, buildTopic(camera.cameraId, 'state'), JSON.stringify(state), false);

  console.log(
    `[camera-adapter] published camera=${camera.cameraId} online=${health.online} streamAlive=${health.streamAlive} latestSegment=${probe.latestSegmentName || 'none'}`,
  );
}

function publish(client: mqtt.MqttClient, topic: string, payload: string, retain: boolean) {
  return new Promise<void>((resolve, reject) => {
    client.publish(
      topic,
      payload,
      {
        qos: mqttConfig.qos,
        retain,
      },
      (error) => {
        if (error) {
          reject(error);
          return;
        }

        resolve();
      },
    );
  });
}

async function runPublishCycle(client: mqtt.MqttClient) {
  for (const camera of cameras) {
    await publishCameraState(client, camera);
  }
}

async function bootstrap() {
  const client = mqtt.connect(mqttConfig.brokerUrl, {
    clientId: mqttConfig.clientId,
    username: mqttConfig.username || undefined,
    password: mqttConfig.password || undefined,
    reconnectPeriod: 3000,
  });

  let timer: NodeJS.Timeout | null = null;

  client.on('connect', async () => {
    console.log(`[camera-adapter] connected to MQTT broker: ${mqttConfig.brokerUrl}`);

    try {
      for (const camera of cameras) {
        await publishMeta(client, camera);
      }

      await runPublishCycle(client);

      if (timer) {
        clearInterval(timer);
      }

      timer = setInterval(() => {
        void runPublishCycle(client).catch((error) => {
          console.error('[camera-adapter] publish cycle failed', error);
        });
      }, publishIntervalMs);
    } catch (error) {
      console.error('[camera-adapter] initial publish failed', error);
    }
  });

  client.on('reconnect', () => {
    console.log('[camera-adapter] reconnecting...');
  });

  client.on('error', (error) => {
    console.error('[camera-adapter] MQTT error', error);
  });

  const shutdown = () => {
    if (timer) {
      clearInterval(timer);
      timer = null;
    }

    client.end(true, () => {
      console.log('[camera-adapter] stopped');
      process.exit(0);
    });
  };

  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);
}

void bootstrap();

