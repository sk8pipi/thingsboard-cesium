import { computed, onBeforeUnmount, onMounted, ref } from 'vue';
import { getAttributes, getLatestTimeseries, type TsKvEntity, type kvEntity } from '/@/api/tb/telemetry';
import { EntityType } from '/@/enums/entityTypeEnum';
import { TbWsTelemetryClient } from './tbWsTelemetry';
import {
  CAMERA_ATTRIBUTE_KEYS,
  CAMERA_TELEMETRY_KEYS,
  buildCameraPoint,
  resolveCameraStatus,
  toCameraAlarmLevel,
  toCameraAlarmStatus,
  type CameraPoint,
  type PreviewCameraAttributes,
  type PreviewCameraTelemetry,
} from './cameraTypes';
import { normalizeSupportedRpcMethods } from './services/cameraRpcCapabilities';
import { loadCameraPoints } from './services/cameraDeviceService';

type CameraAttributeState = Partial<PreviewCameraAttributes>;
type CameraTelemetryState = Partial<PreviewCameraTelemetry>;

type CameraLocalUiState = {
  playerError?: string;
  previewOpenCount?: number;
  previewLastOpenTs?: number;
};

const UUID_REGEXP = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function toNumber(value: unknown, fallback?: number) {
  const next = Number(value);
  return Number.isFinite(next) ? next : fallback;
}

function toBoolean(value: unknown, fallback = false) {
  if (typeof value === 'boolean') return value;
  if (typeof value === 'number') return value !== 0;
  if (typeof value === 'string') {
    const normalized = value.trim().toLowerCase();
    if (['true', '1', 'yes', 'online', 'ok'].includes(normalized)) return true;
    if (['false', '0', 'no', 'offline'].includes(normalized)) return false;
  }
  return fallback;
}

function toOptionalBoolean(value: unknown) {
  if (value === undefined || value === null || value === '') return undefined;
  return toBoolean(value, false);
}

function toStringValue(value: unknown, fallback = '') {
  if (value === null || value === undefined) return fallback;
  return String(value);
}

function isValidTbEntityId(value?: string): value is string {
  if (!value) return false;
  return UUID_REGEXP.test(value.trim());
}

function extractLastValue(input: any): any {
  if (input === undefined || input === null) return undefined;

  if (Array.isArray(input) && input.length >= 2 && !Array.isArray(input[0])) {
    return input[1];
  }

  if (Array.isArray(input) && input.length) {
    const last = input[input.length - 1];

    if (Array.isArray(last) && last.length >= 2) {
      return last[1];
    }

    if (typeof last === 'object' && last) {
      if ('value' in last) return (last as any).value;
      if ('latestValue' in last) return (last as any).latestValue;
      if ('v' in last) return (last as any).v;
      if ('y' in last) return (last as any).y;
      if ('data' in last) return extractLastValue((last as any).data);
    }

    return last;
  }

  if (typeof input === 'object' && input) {
    if ('value' in input) return (input as any).value;
    if ('latestValue' in input) return (input as any).latestValue;
    if ('v' in input) return (input as any).v;
    if ('y' in input) return (input as any).y;
    if ('data' in input) return extractLastValue((input as any).data);
  }

  return input;
}

function attributesArrayToObject(list: kvEntity[]) {
  return (list || []).reduce<Record<string, unknown>>((acc, item) => {
    const key = String(item?.key || '');
    if (!key) return acc;
    acc[key] = item?.value;
    return acc;
  }, {});
}

function latestTimeseriesToObject(input: TsKvEntity | Record<string, any>) {
  return CAMERA_TELEMETRY_KEYS.reduce<Record<string, unknown>>((acc, key) => {
    const raw = (input as any)?.[key];
    const value = extractLastValue(raw);
    if (value !== undefined) {
      acc[key] = value;
    }
    return acc;
  }, {});
}

