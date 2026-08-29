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
 */package org.thingsboard.server.service.video;

import com.fasterxml.jackson.databind.JsonNode;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Qualifier;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.HttpEntity;
import org.springframework.http.HttpHeaders;
import org.springframework.http.HttpMethod;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.http.client.SimpleClientHttpRequestFactory;
import org.springframework.scheduling.TaskScheduler;
import org.springframework.stereotype.Service;
import org.springframework.web.client.HttpClientErrorException;
import org.springframework.web.client.RestClientException;
import org.springframework.web.client.RestTemplate;
import org.springframework.web.server.ResponseStatusException;
import org.springframework.web.util.UriComponentsBuilder;
import org.springframework.web.util.UriUtils;
import org.thingsboard.server.queue.util.TbCoreComponent;

import java.net.URI;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.time.Instant;
import java.time.LocalDateTime;
import java.time.ZoneId;
import java.time.format.DateTimeFormatter;
import java.util.ArrayList;
import java.util.HexFormat;
import java.util.List;
import java.util.Map;
import java.util.UUID;

@Slf4j
@Service
@TbCoreComponent
public class WvpVideoProvider implements VideoProvider {

    private static final String ACCESS_TOKEN_HEADER = "access-token";
    private static final String PROVIDER_TYPE = "WVP_STREAM_PROXY";
    private static final long TOKEN_CACHE_SECONDS = 600;

    private final RestTemplate restTemplate;
    private final boolean enabled;
    private final String baseUrl;
    private final String username;
    private final String password;
    private final String defaultApp;
    private final ZoneId timeZone;
    private final ZlmVideoClient zlmVideoClient;
    private final TaskScheduler taskScheduler;

    private volatile String accessToken;
    private volatile Instant accessTokenExpiresAt = Instant.EPOCH;

    public WvpVideoProvider(
            ZlmVideoClient zlmVideoClient,
            @Qualifier("taskScheduler") TaskScheduler taskScheduler,
            @Value("${video.wvp.enabled:false}") boolean enabled,
            @Value("${video.wvp.base-url:http://127.0.0.1:18080}") String baseUrl,
            @Value("${video.wvp.username:admin}") String username,
            @Value("${video.wvp.password:}") String password,
            @Value("${video.wvp.default-app:live}") String defaultApp,
            @Value("${video.wvp.time-zone:Asia/Shanghai}") String timeZone,
            @Value("${video.wvp.connect-timeout-ms:5000}") int connectTimeoutMs,
            @Value("${video.wvp.read-timeout-ms:20000}") int readTimeoutMs) {
        this.restTemplate = createRestTemplate(connectTimeoutMs, readTimeoutMs);
        this.zlmVideoClient = zlmVideoClient;
        this.taskScheduler = taskScheduler;
        this.enabled = enabled;
        this.baseUrl = stripTrailingSlash(baseUrl);
        this.username = username;
        this.password = password;
        this.defaultApp = defaultApp;
        this.timeZone = ZoneId.of(timeZone);
    }

    static RestTemplate createRestTemplate(int connectTimeoutMs, int readTimeoutMs) {
        SimpleClientHttpRequestFactory requestFactory = new SimpleClientHttpRequestFactory();
        requestFactory.setConnectTimeout(Math.max(1000, connectTimeoutMs));
        requestFactory.setReadTimeout(Math.max(1000, readTimeoutMs));
        return new RestTemplate(requestFactory);
    }

    @Override
    public String providerType() {
        return PROVIDER_TYPE;
    }

    @Override
    public List<VideoCameraInfo> listCameras() {
        ensureEnabled();
        JsonNode page = authenticatedGet("/api/proxy/list", Map.of("page", 1, "count", 1000));
        JsonNode proxies = page.path("list");
        if (!proxies.isArray()) {
            return List.of();
        }

        List<VideoCameraInfo> cameras = new ArrayList<>();
        for (JsonNode proxy : proxies) {
            String app = textOrDefault(proxy, "app", defaultApp);
            String stream = textOrDefault(proxy, "stream", "");
            if (stream.isBlank()) {
                continue;
            }
            String name = textOrDefault(proxy, "gbName", stream);
            cameras.add(new VideoCameraInfo(
                    null,
                    stream,
                    name,
                    PROVIDER_TYPE,
                    PROVIDER_TYPE,
                    app,
                    stream,
                    proxy.path("enable").asBoolean(false),
                    proxy.path("pulling").asBoolean(false),
                    hlsUrl(app, stream),
                    flvUrl(app, stream)));
        }
        return cameras;
    }

