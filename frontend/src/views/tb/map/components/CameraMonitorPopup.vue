<template>
  <div v-if="visible" class="camera-monitor-popup">
    <div class="camera-monitor-popup__header">
      <div class="camera-monitor-popup__title-wrap">
        <div class="camera-monitor-popup__title">
          {{ runtimeInfo?.cameraName || runtimeInfo?.entityName || '监控点位' }}
        </div>
        <div class="camera-monitor-popup__subtitle">
          {{ runtimeInfo?.cameraCode || runtimeInfo?.cameraId || runtimeInfo?.entityId || '-' }}
        </div>
      </div>

      <div class="camera-monitor-popup__header-tags">
        <span class="camera-monitor-popup__tag" :class="onlineTagClass">
          {{ onlineLabel }}
        </span>
        <span class="camera-monitor-popup__tag" :class="streamTagClass">
          {{ streamLabel }}
        </span>
        <button class="camera-monitor-popup__close" type="button" @click="handleClose">关闭</button>
      </div>
    </div>

    <div class="camera-monitor-popup__body">
      <div class="camera-monitor-popup__video-shell">
        <iframe
          v-if="preferMonitorPage"
          :src="monitorPageUrl"
          class="camera-monitor-popup__video camera-monitor-popup__iframe"
          allow="autoplay; fullscreen"
          referrerpolicy="no-referrer"
          @load="handleMonitorPageLoad"
        ></iframe>
        <video
          v-else
          ref="videoEl"
          class="camera-monitor-popup__video"
          controls
          autoplay
          muted
          playsinline
          @canplay="playerLoading = false"
          @error="handleVideoError"
        ></video>

        <div v-if="loadingState" class="camera-monitor-popup__overlay">正在加载实时视频...</div>
        <div v-else-if="displayMessage" class="camera-monitor-popup__overlay camera-monitor-popup__overlay--error">
          {{ displayMessage }}
        </div>
      </div>

      <div class="camera-monitor-popup__meta">
        <span>播放协议: {{ runtimeInfo?.playbackProtocol || runtimeInfo?.streamType || '-' }}</span>
        <span>直播会话: {{ runtimeInfo?.playbackSessionId ? '已建立' : '未建立' }}</span>
      </div>

      <div class="camera-monitor-popup__grid">
        <div class="camera-monitor-popup__card">
          <span class="camera-monitor-popup__label">FPS</span>
          <span class="camera-monitor-popup__value">{{ formatNumber(runtimeInfo?.fps) }}</span>
        </div>
        <div class="camera-monitor-popup__card">
          <span class="camera-monitor-popup__label">码率</span>
          <span class="camera-monitor-popup__value">{{ bitrateText }}</span>
        </div>
        <div class="camera-monitor-popup__card">
          <span class="camera-monitor-popup__label">延迟</span>
          <span class="camera-monitor-popup__value">{{ delayText }}</span>
        </div>
        <div class="camera-monitor-popup__card">
          <span class="camera-monitor-popup__label">录像</span>
          <span class="camera-monitor-popup__value">{{ booleanText(runtimeInfo?.recording) }}</span>
        </div>
        <div class="camera-monitor-popup__card">
          <span class="camera-monitor-popup__label">移动检测</span>
          <span class="camera-monitor-popup__value">{{
            booleanText(runtimeInfo?.motionDetected ?? runtimeInfo?.motion)
          }}</span>
        </div>
        <div class="camera-monitor-popup__card">
          <span class="camera-monitor-popup__label">告警</span>
          <span class="camera-monitor-popup__value">{{ alarmText }}</span>
        </div>
      </div>

      <CameraVideoOperations
        :visible="visible"
        :tb-device-id="runtimeInfo?.entityId"
        :supports-ptz="runtimeInfo?.supportsPtz"
        :supports-zoom="runtimeInfo?.supportsZoom"
        :supports-preset="runtimeInfo?.supportsPreset"
        :supports-playback="runtimeInfo?.supportsPlayback"
      />
    </div>
  </div>
</template>