function normalizeAttributeState(raw: Record<string, unknown>): CameraAttributeState {
  const longitude = toNumber(raw.longitude ?? raw.lng);
  const latitude = toNumber(raw.latitude ?? raw.lat);
  const height = toNumber(raw.height ?? raw.alt);
  const cameraCode = toStringValue(raw.cameraCode || raw.cameraId);
  const cameraName = toStringValue(raw.cameraName || raw.name);

  return {
    deviceId: toStringValue(raw.deviceId),
    entityId: toStringValue(raw.entityId),
    cameraId: cameraCode,
    cameraCode,
    cameraName,
    name: cameraName,
    deviceName: toStringValue(raw.deviceName || raw.cameraName || raw.name),
    manufacturer: toStringValue(raw.manufacturer),
    model: toStringValue(raw.model),
    ip: toStringValue(raw.ip),
    longitude,
    latitude,
    height,
    altitude: height,
    lng: longitude,
    lat: latitude,
    alt: height,
    rtspUrl: toStringValue(raw.rtspUrl),
    hlsUrl: toStringValue(raw.hlsUrl || raw.streamUrlMain),
    webRtcUrl: toStringValue(raw.webRtcUrl),
    flvUrl: toStringValue(raw.flvUrl),
    streamType: (raw.streamType as CameraPoint['protocol']) || undefined,
    streamUrlMain: toStringValue(raw.streamUrlMain || raw.hlsUrl),
    streamUrlSub: toStringValue(raw.streamUrlSub),
    supportsLive: toOptionalBoolean(raw.supportsLive),
    supportsPlayback: toOptionalBoolean(raw.supportsPlayback),
    supportsPtz: toOptionalBoolean(raw.supportsPtz),
    supportsZoom: toOptionalBoolean(raw.supportsZoom),
    supportsPreset: toOptionalBoolean(raw.supportsPreset),
    supportsAudio: toOptionalBoolean(raw.supportsAudio),
    controlMode: toStringValue(raw.controlMode) as CameraPoint['controlMode'],
    supportedRpcMethods: normalizeSupportedRpcMethods(raw.supportedRpcMethods),
    customerId: toStringValue(raw.customerId),
    siteId: toStringValue(raw.siteId),
    locationText: toStringValue(raw.locationText),
    posterUrl: toStringValue(raw.posterUrl),
    description: toStringValue(raw.description),
    previewOnly: toBoolean(raw.previewOnly, true) ? true : undefined,
  };
}

function normalizeTelemetryState(raw: Record<string, unknown>): CameraTelemetryState {
  return {
    online: toOptionalBoolean(raw.online),
    streamOnline: toOptionalBoolean(raw.streamOnline ?? raw.streamAlive),
    streamAlive: toOptionalBoolean(raw.streamAlive ?? raw.streamOnline),
    fps: toNumber(raw.fps),
    bitrate: toNumber(raw.bitrate ?? raw.bitrateKbps),
    bitrateKbps: toNumber(raw.bitrateKbps ?? raw.bitrate),
    delayMs: toNumber(raw.delayMs),
    lastHeartbeatTs: toNumber(raw.lastHeartbeatTs),
    playerError: toStringValue(raw.playerError),
    previewOpenCount: toNumber(raw.previewOpenCount),
    previewLastOpenTs: toNumber(raw.previewLastOpenTs),
    alarmText: toStringValue(raw.alarmText),
    alarmStatus: toCameraAlarmStatus(raw.alarmStatus),
    alarmLevel: toCameraAlarmLevel(raw.alarmLevel || raw.alarmStatus),
    videoLoss: toOptionalBoolean(raw.videoLoss),
    motionDetected: toOptionalBoolean(raw.motionDetected),
    tamperAlarm: toOptionalBoolean(raw.tamperAlarm),
  };
}