    @Override
    public VideoCameraInfo describe(VideoCameraBinding binding) {
        ensureEnabled();
        JsonNode proxy = authenticatedGet("/api/proxy/one", Map.of(
                "app", binding.streamApp(),
                "stream", binding.streamId()));
        boolean exists = proxy.path("id").asInt(0) > 0;
        String name = textOrDefault(proxy, "gbName", binding.cameraCode());
        VideoProviderStatus providerStatus = getStatus(binding);
        return new VideoCameraInfo(
                binding.tbDeviceId().toString(),
                binding.cameraCode(),
                name,
                binding.provider(),
                PROVIDER_TYPE,
                binding.streamApp(),
                binding.streamId(),
                binding.enabled(),
                exists && providerStatus.online(),
                hlsUrl(binding.streamApp(), binding.streamId()),
                flvUrl(binding.streamApp(), binding.streamId()));
    }

    @Override
    public VideoPlaybackInfo startPlayback(VideoCameraBinding binding, VideoPlayRequest request) {
        ensureEnabled();
        JsonNode proxy = authenticatedGet("/api/proxy/one", Map.of(
                "app", binding.streamApp(),
                "stream", binding.streamId()));
        int proxyId = proxy.path("id").asInt(0);
        if (proxyId <= 0) {
            throw new ResponseStatusException(
                    HttpStatus.NOT_FOUND,
                    "Camera stream proxy was not found: " + binding.streamApp() + "/" + binding.streamId());
        }

        JsonNode playback = authenticatedGet("/api/proxy/start", Map.of("id", proxyId));
        String app = textOrDefault(playback, "app", binding.streamApp());
        String stream = textOrDefault(playback, "stream", binding.streamId());
        return new VideoPlaybackInfo(
                binding.tbDeviceId().toString(),
                binding.cameraCode(),
                binding.provider(),
                app,
                stream,
                playback.hasNonNull("mediaInfo"),
                hlsUrl(app, stream),
                request.protocol(),
                hlsUrl(app, stream),
                flvUrl(app, stream),
                webRtcUrl(app, stream),
                null,
                playback.hasNonNull("mediaInfo") ? VideoStreamStatus.READY : VideoStreamStatus.DEGRADED,
                0,
                0,
                new VideoPlaybackAlternates(webRtcUrl(app, stream), flvUrl(app, stream)));
    }

    @Override
    public VideoProviderStatus getStatus(VideoCameraBinding binding) {
        ensureEnabled();
        if (zlmVideoClient.isConfigured()) {
            return zlmVideoClient.getStatus(binding);
        }
        JsonNode proxy = authenticatedGet("/api/proxy/one", Map.of(
                "app", binding.streamApp(),
                "stream", binding.streamId()));
        boolean online = proxy.path("id").asInt(0) > 0 && proxy.path("pulling").asBoolean(false);
        return new VideoProviderStatus(
                online ? VideoStreamStatus.READY : VideoStreamStatus.OFFLINE,
                online,
                0,
                "ZLMediaKit status integration is not configured",
                System.currentTimeMillis());
    }

    @Override
    public void stopPlayback(VideoCameraBinding binding) {
        ensureEnabled();
        JsonNode proxy = authenticatedGet("/api/proxy/one", Map.of(
                "app", binding.streamApp(),
                "stream", binding.streamId()));
        int proxyId = proxy.path("id").asInt(0);
        if (proxyId > 0) {
            authenticatedGetVoid("/api/proxy/stop", Map.of("id", proxyId));
        }
    }

    @Override
    public VideoSnapshot getSnapshot(VideoCameraBinding binding) {
        ensureEnabled();
        return zlmVideoClient.getSnapshot(binding);
    }

