/**
 * Copyright © 2016-2025 The Thingsboard Authors
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 */
package org.thingsboard.server.service.video;

import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.HttpStatus;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Service;
import org.springframework.web.server.ResponseStatusException;
import org.thingsboard.server.queue.util.TbCoreComponent;

import java.util.Map;
import java.util.UUID;
import java.util.concurrent.ConcurrentHashMap;

@Slf4j
@Service
@TbCoreComponent
public class VideoRecordingSessionManager {

    private final Map<UUID, RecordingSession> sessions = new ConcurrentHashMap<>();
    private final long sessionTtlMs;

    public VideoRecordingSessionManager(
            @Value("${video.recording.session.ttl-seconds:900}") long sessionTtlSeconds) {
        this.sessionTtlMs = Math.max(60, sessionTtlSeconds) * 1000;
    }

    public VideoRecordingPlaybackInfo start(
            VideoCameraBinding binding,
            VideoProvider provider,
            UUID userId,
            VideoRecordingPlayRequest request) {
        VideoRecordingPlaybackSource source = provider.startRecordingPlayback(binding, request);
        long now = System.currentTimeMillis();
        long expiresAt = now + sessionTtlMs;
        UUID sessionId = UUID.randomUUID();
        sessions.put(sessionId, new RecordingSession(binding, provider, userId, source, expiresAt));
        return new VideoRecordingPlaybackInfo(
                binding.tbDeviceId().toString(),
                binding.cameraCode(),
                binding.provider(),
                sessionId.toString(),
                source.app(),
                source.stream(),
                request.protocol(),
                source.url(),
                source.online(),
                request.startTime(),
                request.endTime(),
                expiresAt);
    }

    public VideoRecordingStopResult stop(
            VideoCameraBinding binding,
            UUID userId,
            VideoRecordingStopRequest request,
            boolean allowAdmin) {
        UUID sessionId = requireSessionId(request == null ? null : request.sessionId());
        RecordingSession session = ownedSession(binding, sessionId, userId, allowAdmin);
        session.provider().stopRecordingPlayback(session.binding(), session.source().stream());
        sessions.remove(sessionId, session);
        return new VideoRecordingStopResult(
                binding.tbDeviceId().toString(),
                binding.cameraCode(),
                sessionId.toString(),
                true);
    }

    public VideoRecordingControlResult control(
            VideoCameraBinding binding,
            UUID userId,
            VideoRecordingControlRequest request,
            boolean allowAdmin) {
        UUID sessionId = requireSessionId(request == null ? null : request.sessionId());
        RecordingSession session = ownedSession(binding, sessionId, userId, allowAdmin);
        session.provider().controlRecordingPlayback(
                session.binding(),
                session.source().stream(),
                request);
        return new VideoRecordingControlResult(
                binding.tbDeviceId().toString(),
                binding.cameraCode(),
                sessionId.toString(),
                request.action(),
                true,
                System.currentTimeMillis());
    }

    @Scheduled(fixedDelayString = "${video.recording.session.cleanup-interval-ms:30000}")
    public void cleanupExpiredSessions() {
        long now = System.currentTimeMillis();
        sessions.forEach((sessionId, session) -> {
            if (session.expiresAt() <= now && sessions.remove(sessionId, session)) {
                try {
                    session.provider().stopRecordingPlayback(session.binding(), session.source().stream());
                } catch (RuntimeException error) {
                    log.warn("[{}] Failed to stop expired recording playback {}: {}",
                            session.binding().tbDeviceId(), sessionId, error.getMessage());
                }
            }
        });
    }

    private RecordingSession ownedSession(
            VideoCameraBinding binding,
            UUID sessionId,
            UUID userId,
            boolean allowAdmin) {
        RecordingSession session = sessions.get(sessionId);
        if (session == null || session.expiresAt() <= System.currentTimeMillis()) {
            sessions.remove(sessionId);
            throw new ResponseStatusException(HttpStatus.NOT_FOUND, "Recording playback session was not found");
        }
        if (!session.binding().tbDeviceId().equals(binding.tbDeviceId())) {
            throw new ResponseStatusException(HttpStatus.NOT_FOUND, "Recording playback session was not found");
        }
        if (!allowAdmin && !session.userId().equals(userId)) {
            throw new ResponseStatusException(HttpStatus.FORBIDDEN, "Recording playback session belongs to another user");
        }
        return session;
    }

    private static UUID requireSessionId(String value) {
        if (value == null || value.isBlank()) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Recording playback sessionId is required");
        }
        try {
            return UUID.fromString(value.trim());
        } catch (IllegalArgumentException error) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Invalid recording playback sessionId");
        }
    }

    private record RecordingSession(
            VideoCameraBinding binding,
            VideoProvider provider,
            UUID userId,
            VideoRecordingPlaybackSource source,
            long expiresAt) {
    }
}
