/**
 * Copyright © 2016-2025 The Thingsboard Authors
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 */
package org.thingsboard.server.service.video;

public record VideoRecordingPlaybackInfo(
        String tbDeviceId,
        String cameraCode,
        String provider,
        String sessionId,
        String app,
        String stream,
        String protocol,
        String url,
        boolean online,
        long startTime,
        long endTime,
        long expiresAt) {
}