function mergeCameraPoint(
  seedCamera: CameraPoint,
  attrs?: CameraAttributeState,
  telemetry?: CameraTelemetryState,
  localUi?: CameraLocalUiState,
): CameraPoint {
  const online = telemetry?.online ?? seedCamera.online ?? false;
  const streamOnline =
    telemetry?.streamOnline ?? telemetry?.streamAlive ?? seedCamera.streamOnline ?? seedCamera.streamAlive ?? online;
  const streamAlive = telemetry?.streamAlive ?? streamOnline;
  const alarmStatus = telemetry?.alarmStatus ?? seedCamera.alarmStatus ?? 'normal';
  const alarmLevel = telemetry?.alarmLevel ?? seedCamera.alarmLevel ?? toCameraAlarmLevel(alarmStatus);
  const playerError =
    localUi?.playerError !== undefined ? localUi.playerError : (telemetry?.playerError ?? seedCamera.playerError ?? '');
  const previewOpenCount = localUi?.previewOpenCount ?? telemetry?.previewOpenCount ?? seedCamera.previewOpenCount ?? 0;
  const previewLastOpenTs =
    localUi?.previewLastOpenTs ?? telemetry?.previewLastOpenTs ?? seedCamera.previewLastOpenTs ?? 0;

  const hasTbAttrs = Boolean(attrs && Object.values(attrs).some((value) => value !== undefined && value !== ''));
  const hasTbTelemetry = Boolean(
    telemetry && Object.values(telemetry).some((value) => value !== undefined && value !== ''),
  );

  const cameraCode = attrs?.cameraCode || attrs?.cameraId || seedCamera.cameraCode || seedCamera.id;
  const cameraName = attrs?.cameraName || attrs?.name || seedCamera.cameraName || seedCamera.name;
  const hlsUrl = attrs?.hlsUrl || attrs?.streamUrlMain || seedCamera.hlsUrl || seedCamera.streamUrl;

  return buildCameraPoint({
    ...seedCamera,
    ...attrs,
    ...telemetry,
    id: cameraCode,
    deviceId: seedCamera.deviceId,
    entityId: seedCamera.entityId,
    cameraId: cameraCode,
    cameraCode,
    cameraName,
    name: cameraName,
    deviceName: attrs?.deviceName || seedCamera.deviceName || cameraName,
    longitude: attrs?.longitude ?? attrs?.lng ?? seedCamera.longitude,
    latitude: attrs?.latitude ?? attrs?.lat ?? seedCamera.latitude,
    height: attrs?.height ?? attrs?.alt ?? seedCamera.height ?? seedCamera.altitude,
    altitude: attrs?.altitude ?? attrs?.height ?? attrs?.alt ?? seedCamera.altitude ?? seedCamera.height,
    lng: attrs?.lng ?? attrs?.longitude ?? seedCamera.lng ?? seedCamera.longitude,
    lat: attrs?.lat ?? attrs?.latitude ?? seedCamera.lat ?? seedCamera.latitude,
    alt: attrs?.alt ?? attrs?.height ?? attrs?.altitude ?? seedCamera.alt ?? seedCamera.altitude,
    rtspUrl: attrs?.rtspUrl || seedCamera.rtspUrl,
    hlsUrl,
    webRtcUrl: attrs?.webRtcUrl || seedCamera.webRtcUrl,
    flvUrl: attrs?.flvUrl || seedCamera.flvUrl,
    streamUrl: hlsUrl || seedCamera.streamUrl,
    streamUrlMain: attrs?.streamUrlMain || hlsUrl || seedCamera.streamUrlMain || seedCamera.streamUrl,
    streamUrlSub: attrs?.streamUrlSub || seedCamera.streamUrlSub,
    protocol: (attrs?.streamType || seedCamera.protocol || 'hls') as CameraPoint['protocol'],
    streamType: (attrs?.streamType || seedCamera.streamType || seedCamera.protocol || 'hls') as CameraPoint['protocol'],
    online,
    streamOnline,
    streamAlive,
    fps: telemetry?.fps ?? seedCamera.fps ?? 0,
    bitrate: telemetry?.bitrate ?? telemetry?.bitrateKbps ?? seedCamera.bitrate ?? seedCamera.bitrateKbps ?? 0,
    bitrateKbps: telemetry?.bitrateKbps ?? telemetry?.bitrate ?? seedCamera.bitrateKbps ?? seedCamera.bitrate ?? 0,
    delayMs: telemetry?.delayMs ?? seedCamera.delayMs ?? 0,
    lastHeartbeatTs: telemetry?.lastHeartbeatTs ?? seedCamera.lastHeartbeatTs ?? 0,
    playerError,
    previewOpenCount,
    previewLastOpenTs,
    alarmText: telemetry?.alarmText ?? seedCamera.alarmText ?? '',
    alarmStatus,
    alarmLevel,
    videoLoss: telemetry?.videoLoss ?? seedCamera.videoLoss ?? false,
    motionDetected: telemetry?.motionDetected ?? seedCamera.motionDetected ?? false,
    tamperAlarm: telemetry?.tamperAlarm ?? seedCamera.tamperAlarm ?? false,
    status: resolveCameraStatus({
      online,
      streamOnline,
      streamAlive,
      alarmLevel,
    }),
    dataSource: hasTbAttrs || hasTbTelemetry ? 'merged' : seedCamera.dataSource || 'mock',
  });
}

