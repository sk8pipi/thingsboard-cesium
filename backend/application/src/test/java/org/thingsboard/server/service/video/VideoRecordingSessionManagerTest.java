/**
 * Copyright © 2016-2025 The Thingsboard Authors
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 */
package org.thingsboard.server.service.video;

import org.junit.Test;
import org.springframework.http.HttpStatus;
import org.springframework.web.server.ResponseStatusException;

import java.util.UUID;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.Future;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicLong;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertTrue;
import static org.junit.Assert.assertThrows;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.doAnswer;
import static org.mockito.Mockito.doThrow;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.times;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

public class VideoRecordingSessionManagerTest {

    @Test
    public void shouldStopProviderWhenExpiredSessionIsAccessed() {
        AtomicLong clock = new AtomicLong(1_000L);
        VideoRecordingSessionManager manager = new VideoRecordingSessionManager(60, clock::get);
        VideoProvider provider = provider();
        VideoCameraBinding binding = binding();
        UUID userId = UUID.randomUUID();
        VideoRecordingPlaybackInfo playback = start(manager, binding, provider, userId);

        clock.set(playback.expiresAt() + 1);

        ResponseStatusException error = assertThrows(
                ResponseStatusException.class,
                () -> manager.stop(binding, userId, new VideoRecordingStopRequest(playback.sessionId()), false));

        assertEquals(HttpStatus.NOT_FOUND, error.getStatusCode());
        verify(provider).stopRecordingPlayback(binding, "recording-stream");
    }

    @Test
    public void shouldRetryExpiredProviderStopAfterFailure() {
        AtomicLong clock = new AtomicLong(1_000L);
        VideoRecordingSessionManager manager = new VideoRecordingSessionManager(60, clock::get);
        VideoProvider provider = provider();
        VideoCameraBinding binding = binding();
        VideoRecordingPlaybackInfo playback = start(manager, binding, provider, UUID.randomUUID());
        doThrow(new RuntimeException("temporary failure"))
                .doNothing()
                .when(provider)
                .stopRecordingPlayback(binding, "recording-stream");

        clock.set(playback.expiresAt() + 1);
        manager.cleanupExpiredSessions();
        manager.cleanupExpiredSessions();
        manager.cleanupExpiredSessions();

        verify(provider, times(2)).stopRecordingPlayback(binding, "recording-stream");
    }

    @Test
    public void shouldSerializeConcurrentStops() throws Exception {
        AtomicLong clock = new AtomicLong(1_000L);
        VideoRecordingSessionManager manager = new VideoRecordingSessionManager(60, clock::get);
        VideoProvider provider = provider();
        VideoCameraBinding binding = binding();
        UUID userId = UUID.randomUUID();
        VideoRecordingPlaybackInfo playback = start(manager, binding, provider, userId);
        CountDownLatch providerEntered = new CountDownLatch(1);
        CountDownLatch releaseProvider = new CountDownLatch(1);
        doAnswer(invocation -> {
            providerEntered.countDown();
            assertTrue(releaseProvider.await(5, TimeUnit.SECONDS));
            return null;
        }).when(provider).stopRecordingPlayback(binding, "recording-stream");

        ExecutorService executor = Executors.newFixedThreadPool(2);
        try {
            Future<Object> first = executor.submit(
                    () -> stopOrError(manager, binding, userId, playback.sessionId()));
            assertTrue(providerEntered.await(5, TimeUnit.SECONDS));
            Future<Object> second = executor.submit(
                    () -> stopOrError(manager, binding, userId, playback.sessionId()));
            releaseProvider.countDown();

            Object firstResult = first.get(5, TimeUnit.SECONDS);
            Object secondResult = second.get(5, TimeUnit.SECONDS);
            assertTrue(firstResult instanceof VideoRecordingStopResult || secondResult instanceof VideoRecordingStopResult);
            ResponseStatusException rejected = firstResult instanceof ResponseStatusException
                    ? (ResponseStatusException) firstResult
                    : (ResponseStatusException) secondResult;
            assertEquals(HttpStatus.NOT_FOUND, rejected.getStatusCode());
            verify(provider, times(1)).stopRecordingPlayback(binding, "recording-stream");
        } finally {
            releaseProvider.countDown();
            executor.shutdownNow();
        }
    }

    private static Object stopOrError(
            VideoRecordingSessionManager manager,
            VideoCameraBinding binding,
            UUID userId,
            String sessionId) {
        try {
            return manager.stop(binding, userId, new VideoRecordingStopRequest(sessionId), false);
        } catch (ResponseStatusException error) {
            return error;
        }
    }

    private static VideoRecordingPlaybackInfo start(
            VideoRecordingSessionManager manager,
            VideoCameraBinding binding,
            VideoProvider provider,
            UUID userId) {
        return manager.start(
                binding,
                provider,
                userId,
                new VideoRecordingPlayRequest(10_000L, 20_000L, "hls"));
    }

    private static VideoProvider provider() {
        VideoProvider provider = mock(VideoProvider.class);
        when(provider.startRecordingPlayback(any(), any()))
                .thenReturn(new VideoRecordingPlaybackSource("rtp", "recording-stream", true, "/video-stream/rtp/recording-stream/hls.m3u8"));
        return provider;
    }

    private static VideoCameraBinding binding() {
        return new VideoCameraBinding(
                UUID.randomUUID(),
                1L,
                1L,
                UUID.randomUUID(),
                UUID.randomUUID(),
                "camera-001",
                "WVP_STREAM_PROXY",
                "provider-device",
                "provider-channel",
                "polaris",
                "live",
                "stream-001",
                "hls",
                true);
    }
}
