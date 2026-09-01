<template>
  <div class="camera-video-operations">
    <section class="camera-video-operations__section">
      <div class="camera-video-operations__section-header">
        <span>媒体状态与截图</span>
        <div class="camera-video-operations__actions">
          <button type="button" :disabled="statusLoading" @click="refreshStatus">刷新状态</button>
          <button type="button" :disabled="snapshotLoading" @click="refreshSnapshot">刷新截图</button>
        </div>
      </div>

      <div class="camera-video-operations__status-grid">
        <span>流状态：{{ status?.status || '-' }}</span>
        <span>媒体在线：{{ status ? booleanText(status.online) : '-' }}</span>
        <span>观看数：{{ status?.readerCount ?? '-' }}</span>
        <span>活动会话：{{ status?.activeSessions ?? '-' }}</span>
        <span class="camera-video-operations__wide">更新时间：{{ formatTime(status?.updatedAt) }}</span>
      </div>
      <div v-if="statusError" class="camera-video-operations__message camera-video-operations__message--error">
        {{ statusError }}
      </div>

      <div class="camera-video-operations__snapshot">
        <img v-if="snapshotUrl" :src="snapshotUrl" alt="摄像头最新截图" />
        <span v-else>{{ snapshotLoading ? '正在获取截图...' : snapshotError || '暂无截图' }}</span>
      </div>
    </section>

    <section v-if="showPtz" class="camera-video-operations__section">
      <div class="camera-video-operations__section-header">
        <span>PTZ 控制</span>
        <label class="camera-video-operations__inline-field">
          速度
          <input v-model.number="ptzSpeed" type="number" min="1" max="100" />
        </label>
      </div>

      <div v-if="supportsPtz" class="camera-video-operations__ptz-grid">
        <span></span>
        <button type="button" :disabled="ptzLoading" @click="sendPtz('ptz.up')">上</button>
        <span></span>
        <button type="button" :disabled="ptzLoading" @click="sendPtz('ptz.left')">左</button>
        <button type="button" :disabled="ptzLoading" @click="sendPtz('ptz.stop')">停</button>
        <button type="button" :disabled="ptzLoading" @click="sendPtz('ptz.right')">右</button>
        <span></span>
        <button type="button" :disabled="ptzLoading" @click="sendPtz('ptz.down')">下</button>
        <span></span>
      </div>

      <div v-if="supportsZoom" class="camera-video-operations__actions">
        <button type="button" :disabled="ptzLoading" @click="sendPtz('zoom.in')">放大</button>
        <button type="button" :disabled="ptzLoading" @click="sendPtz('zoom.out')">缩小</button>
      </div>

      <div v-if="supportsPreset" class="camera-video-operations__preset">
        <label class="camera-video-operations__inline-field">
          预置位
          <input v-model.number="presetId" type="number" min="1" max="255" />
        </label>
        <button type="button" :disabled="ptzLoading" @click="sendPtz('preset.call')">调用</button>
        <button type="button" :disabled="ptzLoading" @click="sendPtz('preset.save')">保存</button>
        <button type="button" :disabled="ptzLoading" @click="sendPtz('preset.delete')">删除</button>
      </div>
      <div v-if="ptzMessage" class="camera-video-operations__message">{{ ptzMessage }}</div>
    </section>

    <section v-if="playbackAvailable" class="camera-video-operations__section">
      <div class="camera-video-operations__section-header">
        <span>录像检索与回放</span>
        <button type="button" :disabled="recordingsLoading" @click="queryRecordings">查询录像</button>
      </div>

      <div class="camera-video-operations__time-range">
        <label>
          开始时间
          <input v-model="recordingStart" type="datetime-local" />
        </label>
        <label>
          结束时间
          <input v-model="recordingEnd" type="datetime-local" />
        </label>
      </div>

      <div v-if="recordingsError" class="camera-video-operations__message camera-video-operations__message--error">
        {{ recordingsError }}
      </div>
      <div v-else-if="!recordingsLoading && recordings.length === 0" class="camera-video-operations__message">
        当前时间范围没有录像
      </div>

      <div v-if="recordings.length" class="camera-video-operations__recordings">
        <button
          v-for="recording in recordings"
          :key="recording.recordingId"
          type="button"
          :disabled="recordingPlaying"
          @click="playRecording(recording)"
        >
          <span>{{ formatTime(recording.startTime) }} - {{ formatTime(recording.endTime) }}</span>
          <span>{{ formatDuration(recording.durationMs) }} / {{ formatFileSize(recording.fileSize) }}</span>
        </button>
      </div>

      <div v-if="activeRecordingSession" class="camera-video-operations__playback">
        <video ref="recordingVideoEl" controls autoplay muted playsinline></video>
        <div class="camera-video-operations__actions">
          <button type="button" :disabled="recordingControlLoading" @click="controlRecording('pause')">暂停</button>
          <button type="button" :disabled="recordingControlLoading" @click="controlRecording('resume')">恢复</button>
          <label class="camera-video-operations__inline-field">
            倍速
            <select v-model.number="recordingSpeed" :disabled="recordingControlLoading" @change="changeRecordingSpeed">
              <option v-for="speed in recordingSpeeds" :key="speed" :value="speed">{{ speed }}x</option>
            </select>
          </label>
          <label class="camera-video-operations__inline-field">
            定位秒数
            <input v-model.number="seekPositionSeconds" type="number" min="0" />
          </label>
          <button type="button" :disabled="recordingControlLoading" @click="seekRecording">定位</button>
          <button type="button" :disabled="recordingControlLoading" @click="stopRecording">停止回放</button>
        </div>
        <div v-if="recordingMessage" class="camera-video-operations__message">{{ recordingMessage }}</div>
      </div>
    </section>
  </div>