export function useTbCameraRuntime() {
  const seedCameras = ref<CameraPoint[]>([]);
  const attributeMap = ref<Record<string, CameraAttributeState>>({});
  const telemetryMap = ref<Record<string, CameraTelemetryState>>({});
  const localUiMap = ref<Record<string, CameraLocalUiState>>({});
  const loading = ref(false);
  const runtimeError = ref('');

  const token = localStorage.getItem('jwt_token') || '';
  const wsClient = new TbWsTelemetryClient(token);
  const subCmdMap = new Map<string, number>();
  let wsConnected = false;

  const cameraPoints = computed(() =>
    seedCameras.value.map((seedCamera) =>
      mergeCameraPoint(
        seedCamera,
        seedCamera.deviceId ? attributeMap.value[seedCamera.deviceId] : undefined,
        seedCamera.deviceId ? telemetryMap.value[seedCamera.deviceId] : undefined,
        localUiMap.value[seedCamera.id],
      ),
    ),
  );

  function updateTelemetry(deviceId: string, patch: CameraTelemetryState) {
    telemetryMap.value = {
      ...telemetryMap.value,
      [deviceId]: {
        ...(telemetryMap.value[deviceId] || {}),
        ...patch,
      },
    };
  }

  async function loadSeedCameras() {
    seedCameras.value = await loadCameraPoints();
  }

  async function loadCameraAttributes(camera: CameraPoint) {
    if (!isValidTbEntityId(camera.deviceId)) return;
    const deviceId = camera.deviceId;

    const values = await getAttributes(
      { entityType: EntityType.DEVICE, id: deviceId } as any,
      CAMERA_ATTRIBUTE_KEYS.join(','),
    );

    attributeMap.value = {
      ...attributeMap.value,
      [deviceId]: normalizeAttributeState(attributesArrayToObject(values)),
    };
  }

  async function loadCameraTelemetry(camera: CameraPoint) {
    if (!isValidTbEntityId(camera.deviceId)) return;
    const deviceId = camera.deviceId;

    const values = await getLatestTimeseries(
      { entityType: EntityType.DEVICE, id: deviceId } as any,
      CAMERA_TELEMETRY_KEYS.join(','),
      true,
    );

    updateTelemetry(deviceId, normalizeTelemetryState(latestTimeseriesToObject(values)));
  }

  function subscribeCameraTelemetry(camera: CameraPoint) {
    if (!isValidTbEntityId(camera.deviceId)) return;
    const deviceId = camera.deviceId;
    if (subCmdMap.has(deviceId)) return;

    const cmdId = wsClient.subscribeLatest({
      entityType: EntityType.DEVICE,
      entityId: deviceId,
      keys: [...CAMERA_TELEMETRY_KEYS],
      onData: (payload: any) => {
        const root = payload?.data ?? payload?.latestValues ?? payload;
        updateTelemetry(deviceId, normalizeTelemetryState(latestTimeseriesToObject(root)));
      },
    });

    subCmdMap.set(deviceId, cmdId);
  }

  async function loadRuntime() {
    loading.value = true;
    runtimeError.value = '';

    try {
      await loadSeedCameras();
      if (wsConnected) {
        seedCameras.value.forEach((camera) => subscribeCameraTelemetry(camera));
      }

      await Promise.all(
        seedCameras.value.map(async (camera) => {
          if (!isValidTbEntityId(camera.deviceId)) {
            return;
          }

          try {
            await loadCameraAttributes(camera);
          } catch (error) {
            console.warn('[useTbCameraRuntime] load attributes failed:', camera.deviceId, error);
          }

          try {
            await loadCameraTelemetry(camera);
          } catch (error) {
            console.warn('[useTbCameraRuntime] load telemetry failed:', camera.deviceId, error);
          }
        }),
      );
    } catch (error: any) {
      runtimeError.value = error?.message || String(error);
    } finally {
      loading.value = false;
    }
  }

  function markPreviewOpened(cameraId: string) {
    const current = cameraPoints.value.find((camera) => camera.id === cameraId);
    const previous = localUiMap.value[cameraId];
    const nextPreviewOpenCount = Number(current?.previewOpenCount || 0) + 1;
    const nextPreviewLastOpenTs = Date.now();

    if (
      previous?.playerError === '' &&
      previous?.previewOpenCount === nextPreviewOpenCount &&
      previous?.previewLastOpenTs === nextPreviewLastOpenTs
    ) {
      return;
    }

    localUiMap.value = {
      ...localUiMap.value,
      [cameraId]: {
        ...(previous || {}),
        playerError: '',
        previewOpenCount: nextPreviewOpenCount,
        previewLastOpenTs: nextPreviewLastOpenTs,
      },
    };
  }

  function setCameraPlayerError(cameraId: string, message: string) {
    const previous = localUiMap.value[cameraId];
    if (previous?.playerError === message) {
      return;
    }

    localUiMap.value = {
      ...localUiMap.value,
      [cameraId]: {
        ...(previous || {}),
        playerError: message,
      },
    };
  }

  function clearCameraPlayerError(cameraId: string) {
    const previous = localUiMap.value[cameraId];
    if (!previous?.playerError) {
      return;
    }

    localUiMap.value = {
      ...localUiMap.value,
      [cameraId]: {
        ...(previous || {}),
        playerError: '',
      },
    };
  }

  onMounted(async () => {
    await loadRuntime();

    if (!token) {
      return;
    }

    wsClient.connect();
    wsConnected = true;
    seedCameras.value.forEach((camera) => subscribeCameraTelemetry(camera));
  });

  onBeforeUnmount(() => {
    subCmdMap.forEach((cmdId) => wsClient.unsubscribe(cmdId));
    subCmdMap.clear();
    wsClient.close();
    wsConnected = false;
  });

  return {
    cameraPoints,
    loading,
    runtimeError,
    markPreviewOpened,
    setCameraPlayerError,
    clearCameraPlayerError,
    refreshCameraRuntime: loadRuntime,
  };
}
