/**
 * Copyright © 2016-2025 The Thingsboard Authors
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 */
package org.thingsboard.server.service.video;

import org.junit.Test;
import org.springframework.http.HttpStatus;
import org.springframework.web.server.ResponseStatusException;

import java.time.Duration;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertThrows;

public class VideoAdvancedValidationTest {

    @Test
    public void shouldNormalizePtzCommandAndDefaults() {
        VideoPtzRequest request = VideoPtzService.normalize(
                new VideoPtzRequest(" PTZ.UP ", null, null, null));

        assertEquals("ptz.up", request.command());
        assertEquals(Integer.valueOf(50), request.speed());
    }

    @Test
    public void shouldRequirePresetId() {
        ResponseStatusException error = assertThrows(
                ResponseStatusException.class,
                () -> VideoPtzService.normalize(
                        new VideoPtzRequest("preset.call", 50, null, null)));

        assertEquals(HttpStatus.BAD_REQUEST, error.getStatusCode());
    }

    @Test
    public void shouldRejectRecordingRangeLongerThanThirtyOneDays() {
        long start = 1_000L;
        ResponseStatusException error = assertThrows(
                ResponseStatusException.class,
                () -> VideoAdvancedService.validateRange(
                        start,
                        start + Duration.ofDays(32).toMillis()));

        assertEquals(HttpStatus.BAD_REQUEST, error.getStatusCode());
    }

    @Test
    public void shouldNormalizePlaybackSpeedControl() {
        VideoRecordingControlRequest request = VideoAdvancedService.normalizeControl(
                new VideoRecordingControlRequest("session", " SPEED ", null, 2.0));

        assertEquals("speed", request.action());
        assertEquals(Double.valueOf(2.0), request.speed());
    }

    @Test
    public void shouldRejectUnsupportedPlaybackSpeed() {
        ResponseStatusException error = assertThrows(
                ResponseStatusException.class,
                () -> VideoAdvancedService.normalizeControl(
                        new VideoRecordingControlRequest("session", "speed", null, 3.0)));

        assertEquals(HttpStatus.BAD_REQUEST, error.getStatusCode());
    }
}