</template>

<script setup lang="ts">
  import { computed, nextTick, onBeforeUnmount, ref, watch } from 'vue';
  import Hls from 'hls.js';
  import {
    controlVideoPtz,
    controlVideoRecordingPlayback,
    getVideoCameraStatus,
    getVideoRecordings,
    getVideoSnapshot,
    startVideoRecordingPlayback,
    type VideoCameraStatus,
    type VideoPtzCommand,
    type VideoRecordingControlAction,
    type VideoRecordingItem,
  } from '/@/api/tb/video';
  import { useMessage } from '/@/hooks/web/useMessage';
  import {
    releaseCameraRecordingSession,
    type CameraRecordingSession,
  } from '../services/cameraRecordingSessionService';

  const props = defineProps<{
    visible: boolean;
    tbDeviceId?: string;
    supportsPtz?: boolean;
    supportsZoom?: boolean;
    supportsPreset?: boolean;
    supportsPlayback?: boolean;
  }>();

  const { showMessage } = useMessage();
  const status = ref<VideoCameraStatus | null>(null);
  const statusLoading = ref(false);
  const statusError = ref('');
  const snapshotLoading = ref(false);
  const snapshotError = ref('');
  const snapshotUrl = ref('');
  const ptzLoading = ref(false);
  const ptzMessage = ref('');
  const ptzSpeed = ref(50);
  const presetId = ref(1);
  const recordingsLoading = ref(false);
  const recordingsError = ref('');
  const recordings = ref<VideoRecordingItem[]>([]);
  const recordingPlaying = ref(false);
  const recordingControlLoading = ref(false);
  const recordingMessage = ref('');
  const recordingVideoEl = ref<HTMLVideoElement | null>(null);
  const recordingSpeed = ref(1);
  const seekPositionSeconds = ref(0);
  const recordingSpeeds = [0.25, 0.5, 1, 2, 4, 8];
  const recordingStart = ref(toLocalDateTimeValue(Date.now() - 24 * 60 * 60 * 1000));
  const recordingEnd = ref(toLocalDateTimeValue(Date.now()));
  const activeRecordingSession = ref<CameraRecordingSession | null>(null);

  let statusTimer: number | undefined;
  let statusRequestId = 0;
  let snapshotRequestId = 0;
  let ptzRequestId = 0;
  let recordingsRequestId = 0;
  let recordingRequestId = 0;
  let recordingControlRequestId = 0;
  let recordingHls: Hls | null = null;

  const normalizedDeviceId = computed(() => String(props.tbDeviceId || '').trim());
  const showPtz = computed(() => props.supportsPtz || props.supportsZoom || props.supportsPreset);
  const playbackAvailable = computed(() => props.supportsPlayback === true);

  function booleanText(value?: boolean) {
    if (value === undefined) return '-';
    return value ? '是' : '否';
  }

  function formatTime(value?: number) {
    return value ? new Date(value).toLocaleString() : '-';
  }

  function formatDuration(value: number) {
    if (!Number.isFinite(value)) return '-';
    const seconds = Math.max(0, Math.round(value / 1000));
    const minutes = Math.floor(seconds / 60);
    return minutes ? String(minutes) + ' 分 ' + String(seconds % 60) + ' 秒' : String(seconds) + ' 秒';
  }

  function formatFileSize(value?: number) {
    if (value === undefined || !Number.isFinite(value)) return '大小未知';
    if (value < 1024 * 1024) return (value / 1024).toFixed(1) + ' KB';
    return (value / 1024 / 1024).toFixed(1) + ' MB';
  }

  function toLocalDateTimeValue(value: number) {
    const date = new Date(value);
    const localDate = new Date(value - date.getTimezoneOffset() * 60_000);
    return localDate.toISOString().slice(0, 16);
  }

  function parseDateTime(value: string) {
    const timestamp = new Date(value).getTime();
    return Number.isFinite(timestamp) ? timestamp : 0;
  }

  function errorMessage(error: any, fallback: string) {
    return error?.message || error?.response?.data?.message || fallback;
  }

  function normalizePlaybackUrl(rawUrl?: string) {
    const value = String(rawUrl || '').trim();
    if (!value) return '';
    try {
      const parsed = new URL(value, window.location.origin);
      if (parsed.origin !== window.location.origin || !parsed.pathname.startsWith('/video-stream/')) return '';
      return `${parsed.pathname}${parsed.search}${parsed.hash}`;
    } catch {
      return '';
    }
  }

  async function refreshStatus() {
    const deviceId = normalizedDeviceId.value;
    if (!props.visible || !deviceId || statusLoading.value) return;

    const requestId = ++statusRequestId;
    statusLoading.value = true;
    statusError.value = '';
    try {
      const result = await getVideoCameraStatus(deviceId);
      if (requestId !== statusRequestId || deviceId !== normalizedDeviceId.value || !props.visible) return;
      status.value = result;
    } catch (error) {
      if (requestId === statusRequestId && deviceId === normalizedDeviceId.value && props.visible) {
        statusError.value = errorMessage(error, '获取视频流状态失败');
      }
    } finally {
      if (requestId === statusRequestId) {
        statusLoading.value = false;
      }
    }
  }

  function revokeSnapshotUrl() {
    if (!snapshotUrl.value) return;
    URL.revokeObjectURL(snapshotUrl.value);
    snapshotUrl.value = '';
  }

  async function refreshSnapshot() {
    const deviceId = normalizedDeviceId.value;
    if (!props.visible || !deviceId || snapshotLoading.value) return;

    const requestId = ++snapshotRequestId;
    snapshotLoading.value = true;
    snapshotError.value = '';
    try {
      const blob = await getVideoSnapshot(deviceId);
      if (requestId !== snapshotRequestId || deviceId !== normalizedDeviceId.value || !props.visible) return;
      if (!(blob instanceof Blob)) throw new Error('截图响应格式无效');
      revokeSnapshotUrl();
      snapshotUrl.value = URL.createObjectURL(blob);
    } catch (error) {
      if (requestId === snapshotRequestId && deviceId === normalizedDeviceId.value && props.visible) {
        snapshotError.value = errorMessage(error, '获取摄像头截图失败');
      }
    } finally {
      if (requestId === snapshotRequestId) {
        snapshotLoading.value = false;
      }
    }
  }

  function normalizedSpeed() {
    return Math.min(100, Math.max(1, Math.round(Number(ptzSpeed.value) || 50)));
  }

  async function sendPtz(command: VideoPtzCommand) {
    const deviceId = normalizedDeviceId.value;
    if (!deviceId || ptzLoading.value) return;

    const requestId = ++ptzRequestId;
    const isPreset = command.startsWith('preset.');
    const normalizedPresetId = Math.min(255, Math.max(1, Math.round(Number(presetId.value) || 1)));
    ptzLoading.value = true;
    ptzMessage.value = '正在发送 ' + command;
    try {
      const result = await controlVideoPtz(deviceId, {
        command,
        speed: normalizedSpeed(),
        durationMs: command === 'ptz.stop' || isPreset ? undefined : 500,
        presetId: isPreset ? normalizedPresetId : undefined,
      });
      if (requestId !== ptzRequestId || deviceId !== normalizedDeviceId.value || !props.visible) return;
      ptzMessage.value = result.accepted ? '控制命令已接收：' + command : '控制命令未被接收：' + command;
    } catch (error) {
      if (requestId === ptzRequestId && deviceId === normalizedDeviceId.value && props.visible) {
        ptzMessage.value = errorMessage(error, 'PTZ 控制失败');
        showMessage(ptzMessage.value, 'error');
      }
    } finally {
      if (requestId === ptzRequestId) {
        ptzLoading.value = false;
      }
    }
  }

  async function queryRecordings() {
    const deviceId = normalizedDeviceId.value;
    const startTime = parseDateTime(recordingStart.value);
    const endTime = parseDateTime(recordingEnd.value);
    if (!deviceId || recordingsLoading.value) return;
    if (!startTime || !endTime || startTime >= endTime) {
      recordingsError.value = '请选择有效的录像起止时间';
      return;
    }

    const requestId = ++recordingsRequestId;
    recordingsLoading.value = true;
    recordingsError.value = '';
    try {
      const result = await getVideoRecordings(deviceId, startTime, endTime);
      if (requestId !== recordingsRequestId || deviceId !== normalizedDeviceId.value || !props.visible) return;
      recordings.value = result.recordings || [];
    } catch (error) {
      if (requestId === recordingsRequestId && deviceId === normalizedDeviceId.value && props.visible) {
        recordings.value = [];
        recordingsError.value = errorMessage(error, '查询录像失败');
      }
    } finally {
      if (requestId === recordingsRequestId) {
        recordingsLoading.value = false;
      }
    }
  }

  function destroyRecordingPlayer() {
    if (recordingHls) {
      recordingHls.destroy();
      recordingHls = null;
    }
    const video = recordingVideoEl.value;
    if (video) {
      video.pause();
      video.removeAttribute('src');
      video.load();
    }
  }

  async function initRecordingPlayer(url: string) {
    const video = recordingVideoEl.value;
    if (!video) return;
    destroyRecordingPlayer();

    if (Hls.isSupported()) {
      recordingHls = new Hls({ enableWorker: true, backBufferLength: 30 });
      recordingHls.attachMedia(video);
      recordingHls.on(Hls.Events.MEDIA_ATTACHED, () => recordingHls?.loadSource(url));
      recordingHls.on(Hls.Events.MANIFEST_PARSED, () => {
        void video.play().catch(() => {
          recordingMessage.value = '录像流自动播放失败';
          void releaseActiveRecording();
        });
      });
      recordingHls.on(Hls.Events.ERROR, (_event, data) => {
        if (!data.fatal) return;
        recordingMessage.value = '录像流加载失败';
        void releaseActiveRecording();
      });
      return;
    }

    if (video.canPlayType('application/vnd.apple.mpegurl')) {
      video.src = url;
      await video.play();
      return;
    }
    await releaseActiveRecording();
    recordingMessage.value = '当前浏览器不支持 HLS 录像回放';
  }

  async function releaseActiveRecording() {
    const session = activeRecordingSession.value;
    activeRecordingSession.value = null;
    destroyRecordingPlayer();
    if (session) {
      await releaseCameraRecordingSession(session);
    }
  }

  async function playRecording(recording: VideoRecordingItem) {
    const deviceId = normalizedDeviceId.value;
    if (!deviceId || recordingPlaying.value) return;

    const requestId = ++recordingRequestId;
    ++recordingControlRequestId;
    recordingControlLoading.value = false;
    recordingPlaying.value = true;
    recordingMessage.value = '';
    await releaseActiveRecording();
    let session: CameraRecordingSession | null = null;
    try {
      const playback = await startVideoRecordingPlayback(deviceId, {
        startTime: recording.startTime,
        endTime: recording.endTime,
        protocol: 'hls',
      });
      session = { tbDeviceId: deviceId, sessionId: playback.sessionId };
      const playbackUrl = normalizePlaybackUrl(playback.url);
      if (requestId !== recordingRequestId || deviceId !== normalizedDeviceId.value || !props.visible) {
        await releaseCameraRecordingSession(session);
        return;
      }
      if (!playbackUrl) {
        await releaseCameraRecordingSession(session);
        throw new Error('录像回放地址不符合 Video API 同源代理约束');
      }
      activeRecordingSession.value = session;
      await nextTick();
      if (requestId !== recordingRequestId || activeRecordingSession.value?.sessionId !== session.sessionId) {
        await releaseActiveRecording();
        return;
      }
      await initRecordingPlayer(playbackUrl);
    } catch (error) {
      if (requestId === recordingRequestId && deviceId === normalizedDeviceId.value && props.visible) {
        if (session && activeRecordingSession.value?.sessionId === session.sessionId) {
          await releaseActiveRecording();
        }
        recordingMessage.value = errorMessage(error, '启动录像回放失败');
      }
    } finally {
      if (requestId === recordingRequestId) {
        recordingPlaying.value = false;
      }
    }
  }

  async function controlRecording(
    action: VideoRecordingControlAction,
    extra: { positionSeconds?: number; speed?: number } = {},
  ) {
    const session = activeRecordingSession.value;
    if (!session || recordingControlLoading.value) return;

    const requestId = ++recordingControlRequestId;
    recordingControlLoading.value = true;
    recordingMessage.value = '';
    try {
      await controlVideoRecordingPlayback(session.tbDeviceId, {
        sessionId: session.sessionId,
        action,
        ...extra,
      });
      if (requestId !== recordingControlRequestId || !props.visible) return;
      if (activeRecordingSession.value?.sessionId !== session.sessionId) return;
      const video = recordingVideoEl.value;
      if (action === 'pause') video?.pause();
      if (action === 'resume' && video) await video.play();
      if (action === 'seek' && video && extra.positionSeconds !== undefined) {
        video.currentTime = extra.positionSeconds;
      }
      if (action === 'speed' && video && extra.speed !== undefined) {
        video.playbackRate = extra.speed;
      }
      if (requestId !== recordingControlRequestId || !props.visible) return;
      if (activeRecordingSession.value?.sessionId !== session.sessionId) return;
      recordingMessage.value = '回放控制已接收：' + action;
    } catch (error) {
      if (requestId === recordingControlRequestId && props.visible) {
        recordingMessage.value = errorMessage(error, '录像回放控制失败');
      }
    } finally {
      if (requestId === recordingControlRequestId) {
        recordingControlLoading.value = false;
      }
    }
  }

  function changeRecordingSpeed() {
    void controlRecording('speed', { speed: Number(recordingSpeed.value) });
  }

  function seekRecording() {
    const positionSeconds = Math.max(0, Math.round(Number(seekPositionSeconds.value) || 0));
    void controlRecording('seek', { positionSeconds });
  }

  async function stopRecording() {
    ++recordingRequestId;
    const requestId = ++recordingControlRequestId;
    recordingControlLoading.value = true;
    await releaseActiveRecording();
    if (requestId === recordingControlRequestId && props.visible) {
      recordingMessage.value = '录像回放已停止';
      recordingControlLoading.value = false;
    }
  }

  function stopStatusPolling() {
    if (statusTimer !== undefined) {
      window.clearInterval(statusTimer);
      statusTimer = undefined;
    }
  }

  function startStatusPolling() {
    stopStatusPolling();
    if (!props.visible || !normalizedDeviceId.value) return;
    void refreshStatus();
    statusTimer = window.setInterval(() => void refreshStatus(), 10_000);
  }

  function resetForDeviceChange() {
    ++statusRequestId;
    ++snapshotRequestId;
    ++ptzRequestId;
    ++recordingsRequestId;
    ++recordingRequestId;
    ++recordingControlRequestId;
    status.value = null;
    statusError.value = '';
    statusLoading.value = false;
    snapshotLoading.value = false;
    snapshotError.value = '';
    revokeSnapshotUrl();
    recordings.value = [];
    recordingsError.value = '';
    recordingsLoading.value = false;
    ptzLoading.value = false;
    ptzMessage.value = '';
    recordingPlaying.value = false;
    recordingControlLoading.value = false;
    recordingMessage.value = '';
    void releaseActiveRecording();
  }

  watch(
    () => [props.visible, normalizedDeviceId.value] as const,
    ([visible, deviceId], previous) => {
      if (!previous || previous[1] !== deviceId || !visible) {
        resetForDeviceChange();
      }
      startStatusPolling();
      if (visible && deviceId) {
        void refreshSnapshot();
        if (playbackAvailable.value) void queryRecordings();
      }
    },
    { immediate: true },
  );

  onBeforeUnmount(() => {
    stopStatusPolling();
    ++statusRequestId;
    ++snapshotRequestId;
    ++ptzRequestId;
    ++recordingsRequestId;
    ++recordingRequestId;
    ++recordingControlRequestId;
    revokeSnapshotUrl();
    void releaseActiveRecording();
  });