    @Override
    public VideoPtzResult controlPtz(VideoCameraBinding binding, VideoPtzRequest request) {
        ensureEnabled();
        requireGbChannel(binding);
        VideoPtzRequest normalized = VideoPtzService.normalize(request);
        UUID requestId = UUID.randomUUID();
        long now = System.currentTimeMillis();
        if (normalized.command().startsWith("preset.")) {
            String operation = switch (normalized.command()) {
                case "preset.save" -> "add";
                case "preset.call" -> "call";
                case "preset.delete" -> "delete";
                default -> throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Unsupported preset command");
            };
            authenticatedGet(
                    "/api/front-end/preset/" + operation + "/" + encode(binding.providerDeviceId())
                            + "/" + encode(binding.providerChannelId()),
                    Map.of("presetId", normalized.presetId()));
        } else {
            String command = switch (normalized.command()) {
                case "ptz.up" -> "up";
                case "ptz.down" -> "down";
                case "ptz.left" -> "left";
                case "ptz.right" -> "right";
                case "ptz.up-left" -> "upleft";
                case "ptz.up-right" -> "upright";
                case "ptz.down-left" -> "downleft";
                case "ptz.down-right" -> "downright";
                case "ptz.stop" -> "stop";
                case "zoom.in" -> "zoomin";
                case "zoom.out" -> "zoomout";
                default -> throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Unsupported WVP PTZ command");
            };
            int movementSpeed = Math.max(1, Math.round(normalized.speed() * 255 / 100.0f));
            int zoomSpeed = Math.max(1, Math.round(normalized.speed() * 15 / 100.0f));
            authenticatedGet(
                    "/api/front-end/ptz/" + encode(binding.providerDeviceId())
                            + "/" + encode(binding.providerChannelId()),
                    Map.of(
                            "command", command,
                            "horizonSpeed", movementSpeed,
                            "verticalSpeed", movementSpeed,
                            "zoomSpeed", zoomSpeed));
            if (normalized.durationMs() != null && !"ptz.stop".equals(normalized.command())) {
                schedulePtzStop(binding, normalized.durationMs());
            }
        }
        return new VideoPtzResult(
                binding.tbDeviceId().toString(),
                binding.cameraCode(),
                binding.provider(),
                "wvp-gb28181",
                normalized.command(),
                true,
                requestId.toString(),
                now);
    }

    @Override
    public VideoRecordingList listRecordings(VideoCameraBinding binding, VideoRecordingQuery query) {
        ensureEnabled();
        requireGbChannel(binding);
        JsonNode data = authenticatedGet(
                "/api/gb_record/query/" + encode(binding.providerDeviceId())
                        + "/" + encode(binding.providerChannelId()),
                Map.of(
                        "startTime", formatProviderTime(query.startTime()),
                        "endTime", formatProviderTime(query.endTime())));
        JsonNode recordList = data.path("recordList");
        if (!recordList.isArray()) {
            recordList = recordList.path("item");
        }
        List<VideoRecordingItem> recordings = new ArrayList<>();
        if (recordList.isArray()) {
            for (JsonNode record : recordList) {
                long start = parseProviderTime(textFirst(record, "startTime", "start"));
                long end = parseProviderTime(textFirst(record, "endTime", "end"));
                if (start <= 0 || end <= start) {
                    continue;
                }
                String recordingId = textFirst(record, "filePath", "name", "address");
                if (recordingId.isBlank()) {
                    recordingId = start + "-" + end;
                }
                recordings.add(new VideoRecordingItem(
                        recordingId,
                        start,
                        end,
                        end - start,
                        nullableLong(record, "fileSize"),
                        textFirst(record, "type", "recordType")));
            }
        }
        int total = data.path("sumNum").asInt(recordings.size());
        return new VideoRecordingList(
                binding.tbDeviceId().toString(),
                binding.cameraCode(),
                query.startTime(),
                query.endTime(),
                total,
                List.copyOf(recordings));
    }

    @Override
    public VideoRecordingPlaybackSource startRecordingPlayback(
            VideoCameraBinding binding,
            VideoRecordingPlayRequest request) {
        ensureEnabled();
        requireGbChannel(binding);
        JsonNode playback = authenticatedGet(
                "/api/playback/start/" + encode(binding.providerDeviceId())
                        + "/" + encode(binding.providerChannelId()),
                Map.of(
                        "startTime", formatProviderTime(request.startTime()),
                        "endTime", formatProviderTime(request.endTime())));
        JsonNode mediaInfo = playback.path("mediaInfo");
        String app = textOrDefault(playback, "app", textOrDefault(mediaInfo, "app", "rtp"));
        String stream = textOrDefault(playback, "stream",
                textOrDefault(playback, "streamId", textOrDefault(mediaInfo, "stream", "")));
        if (stream.isBlank()) {
            throw new ResponseStatusException(HttpStatus.BAD_GATEWAY, "WVP playback did not return a stream ID");
        }
        return new VideoRecordingPlaybackSource(
                app,
                stream,
                !mediaInfo.isMissingNode() && !mediaInfo.isNull(),
                hlsUrl(app, stream));
    }

