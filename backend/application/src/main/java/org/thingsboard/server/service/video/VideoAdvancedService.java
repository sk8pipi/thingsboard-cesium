/**
 * Copyright © 2016-2025 The Thingsboard Authors
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 */
package org.thingsboard.server.service.video;

import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.web.server.ResponseStatusException;
import org.thingsboard.server.queue.util.TbCoreComponent;
import org.thingsboard.server.service.security.model.SecurityUser;

import java.time.Duration;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Set;
import java.util.UUID;
import java.util.function.Function;
import java.util.stream.Collectors;

@Service
@TbCoreComponent
public class VideoAdvancedService {

    private static final long MAX_RECORDING_RANGE_MS = Duration.ofDays(31).toMillis();
    private static final Set<String> CONTROL_ACTIONS = Set.of("pause", "resume", "seek", "speed");
    private static final Set<Double> PLAYBACK_SPEEDS = Set.of(0.25, 0.5, 1.0, 2.0, 4.0, 8.0);

    private final VideoPtzService ptzService;
    private final VideoRecordingSessionManager recordingSessionManager;
    private final Map<String, VideoProvider> providers;

    public VideoAdvancedService(
            VideoPtzService ptzService,
            VideoRecordingSessionManager recordingSessionManager,
            List<VideoProvider> providers) {
        this.ptzService = ptzService;
        this.recordingSessionManager = recordingSessionManager;
        this.providers = providers.stream().collect(Collectors.toUnmodifiableMap(
                provider -> provider.providerType().toUpperCase(Locale.ROOT),
                Function.identity()));
    }

    public VideoPtzResult controlPtz(
            VideoCameraBinding binding,
            SecurityUser currentUser,
            VideoPtzRequest request) {
        ensureEnabled(binding);
        return ptzService.control(binding, provider(binding), currentUser, request);
    }

    public VideoRecordingList listRecordings(
            VideoCameraBinding binding,
            long startTime,
            long endTime) {
        ensureEnabled(binding);
        VideoRecordingQuery query = validateRange(startTime, endTime);
        return provider(binding).listRecordings(binding, query);
    }

    public VideoRecordingPlaybackInfo startRecordingPlayback(
            VideoCameraBinding binding,
            UUID userId,
            VideoRecordingPlayRequest request) {
        ensureEnabled(binding);
        if (request == null) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Recording playback body is required");
        }
        VideoRecordingQuery range = validateRange(request.startTime(), request.endTime());
        String protocol = request.protocol() == null || request.protocol().isBlank()
                ? "hls"
                : request.protocol().trim().toLowerCase(Locale.ROOT);
        if (!"hls".equals(protocol)) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Only hls recording playback is supported");
        }
        VideoRecordingPlayRequest normalized = new VideoRecordingPlayRequest(
                range.startTime(),
                range.endTime(),
                protocol);
        return recordingSessionManager.start(binding, provider(binding), userId, normalized);
    }

    public VideoRecordingStopResult stopRecordingPlayback(
            VideoCameraBinding binding,
            UUID userId,
            VideoRecordingStopRequest request,
            boolean allowAdmin) {
        return recordingSessionManager.stop(binding, userId, request, allowAdmin);
    }

    public VideoRecordingControlResult controlRecordingPlayback(
            VideoCameraBinding binding,
            UUID userId,
            VideoRecordingControlRequest request,
            boolean allowAdmin) {
        VideoRecordingControlRequest normalized = normalizeControl(request);
        return recordingSessionManager.control(binding, userId, normalized, allowAdmin);
    }

    static VideoRecordingQuery validateRange(long startTime, long endTime) {
        if (startTime <= 0 || endTime <= 0) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "startTime and endTime must be epoch milliseconds");
        }
        if (startTime >= endTime) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "startTime must be earlier than endTime");
        }
        if (endTime - startTime > MAX_RECORDING_RANGE_MS) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Recording query range must not exceed 31 days");
        }
        return new VideoRecordingQuery(startTime, endTime);
    }

    static VideoRecordingControlRequest normalizeControl(VideoRecordingControlRequest request) {
        if (request == null || request.action() == null || request.action().isBlank()) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Recording playback action is required");
        }
        String action = request.action().trim().toLowerCase(Locale.ROOT);
        if (!CONTROL_ACTIONS.contains(action)) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Unsupported recording playback action: " + action);
        }
        if ("seek".equals(action) && (request.positionSeconds() == null || request.positionSeconds() < 0)) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "positionSeconds must be zero or greater for seek");
        }
        if ("speed".equals(action) && (request.speed() == null || !PLAYBACK_SPEEDS.contains(request.speed()))) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "speed must be one of 0.25, 0.5, 1, 2, 4 or 8");
        }
        return new VideoRecordingControlRequest(
                request.sessionId(),
                action,
                request.positionSeconds(),
                request.speed());
    }

    private VideoProvider provider(VideoCameraBinding binding) {
        VideoProvider provider = providers.get(binding.provider().toUpperCase(Locale.ROOT));
        if (provider == null) {
            throw new ResponseStatusException(
                    HttpStatus.NOT_IMPLEMENTED,
                    "Unsupported video provider: " + binding.provider());
        }
        return provider;
    }

    private static void ensureEnabled(VideoCameraBinding binding) {
        if (!binding.enabled()) {
            throw new ResponseStatusException(HttpStatus.CONFLICT, "Video camera binding is disabled");
        }
    }
}
