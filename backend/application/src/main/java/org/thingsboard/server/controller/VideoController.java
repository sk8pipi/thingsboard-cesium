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
 */package org.thingsboard.server.controller;

import lombok.RequiredArgsConstructor;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;
import org.thingsboard.server.config.annotations.ApiOperation;
import org.thingsboard.server.queue.util.TbCoreComponent;
import org.thingsboard.server.service.video.VideoCameraInfo;
import org.thingsboard.server.service.video.VideoPlaybackInfo;
import org.thingsboard.server.service.video.VideoProvider;

import java.util.List;

@RestController
@TbCoreComponent
@RequestMapping("/api/video")
@RequiredArgsConstructor
public class VideoController extends BaseController {

    private final VideoProvider videoProvider;

    @ApiOperation(value = "List video cameras", notes = "Lists cameras exposed by the configured video provider.")
    @PreAuthorize("hasAnyAuthority('SYS_ADMIN', 'TENANT_ADMIN', 'CUSTOMER_USER')")
    @GetMapping("/cameras")
    public List<VideoCameraInfo> listCameras() {
        return videoProvider.listCameras();
    }

    @ApiOperation(value = "Start camera playback", notes = "Starts the camera stream and returns browser-safe playback URLs.")
    @PreAuthorize("hasAnyAuthority('SYS_ADMIN', 'TENANT_ADMIN', 'CUSTOMER_USER')")
    @PostMapping("/cameras/{cameraCode}/play")
    public VideoPlaybackInfo startPlayback(@PathVariable String cameraCode) {
        return videoProvider.startPlayback(cameraCode);
    }

}