<script setup lang="ts">
  import { computed, nextTick, onBeforeUnmount, ref, watch } from 'vue';
  import Hls from 'hls.js';
  import CameraVideoOperations from './CameraVideoOperations.vue';
  import {
    isSameCameraVideoSession,
    releaseCameraVideoSession,
    resolveCameraVideoSession,
    type CameraVideoSession,
  } from '../services/cameraVideoSessionService';
  import type { CameraRuntimeInfo } from '../types/mapPointTypes';

  const props = defineProps<{
    visible: boolean;
    runtimeInfo?: CameraRuntimeInfo | null;
    loading?: boolean;
    error?: string;
  }>();

  const emit = defineEmits<{
    (e: 'close'): void;
  }>();

  const videoEl = ref<HTMLVideoElement | null>(null);
  const playerLoading = ref(false);
  const playerError = ref('');

  let hls: Hls | null = null;
  let activeVideoSession: CameraVideoSession | null = null;

  const playUrl = computed(() => normalizeHlsUrl(props.runtimeInfo?.hlsUrl || props.runtimeInfo?.streamUrl || ''));
  const monitorPageUrl = computed(() => '');
  const preferMonitorPage = computed(() => Boolean(monitorPageUrl.value));
  const loadingState = computed(() => Boolean(props.loading) || playerLoading.value);
  const displayMessage = computed(() => props.error || playerError.value);
  const onlineLabel = computed(() => (props.runtimeInfo?.online ? '设备在线' : '设备离线'));
  const streamLabel = computed(() => (props.runtimeInfo?.streamOnline ? '视频流正常' : '视频流离线'));
  const onlineTagClass = computed(() =>
    props.runtimeInfo?.online ? 'camera-monitor-popup__tag--online' : 'camera-monitor-popup__tag--offline',
  );
  const streamTagClass = computed(() =>
    props.runtimeInfo?.streamOnline ? 'camera-monitor-popup__tag--online' : 'camera-monitor-popup__tag--warning',
  );
  const bitrateText = computed(() =>
    runtimeHasNumber(props.runtimeInfo?.bitrate) ? `${props.runtimeInfo?.bitrate} kbps` : '-',
  );
  const delayText = computed(() =>
    runtimeHasNumber(props.runtimeInfo?.delayMs) ? `${props.runtimeInfo?.delayMs} ms` : '-',
  );
  const alarmText = computed(() => {
    const alarms: string[] = [];
    if (props.runtimeInfo?.alarm) alarms.push('告警');
    if (props.runtimeInfo?.videoLoss) alarms.push('视频丢失');
    if (props.runtimeInfo?.motionDetected ?? props.runtimeInfo?.motion) alarms.push('移动侦测');
    if (props.runtimeInfo?.tamperAlarm) alarms.push('遮挡告警');
    return alarms.length ? alarms.join(' / ') : '无';
  });

  function runtimeHasNumber(value?: number) {
    return value !== undefined && value !== null && !Number.isNaN(value);
  }

  function formatNumber(value?: number) {
    return runtimeHasNumber(value) ? String(value) : '-';
  }

  function booleanText(value?: boolean) {
    if (value === undefined) return '-';
    return value ? '是' : '否';
  }

  function normalizeHlsUrl(rawUrl?: string) {
    const value = String(rawUrl || '').trim();
    if (!value) return '';

    try {
      const parsed = new URL(value, window.location.origin);
      parsed.searchParams.delete('cookieCheck');

      if (parsed.origin !== window.location.origin || !parsed.pathname.startsWith('/video-stream/')) return '';
      return `${parsed.pathname}${parsed.search}${parsed.hash}`;
    } catch {
      return '';
    }
  }

  function clearVideoSource() {
    const video = videoEl.value;
    if (!video) return;
    video.pause();
    video.removeAttribute('src');
    video.load();
  }

  function destroyPlayer() {
    playerLoading.value = false;
    playerError.value = '';

    if (hls) {
      hls.destroy();
      hls = null;
    }

    clearVideoSource();
  }

  async function tryPlay(video: HTMLVideoElement) {
    try {
      await video.play();
    } catch (error) {
      const errorName = error instanceof DOMException ? error.name : '';
      if (errorName === 'AbortError') return;
      if (errorName === 'NotAllowedError') {
        playerError.value = '浏览器阻止了自动播放，请手动点击播放。';
      } else {
        playerError.value = '视频已加载，请手动点击播放。';
      }
      playerLoading.value = false;
    }
  }

  function releaseActiveVideoSession() {
    const session = activeVideoSession;
    activeVideoSession = null;
    if (session) {
      void releaseCameraVideoSession(session);
    }
  }

  function syncActiveVideoSession() {
    const nextSession = props.visible ? resolveCameraVideoSession(props.runtimeInfo) : null;
    if (isSameCameraVideoSession(activeVideoSession, nextSession)) return;

    const previousSession = activeVideoSession;
    activeVideoSession = nextSession;
    if (previousSession) {
      void releaseCameraVideoSession(previousSession);
    }
  }

  async function initPlayer() {
    destroyPlayer();

    if (!props.visible) return;

    const runtimeInfo = props.runtimeInfo;
    if (!runtimeInfo) return;

    if (!playUrl.value && !preferMonitorPage.value) {
      playerError.value = runtimeInfo.playbackStatus === 'failed' ? '视频服务暂不可用' : '未配置视频播放地址';
      return;
    }

    if (runtimeInfo.streamOnline === false) {
      playerError.value = '视频流离线';
      return;
    }

    playerLoading.value = true;

    if (preferMonitorPage.value) {
      clearVideoSource();
      return;
    }

    const video = videoEl.value;
    if (!video) return;

    video.muted = true;
    video.autoplay = true;
    video.playsInline = true;

    if (Hls.isSupported()) {
      hls = new Hls({
        enableWorker: true,
        lowLatencyMode: true,
        backBufferLength: 30,
      });

      hls.attachMedia(video);
      hls.on(Hls.Events.MEDIA_ATTACHED, () => hls?.loadSource(playUrl.value));
      hls.on(Hls.Events.MANIFEST_PARSED, () => {
        playerLoading.value = false;
        void tryPlay(video);
      });
      hls.on(Hls.Events.ERROR, (_event, data) => {
        if (!data.fatal) return;
        console.warn('[CameraMonitorPopup] HLS playback failed.', {
          type: data.type,
          details: data.details,
          fatal: data.fatal,
        });
        destroyPlayer();
        playerError.value = '实时视频播放失败，请检查 HLS 地址或流媒体服务状态。';
      });
      return;
    }

    if (video.canPlayType('application/vnd.apple.mpegurl')) {
      video.src = playUrl.value;
      playerLoading.value = false;
      await tryPlay(video);
      return;
    }

    playerLoading.value = false;
    playerError.value = '当前浏览器不支持 HLS 播放。';
  }

  function handleVideoError() {
    if (!props.visible) return;
    playerLoading.value = false;
    playerError.value = '视频组件加载实时流失败。';
  }

  function handleMonitorPageLoad() {
    playerLoading.value = false;
    playerError.value = '';
  }

  function handleClose() {
    destroyPlayer();
    releaseActiveVideoSession();
    emit('close');
  }

  watch(
    () => [props.visible, props.runtimeInfo?.entityId, props.runtimeInfo?.playbackSessionId] as const,
    () => {
      syncActiveVideoSession();
    },
    { immediate: true },
  );

  watch(
    () => [props.visible, props.runtimeInfo?.entityId, playUrl.value, props.runtimeInfo?.streamOnline],
    async () => {
      await nextTick();

      if (props.visible) {
        await initPlayer();
        return;
      }

      destroyPlayer();
    },
    { immediate: true },
  );

  onBeforeUnmount(() => {
    destroyPlayer();
    releaseActiveVideoSession();
  });
