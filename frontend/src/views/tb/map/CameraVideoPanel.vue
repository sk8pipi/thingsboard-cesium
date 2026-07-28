<template>
  <div v-if="visible" class="camera-video-panel">
    <div class="camera-video-panel__header">
      <div class="camera-video-panel__header-main">
        <div class="camera-video-panel__title-row">
          <div class="camera-video-panel__title">
            {{ camera?.cameraName || camera?.name || '摄像头预览' }}
          </div>
          <span class="camera-video-panel__status" :class="statusClass">
            {{ statusLabel }}
          </span>
        </div>
        <div class="camera-video-panel__sub">
          {{ camera?.locationText || camera?.cameraCode || camera?.deviceId || '实时视频预览' }}
        </div>
      </div>

      <button class="camera-video-panel__close" type="button" @click="handleClose">关闭</button>
    </div>

    <div class="camera-video-panel__body">
      <div class="camera-video-panel__video-shell">
        <iframe
          v-if="preferMonitorPage"
          :src="monitorPageUrl"
          class="camera-video-panel__video camera-video-panel__iframe"
          allow="autoplay; fullscreen"
          referrerpolicy="no-referrer"
          @load="handleMonitorPageLoad"
        ></iframe>
        <video
          v-else
          ref="videoEl"
          class="camera-video-panel__video"
          :poster="camera?.posterUrl || ''"
          controls
          muted
          autoplay
          playsinline
          @canplay="handleCanPlay"
          @error="handleVideoError"
        ></video>

        <div v-if="loading" class="camera-video-panel__overlay"> 正在加载实时视频... </div>

        <div v-else-if="errorMessage" class="camera-video-panel__overlay camera-video-panel__overlay--error">
          {{ errorMessage }}
        </div>
      </div>

      <div class="camera-video-panel__meta">
        <span>HLS：{{ playbackUrl || '-' }}</span>
        <span>RTSP：{{ camera?.rtspUrl || '-' }}</span>
        <span>WebRTC：{{ camera?.webRtcUrl || '-' }}</span>
      </div>

      <div class="camera-video-panel__section">
        <div class="camera-video-panel__section-title">状态信息</div>
        <div class="camera-video-panel__status-grid">
          <div class="camera-video-panel__status-item">
            <span class="camera-video-panel__status-key">设备在线</span>
            <span class="camera-video-panel__status-value">{{ camera?.online ? '在线' : '离线' }}</span>
          </div>
          <div class="camera-video-panel__status-item">
            <span class="camera-video-panel__status-key">媒体流状态</span>
            <span class="camera-video-panel__status-value">{{ camera?.streamOnline ? '正常' : '离线' }}</span>
          </div>
          <div class="camera-video-panel__status-item">
            <span class="camera-video-panel__status-key">FPS</span>
            <span class="camera-video-panel__status-value">{{ fpsText }}</span>
          </div>
          <div class="camera-video-panel__status-item">
            <span class="camera-video-panel__status-key">码率</span>
            <span class="camera-video-panel__status-value">{{ bitrateText }}</span>
          </div>
          <div class="camera-video-panel__status-item">
            <span class="camera-video-panel__status-key">延迟</span>
            <span class="camera-video-panel__status-value">{{ delayText }}</span>
          </div>
          <div class="camera-video-panel__status-item">
            <span class="camera-video-panel__status-key">最后心跳</span>
            <span class="camera-video-panel__status-value">{{ heartbeatText }}</span>
          </div>
          <div class="camera-video-panel__status-item">
            <span class="camera-video-panel__status-key">播放器错误</span>
            <span class="camera-video-panel__status-value camera-video-panel__status-value--multiline">
              {{ displayPlayerError }}
            </span>
          </div>
          <div class="camera-video-panel__status-item">
            <span class="camera-video-panel__status-key">告警</span>
            <span class="camera-video-panel__status-value camera-video-panel__status-value--multiline">
              {{ alarmText }}
            </span>
          </div>
        </div>
      </div>

      <div v-if="camera?.supportsPtz" class="camera-video-panel__section">
        <div class="camera-video-panel__section-title">云台控制</div>
        <div class="camera-video-panel__ptz-grid">
          <button
            class="camera-video-panel__ptz-btn"
            type="button"
            :disabled="!ptzEnabled"
            @click="sendPtzCommand('up')"
          >
            上
          </button>
          <button
            class="camera-video-panel__ptz-btn"
            type="button"
            :disabled="!ptzEnabled"
            @click="sendPtzCommand('left')"
          >
            左
          </button>
          <button
            class="camera-video-panel__ptz-btn"
            type="button"
            :disabled="!ptzEnabled"
            @click="sendPtzCommand('stop')"
          >
            停
          </button>
          <button
            class="camera-video-panel__ptz-btn"
            type="button"
            :disabled="!ptzEnabled"
            @click="sendPtzCommand('right')"
          >
            右
          </button>
          <button
            class="camera-video-panel__ptz-btn"
            type="button"
            :disabled="!ptzEnabled"
            @click="sendPtzCommand('down')"
          >
            下
          </button>
          <button
            class="camera-video-panel__ptz-btn"
            type="button"
            :disabled="!ptzEnabled"
            @click="sendPtzCommand('zoomIn')"
          >
            放大
          </button>
          <button
            class="camera-video-panel__ptz-btn"
            type="button"
            :disabled="!ptzEnabled"
            @click="sendPtzCommand('zoomOut')"
          >
            缩小
          </button>
        </div>
        <div class="camera-video-panel__hint">
          {{ ptzHint }}
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
  import { computed, nextTick, onBeforeUnmount, ref, watch } from 'vue';
  import Hls from 'hls.js';
  import type { CameraPoint, PtzCommand } from './cameraTypes';

  const props = defineProps<{
    visible: boolean;
    camera?: CameraPoint | null;
  }>();

  const emit = defineEmits<{
    (e: 'close'): void;
    (e: 'player-error', payload: { cameraId: string; message: string }): void;
    (e: 'player-recovered', payload: { cameraId: string }): void;
  }>();

  const videoEl = ref<HTMLVideoElement | null>(null);
  const loading = ref(false);
  const errorMessage = ref('');

  let hls: Hls | null = null;
  let playerState: 'idle' | 'ready' | 'error' = 'idle';

  const playbackUrl = computed(() => props.camera?.hlsUrl || props.camera?.streamUrl || '');
  const monitorPageUrl = computed(() => {
    if (props.camera?.monitorPageUrl) {
      return props.camera.monitorPageUrl;
    }

    const cameraCode = props.camera?.cameraCode || props.camera?.id || '';
    if (!cameraCode) {
      return '';
    }

    return '';
  });
  const preferMonitorPage = computed(() => Boolean(monitorPageUrl.value));

  const statusLabel = computed(() => {
    switch (props.camera?.status) {
      case 'online':
        return '在线';
      case 'warning':
        return '告警';
      case 'error':
        return '异常';
      case 'offline':
      default:
        return '离线';
    }
  });

  const statusClass = computed(() => `camera-video-panel__status--${props.camera?.status || 'offline'}`);

  const bitrateText = computed(() => {
    const bitrate = Number(props.camera?.bitrateKbps || props.camera?.bitrate || 0);
    return bitrate > 0 ? `${bitrate} kbps` : '-';
  });

  const fpsText = computed(() => {
    const fps = Number(props.camera?.fps || 0);
    return fps > 0 ? `${fps}` : '-';
  });

  const delayText = computed(() => {
    const delayMs = Number(props.camera?.delayMs || 0);
    return delayMs > 0 ? `${delayMs} ms` : '-';
  });

  const heartbeatText = computed(() => {
    const ts = Number(props.camera?.lastHeartbeatTs || 0);
    if (!ts) return '-';

    const date = new Date(ts);
    if (Number.isNaN(date.getTime())) return '-';
    return date.toLocaleString();
  });

  const displayPlayerError = computed(() => {
    return errorMessage.value || props.camera?.playerError || '无';
  });

  const alarmText = computed(() => {
    if (props.camera?.alarmText) return props.camera.alarmText;
    if (props.camera?.videoLoss) return '视频丢失';
    if (props.camera?.tamperAlarm) return '遮挡告警';
    if (props.camera?.motionDetected) return '移动侦测';
    return '无';
  });

  const ptzEnabled = computed(() => {
    return Boolean(props.camera?.supportsPtz && props.camera?.controlMode && props.camera.controlMode !== 'none');
  });

  const ptzHint = computed(() => {
    if (!props.camera?.supportsPtz) return '';
    if (ptzEnabled.value) {
      return '预留为 ThingsBoard RPC 控制链路。';
    }
    return '当前摄像头未启用云台控制，后续通过 ThingsBoard RPC 接入。';
  });

  function emitPlayerRecovered() {
    if (!props.camera?.id) return;
    if (playerState === 'ready') return;

    playerState = 'ready';
    emit('player-recovered', { cameraId: props.camera.id });
  }

  function setError(message: string) {
    if (errorMessage.value === message && playerState === 'error') {
      loading.value = false;
      return;
    }

    loading.value = false;
    errorMessage.value = message;
    playerState = 'error';

    if (props.camera?.id) {
      emit('player-error', {
        cameraId: props.camera.id,
        message,
      });
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
    loading.value = false;
    playerState = 'idle';

    if (hls) {
      hls.destroy();
      hls = null;
    }

    clearVideoSource();
  }

  async function tryPlay() {
    const video = videoEl.value;
    if (!video) return;

    try {
      await video.play();
    } catch (error) {
      const errorName = error instanceof DOMException ? error.name : '';

      if (errorName === 'AbortError') {
        return;
      }

      if (errorName === 'NotAllowedError') {
        setError('浏览器阻止了自动播放，请点击播放器开始预览。');
        return;
      }

      console.warn('Video play failed:', error);
      setError('实时视频已加载，请点击播放器开始预览。');
    }
  }

  async function resolvePrimaryHlsUrl(
    targetUrl: string,
    normalizeHlsRequestUrl: (rawUrl: string) => string,
    rememberSessionFromUrl: (rawUrl: string) => void,
  ) {
    const normalizedTargetUrl = normalizeHlsRequestUrl(targetUrl);

    try {
      const response = await fetch(normalizedTargetUrl, {
        cache: 'no-store',
      });

      if (!response.ok) {
        return normalizedTargetUrl;
      }

      const playlistText = await response.text();
      if (!playlistText.includes('#EXTM3U') || !playlistText.includes('#EXT-X-STREAM-INF')) {
        return normalizedTargetUrl;
      }

      const lines = playlistText.split(/\r?\n/);
      for (let index = 0; index < lines.length; index += 1) {
        const currentLine = lines[index]?.trim() || '';
        if (currentLine.startsWith('#')) {
          currentLine.replace(/URI="([^"]+)"/g, (_match, uri: string) => {
            rememberSessionFromUrl(uri);
            return '';
          });
        }

        if (!lines[index]?.trim().startsWith('#EXT-X-STREAM-INF')) {
          continue;
        }

        for (let nextIndex = index + 1; nextIndex < lines.length; nextIndex += 1) {
          const candidate = lines[nextIndex]?.trim();
          if (!candidate || candidate.startsWith('#')) {
            continue;
          }

          rememberSessionFromUrl(candidate);
          return normalizeHlsRequestUrl(candidate);
        }
      }
    } catch (error) {
      console.warn('Failed to resolve primary HLS playlist, fallback to target URL:', error);
    }

    return normalizedTargetUrl;
  }

  async function initPlayer() {
    const camera = props.camera;
    const video = videoEl.value;
    const targetUrl = playbackUrl.value;

    destroyPlayer();
    errorMessage.value = '';

    if (!props.visible || !camera) return;

    if ((!targetUrl && !preferMonitorPage.value) || camera.streamOnline === false) {
      setError('视频流离线或未配置播放地址');
      return;
    }

    if ((camera.protocol || 'hls') !== 'hls') {
      setError(`暂不支持的播放协议：${camera.protocol}`);
      return;
    }

    if (preferMonitorPage.value) {
      loading.value = true;
      clearVideoSource();
      return;
    }

    if (!video) return;

    loading.value = true;
    video.muted = true;
    video.autoplay = true;
    video.playsInline = true;

    if (Hls.isSupported()) {
      const cameraCode = camera.cameraCode || camera.id;
      const cameraPathPrefix = `/${cameraCode}/`;
      const cameraProxyBasePath = `/live/${cameraCode}/`;
      const cameraProxyBaseUrl = new URL('./', new URL(targetUrl, window.location.origin)).toString();
      const sessionByResource = new Map<string, string>();
      let primaryPlaylistUrl = '';

      const normalizeResourcePath = (pathname: string) => pathname.replace(/^\/live/, '').replace(/\/+/, '/');

      const buildResourceKeys = (pathname: string) => {
        const normalizedPath = normalizeResourcePath(pathname);
        const basename = normalizedPath.split('/').filter(Boolean).pop() || normalizedPath;
        return [normalizedPath, basename];
      };

      const rememberSessionFromUrl = (rawUrl: string) => {
        const resolved = new URL(rawUrl, cameraProxyBaseUrl);
        const session = resolved.searchParams.get('session');
        if (!session) return;

        buildResourceKeys(resolved.pathname).forEach((key) => {
          if (key) {
            sessionByResource.set(key, session);
          }
        });
      };

      const resolveRememberedSession = (pathname: string) => {
        for (const key of buildResourceKeys(pathname)) {
          const session = sessionByResource.get(key);
          if (session) return session;
        }
        return '';
      };

      const normalizeHlsRequestUrl = (rawUrl: string) => {
        const normalized = new URL(rawUrl, cameraProxyBaseUrl);
        normalized.searchParams.delete('cookieCheck');

        if (normalized.origin === window.location.origin) {
          if (!normalized.pathname.startsWith('/video-stream/')) {
            if (normalized.pathname.startsWith(cameraPathPrefix)) {
              normalized.pathname = `/live${normalized.pathname}`;
            } else if (
              !normalized.pathname.startsWith(cameraProxyBasePath) &&
              !normalized.pathname.startsWith('/live/')
            ) {
              normalized.pathname = `${cameraProxyBasePath}${normalized.pathname.replace(/^\/+/, '')}`;
            }
          }

          if (!normalized.searchParams.has('session')) {
            const rememberedSession = resolveRememberedSession(normalized.pathname);
            if (rememberedSession) {
              normalized.searchParams.set('session', rememberedSession);
            }
          }

          return `${normalized.pathname}${normalized.search}${normalized.hash}`;
        }

        return normalized.toString();
      };

      const isPrimaryPlaylistRequest = (rawUrl: string) => {
        if (!primaryPlaylistUrl) {
          return false;
        }

        const currentUrl = new URL(rawUrl, cameraProxyBaseUrl);
        const primaryUrl = new URL(primaryPlaylistUrl, cameraProxyBaseUrl);
        return currentUrl.pathname === primaryUrl.pathname;
      };

      const rewritePlaylistText = (playlistText: string) => {
        return playlistText
          .split(/\r?\n/)
          .map((line) => {
            const trimmed = line.trim();

            if (!trimmed) {
              return line;
            }

            if (trimmed.startsWith('#')) {
              return line.replace(/URI="([^"]+)"/g, (_match, uri: string) => {
                rememberSessionFromUrl(uri);
                return `URI="${normalizeHlsRequestUrl(uri)}"`;
              });
            }

            rememberSessionFromUrl(trimmed);
            return normalizeHlsRequestUrl(trimmed);
          })
          .join('\n');
      };

      const BaseLoader = Hls.DefaultConfig.loader;
      class CameraHlsLoader extends BaseLoader {
        override load(context: any, config: any, callbacks: any) {
          if (isPrimaryPlaylistRequest(String(context?.url || ''))) {
            const currentUrl = new URL(String(context.url || ''), cameraProxyBaseUrl);
            const currentHasSession = currentUrl.searchParams.has('session');
            context.url = currentHasSession ? normalizeHlsRequestUrl(context.url) : primaryPlaylistUrl;
          } else {
            context.url = normalizeHlsRequestUrl(context.url);
          }

          const wrappedCallbacks = {
            ...callbacks,
            onSuccess: (response: any, stats: any, ctx: any, networkDetails: any) => {
              if (typeof response?.data === 'string' && /\.m3u8(?:$|\?)/.test(String(ctx?.url || context.url || ''))) {
                response.data = rewritePlaylistText(response.data);
              }

              callbacks.onSuccess(response, stats, ctx, networkDetails);
            },
          };

          super.load(context, config, wrappedCallbacks);
        }
      }

      hls = new Hls({
        enableWorker: true,
        lowLatencyMode: true,
        backBufferLength: 30,
        loader: CameraHlsLoader,
      });

      hls.attachMedia(video);
      hls.on(Hls.Events.MEDIA_ATTACHED, async () => {
        const resolvedPlaybackUrl = await resolvePrimaryHlsUrl(
          targetUrl,
          normalizeHlsRequestUrl,
          rememberSessionFromUrl,
        );
        primaryPlaylistUrl = resolvedPlaybackUrl;
        hls?.loadSource(resolvedPlaybackUrl);
      });

      hls.on(Hls.Events.MANIFEST_PARSED, () => {
        loading.value = false;
        emitPlayerRecovered();
        void tryPlay();
      });

      hls.on(Hls.Events.ERROR, (_event, data) => {
        if (!data.fatal) return;

        console.error('HLS playback failed:', data);
        destroyPlayer();
        setError('实时视频播放失败，请检查 HLS 服务或流地址。');
      });
      return;
    }

    if (video.canPlayType('application/vnd.apple.mpegurl')) {
      video.src = targetUrl;
      await tryPlay();
      return;
    }

    setError('当前浏览器不支持 HLS 播放。');
  }

  function handleCanPlay() {
    loading.value = false;
    emitPlayerRecovered();
  }

  function handleMonitorPageLoad() {
    loading.value = false;
    emitPlayerRecovered();
  }

  function handleVideoError() {
    if (!props.visible) return;
    setError('视频组件加载实时流失败。');
  }

  function handleClose() {
    destroyPlayer();
    emit('close');
  }

  function sendPtzCommand(command: PtzCommand) {
    if (!ptzEnabled.value || !props.camera?.id) {
      return;
    }

    console.info('[CameraVideoPanel] PTZ command reserved for ThingsBoard RPC:', props.camera.id, command);

    // TODO:
    // 后续走 ThingsBoard RPC:
    // Cesium 前端 -> ThingsBoard RPC -> Gateway -> 摄像头 / 流媒体服务器控制 API
  }

  watch(
    () => [
      props.visible,
      props.camera?.id,
      playbackUrl.value,
      monitorPageUrl.value,
      props.camera?.protocol,
      props.camera?.streamOnline,
    ],
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
  });