    @Override
    public void stopRecordingPlayback(VideoCameraBinding binding, String providerStreamId) {
        ensureEnabled();
        requireGbChannel(binding);
        authenticatedGet(
                "/api/playback/stop/" + encode(binding.providerDeviceId())
                        + "/" + encode(binding.providerChannelId())
                        + "/" + encode(providerStreamId),
                Map.of());
    }

    @Override
    public void controlRecordingPlayback(
            VideoCameraBinding binding,
            String providerStreamId,
            VideoRecordingControlRequest request) {
        ensureEnabled();
        String stream = encode(providerStreamId);
        String path;
        switch (request.action()) {
            case "pause" -> path = "/api/playback/pause/" + stream;
            case "resume" -> path = "/api/playback/resume/" + stream;
            case "seek" -> path = "/api/playback/seek/" + stream + "/" + request.positionSeconds();
            case "speed" -> path = "/api/playback/speed/" + stream + "/" + formatSpeed(request.speed());
            default -> throw new ResponseStatusException(
                    HttpStatus.BAD_REQUEST,
                    "Unsupported recording playback action: " + request.action());
        }
        authenticatedGet(path, Map.of());
    }

    private void schedulePtzStop(VideoCameraBinding binding, int durationMs) {
        taskScheduler.schedule(() -> {
            try {
                authenticatedGet(
                        "/api/front-end/ptz/" + encode(binding.providerDeviceId())
                                + "/" + encode(binding.providerChannelId()),
                        Map.of(
                                "command", "stop",
                                "horizonSpeed", 1,
                                "verticalSpeed", 1,
                                "zoomSpeed", 1));
            } catch (RuntimeException error) {
                log.warn("[{}] Failed to send scheduled WVP PTZ stop: {}",
                        binding.tbDeviceId(), error.getMessage());
            }
        }, Instant.ofEpochMilli(System.currentTimeMillis() + durationMs));
    }

    private void requireGbChannel(VideoCameraBinding binding) {
        if (binding.providerDeviceId() == null || binding.providerDeviceId().isBlank()
                || binding.providerChannelId() == null || binding.providerChannelId().isBlank()) {
            throw new ResponseStatusException(
                    HttpStatus.NOT_IMPLEMENTED,
                    "This operation requires providerDeviceId and providerChannelId in the camera binding");
        }
    }

    private String formatProviderTime(long timestamp) {
        return DateTimeFormatter.ofPattern("yyyy-MM-dd HH:mm:ss")
                .format(Instant.ofEpochMilli(timestamp).atZone(timeZone));
    }

    private long parseProviderTime(String value) {
        if (value == null || value.isBlank()) {
            return 0;
        }
        try {
            return LocalDateTime.parse(value, DateTimeFormatter.ofPattern("yyyy-MM-dd HH:mm:ss"))
                    .atZone(timeZone)
                    .toInstant()
                    .toEpochMilli();
        } catch (RuntimeException error) {
            try {
                return Instant.parse(value).toEpochMilli();
            } catch (RuntimeException ignored) {
                return 0;
            }
        }
    }

    private String textFirst(JsonNode node, String... fields) {
        for (String field : fields) {
            String value = node.path(field).asText("");
            if (!value.isBlank()) {
                return value;
            }
        }
        return "";
    }

    private Long nullableLong(JsonNode node, String field) {
        JsonNode value = node.path(field);
        if (value.isIntegralNumber()) {
            return value.asLong();
        }
        try {
            String text = value.asText("");
            return text.isBlank() ? null : Long.parseLong(text);
        } catch (NumberFormatException error) {
            return null;
        }
    }

    private String formatSpeed(Double speed) {
        if (speed == null) {
            return "1";
        }
        return speed == Math.rint(speed) ? Long.toString(speed.longValue()) : speed.toString();
    }

    private JsonNode authenticatedGet(String path, Map<String, ?> queryParameters) {
        try {
            return authenticatedGet(path, queryParameters, false);
        } catch (HttpClientErrorException.Unauthorized error) {
            accessToken = null;
            accessTokenExpiresAt = Instant.EPOCH;
            try {
                return authenticatedGet(path, queryParameters, true);
            } catch (RestClientException retryError) {
                throw wvpRequestFailed(retryError);
            }
        } catch (RestClientException error) {
            throw wvpRequestFailed(error);
        }
    }

    private void authenticatedGetVoid(String path, Map<String, ?> queryParameters) {
        try {
            authenticatedGetVoid(path, queryParameters, false);
        } catch (HttpClientErrorException.Unauthorized error) {
            accessToken = null;
            accessTokenExpiresAt = Instant.EPOCH;
            try {
                authenticatedGetVoid(path, queryParameters, true);
            } catch (RestClientException retryError) {
                throw wvpRequestFailed(retryError);
            }
        } catch (RestClientException error) {
            throw wvpRequestFailed(error);
        }
    }