</script>

<style scoped>
  .camera-monitor-popup {
    position: absolute;
    top: calc(var(--map-top-bar-offset, 0px) + 16px);
    right: 16px;
    z-index: 1700;
    width: min(460px, calc(100% - 24px));
    max-height: calc(100% - var(--map-top-bar-offset, 0px) - 32px);
    border-radius: 16px;
    overflow-x: hidden;
    overflow-y: auto;
    border: 1px solid rgba(148, 163, 184, 0.24);
    background: linear-gradient(180deg, rgba(12, 18, 28, 0.97), rgba(6, 10, 18, 0.95));
    color: #f8fafc;
    box-shadow: 0 18px 40px rgba(2, 6, 23, 0.42);
    backdrop-filter: blur(10px);
  }

  .camera-monitor-popup__header {
    display: flex;
    justify-content: space-between;
    gap: 12px;
    padding: 16px;
    border-bottom: 1px solid rgba(148, 163, 184, 0.16);
  }

  .camera-monitor-popup__title-wrap {
    min-width: 0;
  }

  .camera-monitor-popup__title {
    font-size: 16px;
    font-weight: 700;
    line-height: 1.2;
  }

  .camera-monitor-popup__subtitle {
    margin-top: 6px;
    font-size: 12px;
    color: rgba(226, 232, 240, 0.72);
    word-break: break-all;
  }

  .camera-monitor-popup__header-tags {
    display: flex;
    align-items: flex-start;
    flex-wrap: wrap;
    justify-content: flex-end;
    gap: 8px;
  }

  .camera-monitor-popup__tag {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    min-width: 72px;
    padding: 2px 8px;
    border-radius: 999px;
    font-size: 12px;
    font-weight: 600;
  }

  .camera-monitor-popup__tag--online {
    background: rgba(22, 163, 74, 0.18);
    color: #86efac;
  }

  .camera-monitor-popup__tag--warning {
    background: rgba(245, 158, 11, 0.18);
    color: #fcd34d;
  }

  .camera-monitor-popup__tag--offline {
    background: rgba(100, 116, 139, 0.2);
    color: #cbd5e1;
  }

  .camera-monitor-popup__close {
    border: 1px solid rgba(255, 255, 255, 0.18);
    background: rgba(255, 255, 255, 0.06);
    color: #fff;
    border-radius: 10px;
    padding: 6px 10px;
    cursor: pointer;
  }

  .camera-monitor-popup__body {
    padding: 16px;
  }

  .camera-monitor-popup__video-shell {
    position: relative;
    overflow: hidden;
    border-radius: 12px;
    background: #000;
    aspect-ratio: 16 / 9;
  }

  .camera-monitor-popup__video {
    width: 100%;
    height: 100%;
    display: block;
    background: #000;
  }

  .camera-monitor-popup__iframe {
    border: 0;
  }

  .camera-monitor-popup__overlay {
    position: absolute;
    inset: 0;
    display: flex;
    align-items: center;
    justify-content: center;
    padding: 20px;
    text-align: center;
    background: rgba(2, 6, 23, 0.7);
  }

  .camera-monitor-popup__overlay--error {
    color: #fecaca;
  }

  .camera-monitor-popup__meta {
    display: grid;
    gap: 6px;
    margin-top: 12px;
    font-size: 12px;
    color: rgba(226, 232, 240, 0.72);
    word-break: break-all;
  }

  .camera-monitor-popup__grid {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 10px;
    margin-top: 14px;
  }

  .camera-monitor-popup__card {
    display: grid;
    gap: 6px;
    min-height: 58px;
    padding: 10px 12px;
    border-radius: 12px;
    border: 1px solid rgba(148, 163, 184, 0.12);
    background: rgba(30, 41, 59, 0.68);
  }

  .camera-monitor-popup__label {
    font-size: 11px;
    color: rgba(148, 163, 184, 0.96);
  }

  .camera-monitor-popup__value {
    font-size: 13px;
    color: rgba(248, 250, 252, 0.96);
    word-break: break-all;
  }

  .camera-monitor-popup__ptz {
    margin-top: 14px;
  }

  .camera-monitor-popup__section-title {
    margin-bottom: 10px;
    font-size: 13px;
    font-weight: 700;
  }

  .camera-monitor-popup__control-group + .camera-monitor-popup__control-group {
    margin-top: 12px;
  }

  .camera-monitor-popup__control-label {
    margin-bottom: 8px;
    font-size: 12px;
    color: rgba(226, 232, 240, 0.72);
  }

  .camera-monitor-popup__ptz-grid {
    display: grid;
    grid-template-columns: repeat(4, minmax(0, 1fr));
    gap: 8px;
  }

  .camera-monitor-popup__ptz-grid--compact {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }

  .camera-monitor-popup__ptz-btn {
    min-height: 38px;
    border-radius: 10px;
    border: 1px solid rgba(148, 163, 184, 0.24);
    background: rgba(51, 65, 85, 0.72);
    color: #fff;
    cursor: pointer;
  }

  .camera-monitor-popup__ptz-btn:disabled {
    opacity: 0.56;
    cursor: not-allowed;
  }

  .camera-monitor-popup__hint {
    margin-top: 8px;
    font-size: 12px;
    color: rgba(226, 232, 240, 0.72);
  }

  .camera-monitor-popup__hint--warning {
    color: #fbbf24;
  }

  @container map-screen (max-width: 768px) {
    .camera-monitor-popup {
      top: calc(var(--map-top-bar-offset, 0px) + 12px);
      right: 12px;
      left: 12px;
      width: auto;
      max-height: calc(100% - var(--map-top-bar-offset, 0px) - 24px);
    }

    .camera-monitor-popup__grid {
      grid-template-columns: 1fr;
    }

    .camera-monitor-popup__ptz-grid {
      grid-template-columns: repeat(2, minmax(0, 1fr));
    }
  }
</style>
