/**
 * Copyright © 2016-2025 The Thingsboard Authors
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 */
package org.thingsboard.server.controller;

import org.junit.Test;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.thingsboard.server.service.video.VideoPtzRequest;
import org.thingsboard.server.service.video.VideoRecordingControlRequest;
import org.thingsboard.server.service.video.VideoRecordingPlayRequest;
import org.thingsboard.server.service.video.VideoRecordingStopRequest;

import java.lang.reflect.Method;
import java.util.Arrays;

import static org.junit.Assert.assertTrue;

public class VideoControllerApiContractTest {

    @Test
    public void shouldExposeUnifiedPtzRoute() throws Exception {
        Method method = VideoController.class.getMethod(
                "controlPtz",
                String.class,
                VideoPtzRequest.class);

        assertRoute(method.getAnnotation(PostMapping.class).value(), "/cameras/{deviceId}/ptz");
    }

    @Test
    public void shouldExposeRecordingRoutes() throws Exception {
        Method list = VideoController.class.getMethod(
                "listRecordings",
                String.class,
                long.class,
                long.class);
        Method play = VideoController.class.getMethod(
                "startRecordingPlayback",
                String.class,
                VideoRecordingPlayRequest.class);
        Method control = VideoController.class.getMethod(
                "controlRecordingPlayback",
                String.class,
                VideoRecordingControlRequest.class);
        Method stop = VideoController.class.getMethod(
                "stopRecordingPlayback",
                String.class,
                VideoRecordingStopRequest.class);

        assertRoute(list.getAnnotation(GetMapping.class).value(), "/cameras/{deviceId}/recordings");
        assertRoute(play.getAnnotation(PostMapping.class).value(), "/cameras/{deviceId}/recordings/play");
        assertRoute(control.getAnnotation(PostMapping.class).value(), "/cameras/{deviceId}/recordings/control");
        assertRoute(stop.getAnnotation(PostMapping.class).value(), "/cameras/{deviceId}/recordings/stop");
    }

    private static void assertRoute(String[] routes, String expected) {
        assertTrue("Expected route " + expected + " in " + Arrays.toString(routes),
                Arrays.asList(routes).contains(expected));
    }
}
