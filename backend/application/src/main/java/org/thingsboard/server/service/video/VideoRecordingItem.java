/**
 * Copyright © 2016-2025 The Thingsboard Authors
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 */
package org.thingsboard.server.service.video;

public record VideoRecordingItem(
        String recordingId,
        long startTime,
        long endTime,
        long durationMs,
        Long fileSize,
        String recordType) {
}
