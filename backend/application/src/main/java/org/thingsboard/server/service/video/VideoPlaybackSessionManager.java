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

import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Qualifier;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.HttpStatus;
import org.springframework.scheduling.TaskScheduler;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Service;
import org.springframework.web.server.ResponseStatusException;
import org.thingsboard.server.queue.util.TbCoreComponent;

import java.time.Instant;
import java.util.HashMap;
import java.util.Map;
import java.util.UUID;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.ScheduledFuture;

@Slf4j
@Service
@TbCoreComponent
public class VideoPlaybackSessionManager {

    private final TaskScheduler taskScheduler;
    private final long sessionTtlMs;
    private final long stopDelayMs;
    private final long snapshotCacheMs;
    private final Map<UUID, CameraRuntime> runtimes = new ConcurrentHashMap<>();

    public VideoPlaybackSessionManager(
            @Qualifier("taskScheduler") TaskScheduler taskScheduler,
            @Value("${video.session.ttl-seconds:900}") long sessionTtlSeconds,
            @Value("${video.session.stop-delay-seconds:20}") long stopDelaySeconds,
            @Value("${video.snapshot.cache-seconds:5}") long snapshotCacheSeconds) {
        this.taskScheduler = taskScheduler;
        this.sessionTtlMs = Math.max(60, sessionTtlSeconds) * 1000;
        this.stopDelayMs = Math.max(0, stopDelaySeconds) * 1000;
        this.snapshotCacheMs = Math.max(0, snapshotCacheSeconds) * 1000;
    }

    public VideoPlaybackInfo startPlayback(
            VideoCameraBinding binding,
            VideoProvider provider,
            UUID userId,
            VideoPlayRequest request) {
        CameraRuntime runtime = runtime(binding);
        synchronized (runtime) {
            runtime.binding = binding;
            runtime.provider = provider;
            removeExpiredSessions(runtime, System.currentTimeMillis());
            cancelScheduledStop(runtime);
            runtime.status = VideoStreamStatus.STARTING;
            runtime.message = null;
            runtime.updatedAt = System.currentTimeMillis();
            try {
                VideoPlaybackInfo playback = provider.startPlayback(binding, request);
                long now = System.currentTimeMillis();
                long expiresAt = now + sessionTtlMs;
                UUID sessionId = UUID.randomUUID();
                runtime.sessions.put(sessionId, new SessionLease(userId, expiresAt));
                runtime.lastPlayback = playback;
                runtime.online = playback.online();
                runtime.status = playback.online() ? VideoStreamStatus.READY : VideoStreamStatus.DEGRADED;
                runtime.message = playback.online() ? null : "Provider did not confirm that the stream is ready";
                runtime.updatedAt = now;
                return playback.withSession(
                        sessionId.toString(),
                        runtime.status,
                        runtime.sessions.size(),
                        expiresAt);
            } catch (ResponseStatusException error) {
                runtime.status = VideoStreamStatus.FAILED;
                runtime.online = false;
                runtime.message = reason(error);
                runtime.updatedAt = System.currentTimeMillis();
                throw error;
            }
        }
    }

    public VideoCameraStatus getStatus(VideoCameraBinding binding, VideoProvider provider) {
        CameraRuntime runtime = runtime(binding);
        synchronized (runtime) {
            runtime.binding = binding;
            runtime.provider = provider;
            int previousSessionCount = runtime.sessions.size();
            removeExpiredSessions(runtime, System.currentTimeMillis());
            if (previousSessionCount > 0 && runtime.sessions.isEmpty()) {
                scheduleStop(runtime);
            }
            try {
                VideoProviderStatus providerStatus = provider.getStatus(binding);
                runtime.online = providerStatus.online();
                runtime.readerCount = providerStatus.readerCount();
                if (runtime.scheduledStop != null && providerStatus.online()) {
                    runtime.status = VideoStreamStatus.STOPPING;
                } else {
                    runtime.status = providerStatus.status();
                }
                runtime.message = providerStatus.message();
                runtime.updatedAt = providerStatus.updatedAt();
            } catch (ResponseStatusException error) {
                runtime.status = VideoStreamStatus.DEGRADED;
                runtime.message = reason(error);
                runtime.updatedAt = System.currentTimeMillis();
            }
            return toStatus(binding, runtime);
        }
    }

