/**
 * Copyright © 2016-2025 The Thingsboard Authors
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 */
package org.thingsboard.server.service.video;

public record VideoRecordingControlResult(
        String tbDeviceId,
        String cameraCode,
        String sessionId,
        String action,
        boolean accepted,
        long updatedAt) {
}
