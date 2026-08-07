/**
 * Copyright © 2016-2025 The Thingsboard Authors
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 */
package org.thingsboard.server.service.video;

import java.util.List;

public record VideoRecordingList(
        String tbDeviceId,
        String cameraCode,
        long startTime,
        long endTime,
        int total,
        List<VideoRecordingItem> recordings) {
}