    public VideoStopResult stopPlayback(
            VideoCameraBinding binding,
            VideoProvider provider,
            UUID userId,
            VideoStopRequest request,
            boolean allowForce) {
        CameraRuntime runtime = runtime(binding);
        boolean force = request != null && Boolean.TRUE.equals(request.force());
        UUID requestedSessionId = parseSessionId(request == null ? null : request.sessionId());
        boolean stopImmediately = false;
        synchronized (runtime) {
            runtime.binding = binding;
            runtime.provider = provider;
            removeExpiredSessions(runtime, System.currentTimeMillis());
            if (force) {
                if (!allowForce) {
                    throw new ResponseStatusException(
                            HttpStatus.FORBIDDEN,
                            "Only tenant administrators may force-stop a camera stream");
                }
                runtime.sessions.clear();
                cancelScheduledStop(runtime);
                stopImmediately = true;
            } else if (requestedSessionId != null) {
                SessionLease session = runtime.sessions.get(requestedSessionId);
                if (session == null) {
                    throw new ResponseStatusException(HttpStatus.NOT_FOUND, "Video playback session was not found");
                }
                if (!session.userId().equals(userId)) {
                    throw new ResponseStatusException(
                            HttpStatus.FORBIDDEN,
                            "The video playback session belongs to another user");
                }
                runtime.sessions.remove(requestedSessionId);
            } else {
                runtime.sessions.entrySet().removeIf(entry -> entry.getValue().userId().equals(userId));
            }

            if (!stopImmediately && runtime.sessions.isEmpty()) {
                scheduleStop(runtime);
            }
        }

        if (stopImmediately) {
            stopNow(runtime, true);
        }

        synchronized (runtime) {
            return new VideoStopResult(
                    binding.tbDeviceId().toString(),
                    binding.cameraCode(),
                    requestedSessionId == null ? null : requestedSessionId.toString(),
                    runtime.status,
                    runtime.sessions.size(),
                    nullableTimestamp(runtime.scheduledStopAt));
        }
    }

    public VideoSnapshot getSnapshot(VideoCameraBinding binding, VideoProvider provider) {
        CameraRuntime runtime = runtime(binding);
        synchronized (runtime) {
            long now = System.currentTimeMillis();
            if (runtime.snapshot != null && now - runtime.snapshot.capturedAt() <= snapshotCacheMs) {
                return runtime.snapshot;
            }
            VideoSnapshot snapshot = provider.getSnapshot(binding);
            runtime.snapshot = snapshot;
            runtime.updatedAt = now;
            return snapshot;
        }
    }

    public long snapshotCacheSeconds() {
        return snapshotCacheMs / 1000;
    }

    @Scheduled(fixedDelayString = "${video.session.cleanup-interval-ms:30000}")
    public void cleanupExpiredSessions() {
        long now = System.currentTimeMillis();
        for (CameraRuntime runtime : runtimes.values()) {
            synchronized (runtime) {
                int previousSize = runtime.sessions.size();
                removeExpiredSessions(runtime, now);
                if (previousSize > 0
                        && runtime.sessions.isEmpty()
                        && runtime.binding != null
                        && runtime.provider != null) {
                    scheduleStop(runtime);
                }
            }
        }
    }

    private CameraRuntime runtime(VideoCameraBinding binding) {
        return runtimes.computeIfAbsent(binding.tbDeviceId(), ignored -> new CameraRuntime(binding));
    }

