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
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.HttpEntity;
import org.springframework.http.HttpHeaders;
import org.springframework.http.HttpMethod;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
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
import java.util.ArrayList;
import java.util.HexFormat;
import java.util.List;
import java.util.Map;

@Service
@TbCoreComponent
public class WvpVideoProvider implements VideoProvider {

    private static final String ACCESS_TOKEN_HEADER = "access-token";
    private static final long TOKEN_CACHE_SECONDS = 600;

    private final RestTemplate restTemplate = new RestTemplate();
    private final boolean enabled;
    private final String baseUrl;
    private final String username;
    private final String password;
    private final String defaultApp;

    private volatile String accessToken;
    private volatile Instant accessTokenExpiresAt = Instant.EPOCH;

    public WvpVideoProvider(
            @Value("${video.wvp.enabled:false}") boolean enabled,
            @Value("${video.wvp.base-url:http://127.0.0.1:18080}") String baseUrl,
            @Value("${video.wvp.username:admin}") String username,
            @Value("${video.wvp.password:}") String password,
            @Value("${video.wvp.default-app:live}") String defaultApp) {
        this.enabled = enabled;
        this.baseUrl = stripTrailingSlash(baseUrl);
        this.username = username;
        this.password = password;
        this.defaultApp = defaultApp;
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
                    stream,
                    name,
                    "WVP_STREAM_PROXY",
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
    public VideoPlaybackInfo startPlayback(String cameraCode) {
        ensureEnabled();
        if (cameraCode == null || cameraCode.isBlank()) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "cameraCode must not be blank");
        }

        JsonNode proxy = authenticatedGet("/api/proxy/one", Map.of("app", defaultApp, "stream", cameraCode));
        int proxyId = proxy.path("id").asInt(0);
        if (proxyId <= 0) {
            throw new ResponseStatusException(HttpStatus.NOT_FOUND, "Camera stream proxy was not found: " + cameraCode);
        }

        JsonNode playback = authenticatedGet("/api/proxy/start", Map.of("id", proxyId));
        String app = textOrDefault(playback, "app", defaultApp);
        String stream = textOrDefault(playback, "stream", cameraCode);
        return new VideoPlaybackInfo(
                cameraCode,
                app,
                stream,
                playback.hasNonNull("mediaInfo"),
                hlsUrl(app, stream),
                flvUrl(app, stream),
                webRtcUrl(app, stream));
    }

    private JsonNode authenticatedGet(String path, Map<String, ?> queryParameters) {
        try {
            return authenticatedGet(path, queryParameters, false);
        } catch (HttpClientErrorException.Unauthorized error) {
            accessToken = null;
            accessTokenExpiresAt = Instant.EPOCH;
            return authenticatedGet(path, queryParameters, true);
        } catch (RestClientException error) {
            throw new ResponseStatusException(HttpStatus.BAD_GATEWAY, "WVP request failed", error);
        }
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
            String message = response == null ? "empty response" : response.path("msg").asText("unknown error");
            throw new ResponseStatusException(HttpStatus.BAD_GATEWAY, "WVP returned an error: " + message);
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