</script>

<style scoped>
  .camera-video-operations {
    display: grid;
    gap: 12px;
    margin-top: 12px;
  }

  .camera-video-operations__section {
    display: grid;
    gap: 10px;
    padding: 12px;
    border: 1px solid rgba(148, 163, 184, 0.28);
    border-radius: 10px;
    background: rgba(15, 23, 42, 0.58);
  }

  .camera-video-operations__section-header,
  .camera-video-operations__actions,
  .camera-video-operations__preset {
    display: flex;
    align-items: center;
    gap: 8px;
    flex-wrap: wrap;
  }

  .camera-video-operations__section-header {
    justify-content: space-between;
    font-weight: 600;
  }

  .camera-video-operations button,
  .camera-video-operations input,
  .camera-video-operations select {
    min-height: 30px;
    border: 1px solid rgba(148, 163, 184, 0.4);
    border-radius: 6px;
    color: inherit;
    background: rgba(15, 23, 42, 0.85);
  }

  .camera-video-operations button {
    padding: 4px 10px;
    cursor: pointer;
  }

  .camera-video-operations button:disabled {
    cursor: not-allowed;
    opacity: 0.5;
  }

  .camera-video-operations input,
  .camera-video-operations select {
    padding: 2px 6px;
  }

  .camera-video-operations__inline-field {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    font-size: 12px;
    font-weight: 400;
  }

  .camera-video-operations__inline-field input {
    width: 76px;
  }

  .camera-video-operations__status-grid {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 6px 12px;
    font-size: 12px;
  }

  .camera-video-operations__wide {
    grid-column: 1 / -1;
  }

  .camera-video-operations__snapshot {
    display: grid;
    place-items: center;
    min-height: 100px;
    overflow: hidden;
    border-radius: 8px;
    color: rgba(226, 232, 240, 0.72);
    background: rgba(2, 6, 23, 0.72);
  }

  .camera-video-operations__snapshot img {
    display: block;
    width: 100%;
    max-height: 240px;
    object-fit: contain;
  }

  .camera-video-operations__ptz-grid {
    display: grid;
    grid-template-columns: repeat(3, 48px);
    justify-content: center;
    gap: 6px;
  }

  .camera-video-operations__message {
    font-size: 12px;
    color: rgba(226, 232, 240, 0.76);
  }

  .camera-video-operations__message--error {
    color: #fca5a5;
  }

  .camera-video-operations__time-range {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 8px;
  }

  .camera-video-operations__time-range label {
    display: grid;
    gap: 4px;
    font-size: 12px;
  }

  .camera-video-operations__recordings {
    display: grid;
    gap: 6px;
    max-height: 180px;
    overflow: auto;
  }

  .camera-video-operations__recordings button {
    display: flex;
    justify-content: space-between;
    gap: 12px;
    text-align: left;
  }

  .camera-video-operations__playback {
    display: grid;
    gap: 8px;
  }

  .camera-video-operations__playback video {
    width: 100%;
    min-height: 160px;
    border-radius: 8px;
    background: #020617;
  }

  @container map-screen (max-width: 560px) {
    .camera-video-operations__time-range {
      grid-template-columns: 1fr;
    }
  }
</style>
