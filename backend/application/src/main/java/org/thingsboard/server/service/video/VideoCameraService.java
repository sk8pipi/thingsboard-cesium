/**
 * Copyright © 2016-2025 The Thingsboard Authors
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */
package org.thingsboard.server.service.video;

import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.web.server.ResponseStatusException;
import org.thingsboard.server.queue.util.TbCoreComponent;

import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.UUID;
import java.util.function.Function;
import java.util.stream.Collectors;

@Service
@TbCoreComponent
public class VideoCameraService {

    private static final String DEFAULT_PROVIDER = "WVP_STREAM_PROXY";
    private static final String DEFAULT_APP = "live";
    private static final String DEFAULT_PROTOCOL = "hls";

    private final VideoCameraBindingRepository bindingRepository;
    private final VideoPlaybackSessionManager sessionManager;
    private final Map<String, VideoProvider> providers;

    public VideoCameraService(
            VideoCameraBindingRepository bindingRepository,
            VideoPlaybackSessionManager sessionManager,
            List<VideoProvider> providers) {
        this.bindingRepository = bindingRepository;
        this.sessionManager = sessionManager;
        this.providers = providers.stream().collect(Collectors.toUnmodifiableMap(
                provider -> normalizeProvider(provider.providerType()),
                Function.identity()));
    }

    public VideoCameraBinding getBinding(UUID tenantId, UUID deviceId) {
        return bindingRepository.findByTenantIdAndDeviceId(tenantId, deviceId)
                .orElseThrow(() -> new ResponseStatusException(
                        HttpStatus.NOT_FOUND,
                        "No video binding exists for ThingsBoard device: " + deviceId));
    }

    public VideoCameraBinding saveBinding(UUID tenantId, UUID deviceId, VideoCameraBindingRequest request) {
        return bindingRepository.save(tenantId, deviceId, normalize(request));
    }

    public void deleteBinding(UUID tenantId, UUID deviceId) {
        if (!bindingRepository.delete(tenantId, deviceId)) {
            throw new ResponseStatusException(
                    HttpStatus.NOT_FOUND,
                    "No video binding exists for ThingsBoard device: " + deviceId);
        }
    }

    public List<VideoCameraInfo> listCameras(UUID tenantId) {
        return bindingRepository.findAllByTenantId(tenantId).stream()
                .map(binding -> provider(binding).describe(binding))
                .toList();
    }

    public List<VideoCameraBinding> listBindings(UUID tenantId) {
        return bindingRepository.findAllByTenantId(tenantId);
    }

    public VideoCameraInfo describe(VideoCameraBinding binding) {
        return provider(binding).describe(binding);
    }

    public VideoCameraBinding getBindingByCameraCode(UUID tenantId, String cameraCode) {
        return bindingRepository.findByTenantIdAndCameraCode(tenantId, requireText(cameraCode, "cameraCode"))
                .orElseThrow(() -> new ResponseStatusException(
                        HttpStatus.NOT_FOUND,
                        "No video binding exists for cameraCode: " + cameraCode));
    }

    public VideoCameraDetails getDetails(VideoCameraBinding binding) {
        VideoCameraStatus status = getStatus(binding);
        return new VideoCameraDetails(
                binding.tbDeviceId().toString(),
                binding.cameraCode(),
                binding.provider(),
                binding.providerDeviceId(),
                binding.providerChannelId(),
                binding.mediaServerId(),
                binding.streamApp(),
                binding.streamId(),
                binding.preferredProtocol(),
                binding.enabled(),
                status);
    }

    public VideoCameraStatus getStatus(VideoCameraBinding binding) {
        return sessionManager.getStatus(binding, provider(binding));
    }

    public VideoPlaybackInfo startPlayback(
            VideoCameraBinding binding,
            UUID userId,
            VideoPlayRequest request) {
        if (!binding.enabled()) {
            throw new ResponseStatusException(HttpStatus.CONFLICT, "Video camera binding is disabled");
        }
        return sessionManager.startPlayback(binding, provider(binding), userId, normalizePlayRequest(binding, request));
    }