    private void scheduleStop(CameraRuntime runtime) {
        if (runtime.scheduledStop != null || !runtime.sessions.isEmpty()) {
            return;
        }
        runtime.status = VideoStreamStatus.STOPPING;
        runtime.scheduledStopAt = System.currentTimeMillis() + stopDelayMs;
        runtime.updatedAt = System.currentTimeMillis();
        VideoCameraBinding binding = runtime.binding;
        VideoProvider provider = runtime.provider;
        runtime.scheduledStop = taskScheduler.schedule(
                () -> stopNow(runtime, false),
                Instant.ofEpochMilli(runtime.scheduledStopAt));
    }

    private void stopNow(CameraRuntime runtime, boolean propagateFailure) {
        VideoCameraBinding binding;
        VideoProvider provider;
        synchronized (runtime) {
            runtime.scheduledStop = null;
            runtime.scheduledStopAt = 0;
            if (!runtime.sessions.isEmpty()) {
                return;
            }
            binding = runtime.binding;
            provider = runtime.provider;
            if (binding == null || provider == null) {
                runtime.status = VideoStreamStatus.OFFLINE;
                runtime.online = false;
                runtime.updatedAt = System.currentTimeMillis();
                return;
            }
            runtime.status = VideoStreamStatus.STOPPING;
            runtime.updatedAt = System.currentTimeMillis();
        }

        try {
            provider.stopPlayback(binding);
            synchronized (runtime) {
                runtime.status = VideoStreamStatus.OFFLINE;
                runtime.online = false;
                runtime.readerCount = 0;
                runtime.message = null;
                runtime.lastPlayback = null;
                runtime.updatedAt = System.currentTimeMillis();
            }
        } catch (ResponseStatusException error) {
            synchronized (runtime) {
                runtime.status = VideoStreamStatus.FAILED;
                runtime.message = reason(error);
                runtime.updatedAt = System.currentTimeMillis();
            }
            if (propagateFailure) {
                throw error;
            }
            log.warn("Delayed video stream stop failed for device {}: {}",
                    binding.tbDeviceId(), reason(error));
        }
    }

    private void cancelScheduledStop(CameraRuntime runtime) {
        if (runtime.scheduledStop != null) {
            runtime.scheduledStop.cancel(false);
            runtime.scheduledStop = null;
        }
        runtime.scheduledStopAt = 0;
    }

    private static void removeExpiredSessions(CameraRuntime runtime, long now) {
        runtime.sessions.entrySet().removeIf(entry -> entry.getValue().expiresAt() <= now);
    }

    private static UUID parseSessionId(String sessionId) {
        if (sessionId == null || sessionId.isBlank()) {
            return null;
        }
        try {
            return UUID.fromString(sessionId.trim());
        } catch (IllegalArgumentException error) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Invalid video playback session ID");
        }
    }

    private static VideoCameraStatus toStatus(VideoCameraBinding binding, CameraRuntime runtime) {
        return new VideoCameraStatus(
                binding.tbDeviceId().toString(),
                binding.cameraCode(),
                binding.provider(),
                binding.streamApp(),
                binding.streamId(),
                runtime.status,
                runtime.online,
                runtime.readerCount,
                runtime.sessions.size(),
                runtime.message,
                runtime.updatedAt,
                nullableTimestamp(runtime.scheduledStopAt));
    }

    private static Long nullableTimestamp(long timestamp) {
        return timestamp <= 0 ? null : timestamp;
    }

    private static String reason(ResponseStatusException error) {
        String reason = error.getReason();
        return reason == null || reason.isBlank() ? "Video provider request failed" : reason;
    }

    private record SessionLease(UUID userId, long expiresAt) {
    }

    private static final class CameraRuntime {

        private final Map<UUID, SessionLease> sessions = new HashMap<>();
        private VideoCameraBinding binding;
        private VideoProvider provider;
        private VideoPlaybackInfo lastPlayback;
        private VideoSnapshot snapshot;
        private VideoStreamStatus status = VideoStreamStatus.OFFLINE;
        private boolean online;
        private int readerCount;
        private String message;
        private long updatedAt = System.currentTimeMillis();
        private ScheduledFuture<?> scheduledStop;
        private long scheduledStopAt;

        private CameraRuntime(VideoCameraBinding binding) {
            this.binding = binding;
        }
    }
}