</script>

<style scoped>
  .camera-video-panel {
    position: absolute;
    right: 16px;
    top: 16px;
    z-index: 1700;
    width: min(440px, calc(100vw - 24px));
    border-radius: 14px;
    overflow: hidden;
    background: linear-gradient(180deg, rgba(15, 23, 42, 0.97) 0%, rgba(8, 15, 28, 0.95) 100%);
    color: #fff;
    border: 1px solid rgba(148, 163, 184, 0.28);
    box-shadow: 0 18px 40px rgba(15, 23, 42, 0.35);
    backdrop-filter: blur(10px);
  }

  .camera-video-panel__header {
    display: flex;
    align-items: flex-start;
    justify-content: space-between;
    gap: 12px;
    padding: 14px 16px 12px;
    border-bottom: 1px solid rgba(148, 163, 184, 0.18);
  }

  .camera-video-panel__header-main {
    min-width: 0;
  }

  .camera-video-panel__title-row {
    display: flex;
    align-items: center;
    gap: 10px;
    margin-bottom: 6px;
  }

  .camera-video-panel__title {
    font-size: 16px;
    font-weight: 700;
    line-height: 1.2;
  }

  .camera-video-panel__status {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    min-width: 66px;
    padding: 2px 8px;
    border-radius: 999px;
    font-size: 12px;
    font-weight: 600;
  }

  .camera-video-panel__status--online {
    background: rgba(22, 163, 74, 0.2);
    color: #86efac;
  }

  .camera-video-panel__status--warning {
    background: rgba(245, 158, 11, 0.18);
    color: #fcd34d;
  }

  .camera-video-panel__status--error {
    background: rgba(239, 68, 68, 0.18);
    color: #fca5a5;
  }

  .camera-video-panel__status--offline {
    background: rgba(100, 116, 139, 0.2);
    color: #cbd5e1;
  }

  .camera-video-panel__sub {
    font-size: 12px;
    line-height: 1.4;
    color: rgba(226, 232, 240, 0.75);
    word-break: break-all;
  }

  .camera-video-panel__close {
    flex: none;
    border: 1px solid rgba(255, 255, 255, 0.22);
    border-radius: 8px;
    background: rgba(255, 255, 255, 0.06);
    color: #fff;
    cursor: pointer;
    padding: 6px 10px;
  }

  .camera-video-panel__body {
    padding: 14px 16px 16px;
  }

  .camera-video-panel__video-shell {
    position: relative;
    overflow: hidden;
    border-radius: 12px;
    background: #020617;
    aspect-ratio: 16 / 9;
  }

  .camera-video-panel__video {
    width: 100%;
    height: 100%;
    display: block;
    background: #000;
    object-fit: cover;
  }

  .camera-video-panel__iframe {
    border: 0;
  }

  .camera-video-panel__overlay {
    position: absolute;
    inset: 0;
    display: flex;
    align-items: center;
    justify-content: center;
    padding: 20px;
    background: rgba(2, 6, 23, 0.68);
    font-size: 14px;
    text-align: center;
  }

  .camera-video-panel__overlay--error {
    color: #fecaca;
  }

  .camera-video-panel__meta {
    display: grid;
    gap: 6px;
    margin-top: 12px;
    font-size: 12px;
    color: rgba(226, 232, 240, 0.72);
    word-break: break-all;
  }

  .camera-video-panel__section {
    margin-top: 14px;
  }

  .camera-video-panel__section-title {
    margin-bottom: 10px;
    font-size: 13px;
    font-weight: 700;
    color: rgba(248, 250, 252, 0.92);
  }

  .camera-video-panel__status-grid {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 8px;
  }

  .camera-video-panel__status-item {
    padding: 10px;
    border-radius: 10px;
    background: rgba(30, 41, 59, 0.72);
    border: 1px solid rgba(148, 163, 184, 0.12);
    min-height: 58px;
  }

  .camera-video-panel__status-key {
    display: block;
    margin-bottom: 6px;
    font-size: 11px;
    color: rgba(148, 163, 184, 0.96);
  }

  .camera-video-panel__status-value {
    display: block;
    font-size: 13px;
    color: rgba(248, 250, 252, 0.96);
    word-break: break-all;
  }

  .camera-video-panel__status-value--multiline {
    line-height: 1.45;
    white-space: pre-wrap;
  }

  .camera-video-panel__ptz-grid {
    display: grid;
    grid-template-columns: repeat(4, minmax(0, 1fr));
    gap: 8px;
  }

  .camera-video-panel__ptz-btn {
    border-radius: 10px;
    border: 1px solid rgba(148, 163, 184, 0.24);
    background: rgba(51, 65, 85, 0.72);
    color: #fff;
    min-height: 38px;
    cursor: pointer;
  }

  .camera-video-panel__ptz-btn:disabled {
    cursor: not-allowed;
    opacity: 0.45;
  }

  .camera-video-panel__hint {
    margin-top: 8px;
    font-size: 12px;
    color: rgba(226, 232, 240, 0.72);
  }

  @media (max-width: 768px) {
    .camera-video-panel {
      left: 12px;
      right: 12px;
      top: 12px;
      width: auto;
    }

    .camera-video-panel__status-grid {
      grid-template-columns: 1fr;
    }

    .camera-video-panel__ptz-grid {
      grid-template-columns: repeat(2, minmax(0, 1fr));
    }
  }
</style>