    public VideoStopResult stopPlayback(
            VideoCameraBinding binding,
            UUID userId,
            VideoStopRequest request,
            boolean allowForce) {
        return sessionManager.stopPlayback(binding, provider(binding), userId, request, allowForce);
    }

    public VideoSnapshot getSnapshot(VideoCameraBinding binding) {
        if (!binding.enabled()) {
            throw new ResponseStatusException(HttpStatus.CONFLICT, "Video camera binding is disabled");
        }
        return sessionManager.getSnapshot(binding, provider(binding));
    }

    public long snapshotCacheSeconds() {
        return sessionManager.snapshotCacheSeconds();
    }

    private VideoProvider provider(VideoCameraBinding binding) {
        VideoProvider provider = providers.get(normalizeProvider(binding.provider()));
        if (provider == null) {
            throw new ResponseStatusException(
                    HttpStatus.NOT_IMPLEMENTED,
                    "Unsupported video provider: " + binding.provider());
        }
        return provider;
    }

    private VideoPlayRequest normalizePlayRequest(VideoCameraBinding binding, VideoPlayRequest request) {
        String protocol = normalizeProtocol(defaultIfBlank(
                request == null ? null : request.protocol(),
                defaultIfBlank(binding.preferredProtocol(), DEFAULT_PROTOCOL)));
        String streamProfile = defaultIfBlank(
                request == null ? null : request.streamProfile(),
                "main").toLowerCase(Locale.ROOT);
        if (!"main".equals(streamProfile)) {
            throw new ResponseStatusException(
                    HttpStatus.BAD_REQUEST,
                    "Unsupported streamProfile: " + streamProfile + ". Only main is currently supported");
        }
        return new VideoPlayRequest(protocol, streamProfile);
    }

    private static String normalizeProtocol(String protocol) {
        String normalized = requireText(protocol, "protocol").toLowerCase(Locale.ROOT);
        if (!DEFAULT_PROTOCOL.equals(normalized)) {
            throw new ResponseStatusException(
                    HttpStatus.BAD_REQUEST,
                    "Unsupported video protocol: " + normalized + ". Only hls is currently supported");
        }
        return normalized;
    }

    private VideoCameraBindingRequest normalize(VideoCameraBindingRequest request) {
        if (request == null) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Video camera binding body is required");
        }
        String cameraCode = requireText(request.cameraCode(), "cameraCode");
        String provider = normalizeProvider(defaultIfBlank(request.provider(), DEFAULT_PROVIDER));
        String streamId = requireText(defaultIfBlank(request.streamId(), cameraCode), "streamId");
        String streamApp = requireText(defaultIfBlank(request.streamApp(), DEFAULT_APP), "streamApp");
        String preferredProtocol = normalizeProtocol(
                defaultIfBlank(request.preferredProtocol(), DEFAULT_PROTOCOL));
        boolean enabled = request.enabled() == null || request.enabled();
        return new VideoCameraBindingRequest(
                cameraCode,
                provider,
                trimToNull(request.providerDeviceId()),
                trimToNull(request.providerChannelId()),
                trimToNull(request.mediaServerId()),
                streamApp,
                streamId,
                preferredProtocol,
                enabled);
    }

    private static String normalizeProvider(String provider) {
        return requireText(provider, "provider").toUpperCase(Locale.ROOT);
    }

    private static String requireText(String value, String field) {
        String normalized = value == null ? "" : value.trim();
        if (normalized.isEmpty()) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, field + " must not be blank");
        }
        return normalized;
    }

    private static String defaultIfBlank(String value, String defaultValue) {
        return value == null || value.isBlank() ? defaultValue : value.trim();
    }

    private static String trimToNull(String value) {
        return value == null || value.isBlank() ? null : value.trim();
    }
}