    private ResponseStatusException wvpRequestFailed(RestClientException error) {
        return new ResponseStatusException(HttpStatus.BAD_GATEWAY, "WVP request failed", error);
    }

    private void authenticatedGetVoid(String path, Map<String, ?> queryParameters, boolean forceLogin) {
        String token = getAccessToken(forceLogin);
        HttpHeaders headers = new HttpHeaders();
        headers.set(ACCESS_TOKEN_HEADER, token);
        URI uri = buildUri(path, queryParameters);
        restTemplate.exchange(uri, HttpMethod.GET, new HttpEntity<>(headers), Void.class);
    }

    private JsonNode authenticatedGet(String path, Map<String, ?> queryParameters, boolean forceLogin) {
        String token = getAccessToken(forceLogin);
        HttpHeaders headers = new HttpHeaders();
        headers.set(ACCESS_TOKEN_HEADER, token);
        URI uri = buildUri(path, queryParameters);
        ResponseEntity<JsonNode> response = restTemplate.exchange(uri, HttpMethod.GET, new HttpEntity<>(headers), JsonNode.class);
        return unwrap(response.getBody());
    }

    private synchronized String getAccessToken(boolean forceLogin) {
        if (!forceLogin && accessToken != null && Instant.now().isBefore(accessTokenExpiresAt)) {
            return accessToken;
        }
        if (password.isBlank()) {
            throw new ResponseStatusException(HttpStatus.SERVICE_UNAVAILABLE, "VIDEO_WVP_PASSWORD is not configured");
        }

        URI uri = buildUri("/api/user/login", Map.of("username", username, "password", md5(password)));
        try {
            JsonNode data = unwrap(restTemplate.getForObject(uri, JsonNode.class));
            String token = data.path("accessToken").asText("");
            if (token.isBlank()) {
                throw new ResponseStatusException(HttpStatus.BAD_GATEWAY, "WVP login did not return an access token");
            }
            accessToken = token;
            accessTokenExpiresAt = Instant.now().plusSeconds(TOKEN_CACHE_SECONDS);
            return token;
        } catch (RestClientException error) {
            throw new ResponseStatusException(HttpStatus.BAD_GATEWAY, "WVP login failed", error);
        }
    }

    private JsonNode unwrap(JsonNode response) {
        if (response == null || response.path("code").asInt(-1) != 0) {
            throw new ResponseStatusException(HttpStatus.BAD_GATEWAY, "WVP returned an error");
        }
        return response.path("data");
    }

    private URI buildUri(String path, Map<String, ?> queryParameters) {
        UriComponentsBuilder builder = UriComponentsBuilder.fromUriString(baseUrl).path(path);
        queryParameters.forEach(builder::queryParam);
        return builder.build().encode().toUri();
    }

    private String hlsUrl(String app, String stream) {
        return "/video-stream/" + encode(app) + "/" + encode(stream) + "/hls.m3u8";
    }

    private String flvUrl(String app, String stream) {
        return "/video-stream/" + encode(app) + "/" + encode(stream) + ".live.flv";
    }

    private String webRtcUrl(String app, String stream) {
        return "/video-stream/index/api/webrtc?app=" + encode(app) + "&stream=" + encode(stream) + "&type=play";
    }

    private String encode(String value) {
        return UriUtils.encodePathSegment(value, StandardCharsets.UTF_8);
    }

    private String textOrDefault(JsonNode node, String field, String defaultValue) {
        String value = node.path(field).asText("");
        return value.isBlank() ? defaultValue : value;
    }

    private void ensureEnabled() {
        if (!enabled) {
            throw new ResponseStatusException(HttpStatus.SERVICE_UNAVAILABLE, "WVP video integration is disabled");
        }
    }

    private static String md5(String value) {
        try {
            MessageDigest digest = MessageDigest.getInstance("MD5");
            return HexFormat.of().formatHex(digest.digest(value.getBytes(StandardCharsets.UTF_8)));
        } catch (NoSuchAlgorithmException error) {
            throw new IllegalStateException("MD5 is not available", error);
        }
    }

    private static String stripTrailingSlash(String value) {
        String normalized = value == null ? "" : value.trim();
        while (normalized.endsWith("/")) {
            normalized = normalized.substring(0, normalized.length() - 1);
        }
        return normalized;
    }

}