/**
 * Copyright © 2016-2025 The Thingsboard Authors
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 */
package org.thingsboard.server.service.video;

import org.junit.Before;
import org.junit.Test;
import org.thingsboard.common.util.JacksonUtil;
import org.thingsboard.rule.engine.api.TimeseriesSaveRequest;
import org.thingsboard.server.service.telemetry.InternalTelemetryService;

import java.util.List;
import java.util.Map;
import java.util.UUID;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertFalse;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

public class VideoZlmHookServiceTest {

    private VideoCameraBindingRepository bindingRepository;
    private InternalTelemetryService telemetryService;
    private VideoZlmHookService hookService;

    @Before
    public void setUp() {
        bindingRepository = mock(VideoCameraBindingRepository.class);
        telemetryService = mock(InternalTelemetryService.class);
        hookService = new VideoZlmHookService(bindingRepository, telemetryService);
    }

    @Test
    public void shouldSyncStreamRegistrationToThingsBoardTelemetry() {
        UUID tenantId = UUID.randomUUID();
        UUID deviceId = UUID.randomUUID();
        VideoCameraBinding binding = new VideoCameraBinding(
                UUID.randomUUID(),
                1,
                1,
                tenantId,
                deviceId,
                "camera-001",
                "WVP_STREAM_PROXY",
                "device-code",
                "channel-code",
                "media-001",
                "live",
                "stream-001",
                "hls",
                true);
        when(bindingRepository.findAllByStream("live", "stream-001", "media-001"))
                .thenReturn(List.of(binding));

        hookService.handle("on_stream_changed", JacksonUtil.toJsonNode("""
                {
                  "mediaServerId":"media-001",
                  "app":"live",
                  "stream":"stream-001",
                  "schema":"rtmp",
                  "regist":true,
                  "totalReaderCount":2
                }
                """));

        verify(telemetryService).saveTimeseriesInternal(any(TimeseriesSaveRequest.class));
        verify(bindingRepository).findAllByStream("live", "stream-001", "media-001");
    }

    @Test
    public void shouldKeepStreamOpenWhenThereAreNoReaders() {
        when(bindingRepository.findAllByStream(eq("live"), eq("stream-001"), any()))
                .thenReturn(List.of());

        Map<String, Object> response = hookService.handle(
                "on_stream_none_reader",
                JacksonUtil.toJsonNode("""
                        {"app":"live","stream":"stream-001"}
                        """));

        assertEquals(0, response.get("code"));
        assertFalse((Boolean) response.get("close"));
    }
}
