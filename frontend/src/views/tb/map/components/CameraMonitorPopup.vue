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
        <span>播放地址: {{ playUrl || '-' }}</span>
        <span>WebRTC: {{ runtimeInfo?.webRtcUrl || '-' }}</span>
        <span>RTSP: {{ runtimeInfo?.rtspUrl || '-' }}</span>
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

      <div v-if="showControlSection" class="camera-monitor-popup__ptz">
        <div class="camera-monitor-popup__section-title">摄像头控制</div>

        <div v-if="!supportsThingsboardRpc" class="camera-monitor-popup__hint camera-monitor-popup__hint--warning">
          当前设备不支持 ThingsBoard RPC 控制
        </div>

        <template v-else>
          <div
            v-if="!hasDirectionalControls && !hasZoomControls && !hasPresetControls"
            class="camera-monitor-popup__hint"
          >
            当前设备未暴露可用的 RPC 控制方法
          </div>

          <div v-if="hasDirectionalControls" class="camera-monitor-popup__control-group">
            <div class="camera-monitor-popup__control-label">方向控制</div>
            <div class="camera-monitor-popup__ptz-grid">
              <button
                v-for="action in directionalActions"
                :key="action.method"
                class="camera-monitor-popup__ptz-btn"
                type="button"
                :disabled="controlsDisabled"
                @click="sendRpcCommand(action.method, action.params)"
              >
                {{ action.label }}
              </button>
            </div>
          </div>

          <div v-if="hasZoomControls" class="camera-monitor-popup__control-group">
            <div class="camera-monitor-popup__control-label">变焦控制</div>
            <div class="camera-monitor-popup__ptz-grid camera-monitor-popup__ptz-grid--compact">
              <button
                v-for="action in zoomActions"
                :key="action.method"
                class="camera-monitor-popup__ptz-btn"
                type="button"
                :disabled="controlsDisabled"
                @click="sendRpcCommand(action.method, action.params)"
              >
                {{ action.label }}
              </button>
            </div>
          </div>

          <div v-if="hasPresetControls" class="camera-monitor-popup__control-group">
            <div class="camera-monitor-popup__control-label">预置位</div>
            <div class="camera-monitor-popup__ptz-grid camera-monitor-popup__ptz-grid--compact">
              <button
                v-for="action in presetActions"
                :key="action.method"
                class="camera-monitor-popup__ptz-btn"
                type="button"
                :disabled="controlsDisabled"
                @click="sendRpcCommand(action.method, action.params)"
              >
                {{ action.label }}
              </button>
            </div>
          </div>

          <div v-if="rpcStatusText" class="camera-monitor-popup__hint">
            {{ rpcStatusText }}
          </div>
        </template>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
  import { computed, nextTick, onBeforeUnmount, ref, watch } from 'vue';
  import Hls from 'hls.js';
  import { useMessage } from '/@/hooks/web/useMessage';
  import { normalizeSupportedRpcMethods } from '../services/cameraRpcCapabilities';
  import { getDefaultCameraRpcParams, sendCameraRpc } from '../services/cameraRpcService';
  import type { CameraRuntimeInfo } from '../types/mapPointTypes';

  type CameraRpcAction = {
    label: string;
    method: string;
    params: Record<string, any>;
  };

  const props = defineProps<{
    visible: boolean;
    runtimeInfo?: CameraRuntimeInfo | null;
    loading?: boolean;
    error?: string;
  }>();

  const emit = defineEmits<{
    (e: 'close'): void;
  }>();

  const { showMessage } = useMessage();
  const videoEl = ref<HTMLVideoElement | null>(null);
  const playerLoading = ref(false);
  const playerError = ref('');
  const rpcSending = ref(false);
  const rpcStatusText = ref('');

  let hls: Hls | null = null;

  const playUrl = computed(() => normalizeHlsUrl(props.runtimeInfo?.hlsUrl || props.runtimeInfo?.streamUrl || ''));
  const monitorPageUrl = computed(() => resolveMonitorPageUrl());
  const preferMonitorPage = computed(() => Boolean(monitorPageUrl.value));
  const loadingState = computed(() => Boolean(props.loading) || playerLoading.value);
  const displayMessage = computed(() => props.error || playerError.value);
  const supportedRpcMethods = computed(() => normalizeSupportedRpcMethods(props.runtimeInfo?.supportedRpcMethods));
  const supportsThingsboardRpc = computed(() =>
    ['thingsboardRpc', 'gatewayRpc'].includes(String(props.runtimeInfo?.controlMode || '')),
  );
  const showControlSection = computed(
    () =>
      supportedRpcMethods.value.length > 0 ||
      props.runtimeInfo?.controlMode === 'thingsboardRpc' ||
      props.runtimeInfo?.supportsPtz ||
      props.runtimeInfo?.supportsZoom ||
      props.runtimeInfo?.supportsPreset,
  );
  const controlsDisabled = computed(
    () => rpcSending.value || !supportsThingsboardRpc.value || !props.runtimeInfo?.entityId,
  );
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

  function hasRpcMethod(method: string) {
    return supportedRpcMethods.value.includes(method);
  }

  function buildAction(label: string, method: string): CameraRpcAction {
    return {
      label,
      method,
      params: getDefaultCameraRpcParams(method),
    };
  }

  const directionalActions = computed(() =>
    !props.runtimeInfo?.supportsPtz
      ? []
      : [
          buildAction('上', 'ptz.up'),
          buildAction('下', 'ptz.down'),
          buildAction('左', 'ptz.left'),
          buildAction('右', 'ptz.right'),
        ].filter((item) => hasRpcMethod(item.method)),
  );
  const zoomActions = computed(() =>
    !props.runtimeInfo?.supportsZoom
      ? []
      : [buildAction('放大', 'zoom.in'), buildAction('缩小', 'zoom.out')].filter((item) => hasRpcMethod(item.method)),
  );
  const presetActions = computed(() =>
    !props.runtimeInfo?.supportsPreset
      ? []
      : [buildAction('调用预置位', 'preset.call'), buildAction('保存预置位', 'preset.save')].filter((item) =>
          hasRpcMethod(item.method),
        ),
  );
  const hasDirectionalControls = computed(() => directionalActions.value.length > 0);
  const hasZoomControls = computed(() => zoomActions.value.length > 0);
  const hasPresetControls = computed(() => presetActions.value.length > 0);

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

      if (['localhost:8888', '127.0.0.1:8888'].includes(parsed.host)) {
        const path = parsed.pathname.startsWith('/live/') ? parsed.pathname : `/live${parsed.pathname}`;
        return `${path}${parsed.search}${parsed.hash}`;
      }

      if (parsed.origin === window.location.origin) {
        if (/^\/(?:virtual|sim)-/.test(parsed.pathname)) {
          parsed.pathname = `/live${parsed.pathname}`;
        }

        return `${parsed.pathname}${parsed.search}${parsed.hash}`;
      }

      return parsed.toString();
    } catch {
      return value;
    }
  }

  function getStreamNameFromUrl(rawUrl?: string) {
    const value = String(rawUrl || '').trim();
    if (!value) return '';

    try {
      const parsed = new URL(value, window.location.origin);
      const parts = parsed.pathname
        .replace(/^\/live\/?/, '/')
        .split('/')
        .filter(Boolean);

      if (!parts.length) return '';
      return parts[0] || '';
    } catch {
      return '';
    }
  }

  function resolveMonitorPageUrl() {
    const streamName =
      getStreamNameFromUrl(props.runtimeInfo?.webRtcUrl) ||
      getStreamNameFromUrl(props.runtimeInfo?.hlsUrl) ||
      getStreamNameFromUrl(props.runtimeInfo?.streamUrl) ||
      getStreamNameFromUrl(props.runtimeInfo?.rtspUrl);

    if (!streamName) return '';
    return `http://localhost:8888/${streamName}/`;
  }

  function resolveTransportRpcMethod(actionMethod: string) {
    const configuredMethod = String(props.runtimeInfo?.rpcGatewayMethod || '').trim();
    if (configuredMethod) return configuredMethod;

    return actionMethod;
  }

  function resolveRpcEntityId() {
    const sourceEntityId = String(props.runtimeInfo?.entityId || '').trim();
    const targetEntityId = String(props.runtimeInfo?.rpcTargetDeviceId || '').trim();

    if (props.runtimeInfo?.rpcTargetMode === 'gateway') {
      return targetEntityId || sourceEntityId;
    }

    return sourceEntityId;
  }

  function buildRpcParams(actionMethod: string, params?: Record<string, any>) {
    const baseParams = params || {};

    if (props.runtimeInfo?.rpcPayloadMode !== 'gatewayTopic') {
      return baseParams;
    }

    const cameraId = String(
      props.runtimeInfo?.rpcTargetCameraId ||
        props.runtimeInfo?.cameraId ||
        props.runtimeInfo?.cameraCode ||
        props.runtimeInfo?.entityName ||
        '',
    ).trim();
    const topic = String(props.runtimeInfo?.rpcTopic || (cameraId ? `camera/rpc/${cameraId}` : '')).trim();
    const commandPayload = {
      method: actionMethod,
      command: actionMethod,
      cameraId,
      deviceName: cameraId,
      ...baseParams,
    };

    return {
      ...baseParams,
      method: actionMethod,
      command: actionMethod,
      action: actionMethod,
      cameraId,
      deviceName: cameraId,
      topic,
      payload: commandPayload,
      ts: Date.now(),
    };
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

        if (!currentLine || currentLine.startsWith('#')) {
          continue;
        }

        rememberSessionFromUrl(currentLine);
      }

      for (let index = 0; index < lines.length; index += 1) {
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
      console.warn('[CameraMonitorPopup] Failed to resolve primary HLS playlist, fallback to target URL:', error);
    }

    return normalizedTargetUrl;
  }

  async function initPlayer() {
    destroyPlayer();

    if (!props.visible) return;

    const runtimeInfo = props.runtimeInfo;
    if (!runtimeInfo) return;

    if (!playUrl.value && !preferMonitorPage.value) {
      playerError.value = '未配置视频播放地址';
      return;
    }

    if (runtimeInfo.streamOnline === false) {
      playerError.value = '视频流离线';
      return;
    }

    playerLoading.value = true;

    if (preferMonitorPage.value) {
      clearVideoSource();
      console.info('[CameraMonitorPopup] Loading MediaMTX preview page:', {
        monitorPageUrl: monitorPageUrl.value,
        playUrl: playUrl.value,
        entityId: runtimeInfo.entityId,
        cameraName: runtimeInfo.cameraName,
      });
      return;
    }

    const video = videoEl.value;
    if (!video) return;

    video.muted = true;
    video.autoplay = true;
    video.playsInline = true;

    if (Hls.isSupported()) {
      const streamBaseUrl = new URL('./', new URL(playUrl.value, window.location.origin)).toString();
      const sessionByResource = new Map<string, string>();
      let primaryPlaylistUrl = '';

      const normalizeResourcePath = (pathname: string) => pathname.replace(/^\/live/, '').replace(/\/+/, '/');
      const buildResourceKeys = (pathname: string) => {
        const normalizedPath = normalizeResourcePath(pathname);
        const basename = normalizedPath.split('/').filter(Boolean).pop() || normalizedPath;
        return [normalizedPath, basename];
      };
      const rememberSessionFromUrl = (rawUrl: string) => {
        const resolved = new URL(rawUrl, streamBaseUrl);
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
        const rawValue = String(rawUrl || '').trim();
        const isRelativePath = rawValue && !/^[a-z][a-z0-9+.-]*:/i.test(rawValue) && !rawValue.startsWith('/');
        const normalized = isRelativePath
          ? new URL(rawValue, streamBaseUrl)
          : new URL(normalizeHlsUrl(rawValue), streamBaseUrl);
        normalized.searchParams.delete('cookieCheck');

        if (normalized.origin === window.location.origin && !normalized.searchParams.has('session')) {
          const rememberedSession = resolveRememberedSession(normalized.pathname);
          if (rememberedSession) {
            normalized.searchParams.set('session', rememberedSession);
          }
        }

        if (normalized.origin === window.location.origin) {
          return `${normalized.pathname}${normalized.search}${normalized.hash}`;
        }

        return normalized.toString();
      };
      const isPrimaryPlaylistRequest = (rawUrl: string) => {
        if (!primaryPlaylistUrl) return false;

        const currentUrl = new URL(rawUrl, streamBaseUrl);
        const primaryUrl = new URL(primaryPlaylistUrl, streamBaseUrl);
        return currentUrl.pathname === primaryUrl.pathname;
      };
      const rewritePlaylistText = (playlistText: string) =>
        playlistText
          .split(/\r?\n/)
          .map((line) => {
            const trimmed = line.trim();
            if (!trimmed) return line;

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

      const BaseLoader = Hls.DefaultConfig.loader;
      class CameraMonitorHlsLoader extends BaseLoader {
        override load(context: any, config: any, callbacks: any) {
          if (isPrimaryPlaylistRequest(String(context?.url || ''))) {
            const currentUrl = new URL(String(context.url || ''), streamBaseUrl);
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
        loader: CameraMonitorHlsLoader,
      });

      hls.attachMedia(video);
      hls.on(Hls.Events.MEDIA_ATTACHED, async () => {
        console.info('[CameraMonitorPopup] Loading HLS source:', {
          playUrl: playUrl.value,
          entityId: runtimeInfo.entityId,
          cameraName: runtimeInfo.cameraName,
          webRtcUrl: runtimeInfo.webRtcUrl,
          rtspUrl: runtimeInfo.rtspUrl,
        });
        const resolvedPlaybackUrl = await resolvePrimaryHlsUrl(
          playUrl.value,
          normalizeHlsRequestUrl,
          rememberSessionFromUrl,
        );
        primaryPlaylistUrl = resolvedPlaybackUrl;
        hls?.loadSource(resolvedPlaybackUrl);
      });
      hls.on(Hls.Events.MANIFEST_PARSED, () => {
        playerLoading.value = false;
        void tryPlay(video);
      });
      hls.on(Hls.Events.ERROR, (_event, data) => {
        if (!data.fatal) return;
        console.error('[CameraMonitorPopup] HLS playback failed:', data);
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
    rpcStatusText.value = '';
    emit('close');
  }

  async function sendRpcCommand(method: string, params?: Record<string, any>) {
    const entityId = resolveRpcEntityId();

    if (!entityId) {
      showMessage('未找到摄像头设备 ID，无法发送 RPC', 'error');
      return;
    }

    if (!supportsThingsboardRpc.value) {
      showMessage('当前设备不支持 ThingsBoard RPC 控制', 'warning');
      return;
    }

    rpcSending.value = true;
    rpcStatusText.value = `正在发送 RPC: ${method}`;

    try {
      const transportMethod = resolveTransportRpcMethod(method);
      const rpcParams = buildRpcParams(method, params);
      await sendCameraRpc({
        entityId,
        method: transportMethod,
        params: rpcParams,
        oneWay: props.runtimeInfo?.rpcCallType !== 'twoway',
        timeout: props.runtimeInfo?.rpcTimeout ?? 10000,
        fallbackToLegacyApi: false,
      });
      rpcStatusText.value = `已发送 RPC: ${method}`;
      showMessage(`已发送 RPC: ${method}`, 'success');
      console.info('[CameraMonitorPopup] Camera RPC sent.', {
        entityId,
        sourceEntityId: props.runtimeInfo?.entityId,
        configuredTargetEntityId: props.runtimeInfo?.rpcTargetDeviceId,
        targetDeviceName: props.runtimeInfo?.rpcTargetDeviceName,
        controlMode: props.runtimeInfo?.controlMode,
        rpcTargetMode: props.runtimeInfo?.rpcTargetMode,
        actionMethod: method,
        transportMethod,
        params: rpcParams,
      });
    } catch (error: any) {
      const message = error?.message || '摄像头 RPC 发送失败';
      rpcStatusText.value = `RPC 发送失败: ${method}`;
      showMessage(message, 'error');
      console.error('[CameraMonitorPopup] Camera RPC send failed.', {
        entityId,
        sourceEntityId: props.runtimeInfo?.entityId,
        configuredTargetEntityId: props.runtimeInfo?.rpcTargetDeviceId,
        targetDeviceName: props.runtimeInfo?.rpcTargetDeviceName,
        controlMode: props.runtimeInfo?.controlMode,
        rpcTargetMode: props.runtimeInfo?.rpcTargetMode,
        method,
        params,
        error,
      });
    } finally {
      rpcSending.value = false;
    }
  }

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

  watch(
    () => props.runtimeInfo?.entityId,
    () => {
      rpcStatusText.value = '';
    },
  );

  watch(
    () => props.runtimeInfo,
    (runtimeInfo) => {
      if (!runtimeInfo) return;

      console.log('[Camera RPC] raw supportedRpcMethods:', runtimeInfo.supportedRpcMethods);
      console.log(
        '[Camera RPC] normalized supportedRpcMethods:',
        normalizeSupportedRpcMethods(runtimeInfo.supportedRpcMethods),
      );
      console.log('[Camera RPC] supports:', {
        supportsPtz: runtimeInfo.supportsPtz,
        supportsZoom: runtimeInfo.supportsZoom,
        supportsPreset: runtimeInfo.supportsPreset,
        supportsAudio: runtimeInfo.supportsAudio,
        controlMode: runtimeInfo.controlMode,
        rpcTargetDeviceId: runtimeInfo.rpcTargetDeviceId,
        rpcTargetDeviceName: runtimeInfo.rpcTargetDeviceName,
        rpcTargetCameraId: runtimeInfo.rpcTargetCameraId,
        rpcGatewayMethod: runtimeInfo.rpcGatewayMethod,
        rpcTopic: runtimeInfo.rpcTopic,
        rpcPayloadMode: runtimeInfo.rpcPayloadMode,
        rpcTargetMode: runtimeInfo.rpcTargetMode,
        rpcCallType: runtimeInfo.rpcCallType,
        rpcTimeout: runtimeInfo.rpcTimeout,
      });
    },
    { immediate: true },
  );

  onBeforeUnmount(() => {
    destroyPlayer();
  });
</script>

<style scoped>
  .camera-monitor-popup {
    position: absolute;
    top: 16px;
    right: 16px;
    z-index: 1700;
    width: min(460px, calc(100vw - 24px));
    border-radius: 16px;
    overflow: hidden;
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

  @media (max-width: 768px) {
    .camera-monitor-popup {
      top: 12px;
      right: 12px;
      left: 12px;
      width: auto;
    }

    .camera-monitor-popup__grid {
      grid-template-columns: 1fr;
    }

    .camera-monitor-popup__ptz-grid {
      grid-template-columns: repeat(2, minmax(0, 1fr));
    }
  }
</style>
