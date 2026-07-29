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

import com.fasterxml.jackson.databind.JsonNode;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.HttpEntity;
import org.springframework.http.HttpMethod;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.http.client.SimpleClientHttpRequestFactory;
import org.springframework.stereotype.Service;
import org.springframework.web.client.RestClientException;
import org.springframework.web.client.RestTemplate;
import org.springframework.web.server.ResponseStatusException;
import org.springframework.web.util.UriComponentsBuilder;
import org.springframework.web.util.UriUtils;
import org.thingsboard.server.queue.util.TbCoreComponent;

import java.net.URI;
import java.nio.charset.StandardCharsets;

@Service
@TbCoreComponent
public class ZlmVideoClient {

    private static final String DEFAULT_CONTENT_TYPE = MediaType.IMAGE_JPEG_VALUE;

    private final RestTemplate restTemplate;
    private final boolean enabled;
    private final String baseUrl;
    private final String secret;
    private final String rtspBaseUrl;
    private final int snapshotTimeoutSeconds;
    private final int snapshotExpireSeconds;
    private final int snapshotMaxBytes;

    public ZlmVideoClient(
            @Value("${video.zlm.enabled:false}") boolean enabled,
            @Value("${video.zlm.base-url:http://127.0.0.1:18081}") String baseUrl,
            @Value("${video.zlm.secret:}") String secret,
            @Value("${video.zlm.rtsp-base-url:rtsp://127.0.0.1:10002}") String rtspBaseUrl,
            @Value("${video.zlm.snapshot-timeout-seconds:10}") int snapshotTimeoutSeconds,
            @Value("${video.zlm.snapshot-expire-seconds:3}") int snapshotExpireSeconds,
            @Value("${video.zlm.snapshot-max-bytes:5242880}") int snapshotMaxBytes,
            @Value("${video.zlm.connect-timeout-ms:5000}") int connectTimeoutMs,
            @Value("${video.zlm.read-timeout-ms:20000}") int readTimeoutMs) {
        this.enabled = enabled;
        this.baseUrl = stripTrailingSlash(baseUrl);
        this.secret = secret == null ? "" : secret.trim();
        this.rtspBaseUrl = stripTrailingSlash(rtspBaseUrl);
        this.snapshotTimeoutSeconds = Math.max(1, snapshotTimeoutSeconds);
        this.snapshotExpireSeconds = Math.max(1, snapshotExpireSeconds);
        this.snapshotMaxBytes = Math.max(1024, snapshotMaxBytes);
        SimpleClientHttpRequestFactory requestFactory = new SimpleClientHttpRequestFactory();
        requestFactory.setConnectTimeout(Math.max(1000, connectTimeoutMs));
        requestFactory.setReadTimeout(Math.max(1000, readTimeoutMs));
        this.restTemplate = new RestTemplate(requestFactory);
    }

    public boolean isConfigured() {
        return enabled && !baseUrl.isBlank() && !secret.isBlank();
    }

    public VideoProviderStatus getStatus(VideoCameraBinding binding) {
        ensureConfigured();
        URI uri = zlmUri("/index/api/getMediaList")
                .queryParam("app", binding.streamApp())
                .queryParam("stream", binding.streamId())
                .build()
                .encode()
                .toUri();
        try {
            JsonNode response = restTemplate.getForObject(uri, JsonNode.class);
            JsonNode mediaList = unwrap(response);
            boolean online = mediaList.isArray() && !mediaList.isEmpty();
            int readerCount = 0;
            if (online) {
                for (JsonNode media : mediaList) {
                    readerCount = Math.max(
                            readerCount,
                            media.path("totalReaderCount").asInt(media.path("readerCount").asInt(0)));
                }
            }
            long now = System.currentTimeMillis();
            return new VideoProviderStatus(
                    online ? VideoStreamStatus.READY : VideoStreamStatus.OFFLINE,
                    online,
                    readerCount,
                    null,
                    now);
        } catch (RestClientException error) {
            throw new ResponseStatusException(HttpStatus.BAD_GATEWAY, "ZLMediaKit status request failed");
        }
    }

    public VideoSnapshot getSnapshot(VideoCameraBinding binding) {
        ensureConfigured();
        String streamUrl = rtspBaseUrl
                + "/"
                + encode(binding.streamApp())
                + "/"
                + encode(binding.streamId());
        URI uri = zlmUri("/index/api/getSnap")
                .queryParam("url", streamUrl)
                .queryParam("timeout_sec", snapshotTimeoutSeconds)
                .queryParam("expire_sec", snapshotExpireSeconds)
                .build()
                .encode()
                .toUri();
        try {
            ResponseEntity<byte[]> response = restTemplate.exchange(
                    uri,
                    HttpMethod.GET,
                    HttpEntity.EMPTY,
                    byte[].class);
            byte[] data = response.getBody();
            if (!response.getStatusCode().is2xxSuccessful() || data == null || data.length == 0) {
                throw new ResponseStatusException(HttpStatus.BAD_GATEWAY, "ZLMediaKit returned an empty snapshot");
            }
            if (data.length > snapshotMaxBytes) {
                throw new ResponseStatusException(HttpStatus.BAD_GATEWAY, "ZLMediaKit snapshot exceeded the size limit");
            }
            MediaType mediaType = response.getHeaders().getContentType();
            String contentType = mediaType == null ? DEFAULT_CONTENT_TYPE : mediaType.toString();
            if (!contentType.toLowerCase().startsWith("image/")) {
                throw new ResponseStatusException(HttpStatus.BAD_GATEWAY, "ZLMediaKit returned a non-image snapshot");
            }
            return new VideoSnapshot(data, contentType, System.currentTimeMillis());
        } catch (RestClientException error) {
            throw new ResponseStatusException(HttpStatus.BAD_GATEWAY, "ZLMediaKit snapshot request failed");
        }
    }

    private UriComponentsBuilder zlmUri(String path) {
        return UriComponentsBuilder.fromUriString(baseUrl)
                .path(path)
                .queryParam("secret", secret);
    }

    private JsonNode unwrap(JsonNode response) {
        if (response == null || response.path("code").asInt(-1) != 0) {
            throw new ResponseStatusException(HttpStatus.BAD_GATEWAY, "ZLMediaKit returned an error");
        }
        return response.path("data");
    }

    private void ensureConfigured() {
        if (!isConfigured()) {
            throw new ResponseStatusException(
                    HttpStatus.SERVICE_UNAVAILABLE,
                    "ZLMediaKit integration is not configured");
        }
    }

    private static String encode(String value) {
        return UriUtils.encodePathSegment(value, StandardCharsets.UTF_8);
    }

    private static String stripTrailingSlash(String value) {
        String normalized = value == null ? "" : value.trim();
        while (normalized.endsWith("/")) {
            normalized = normalized.substring(0, normalized.length() - 1);
        }
        return normalized;
    }
}
