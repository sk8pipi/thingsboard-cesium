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
import org.springframework.http.CacheControl;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.ExceptionHandler;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;
import org.thingsboard.server.common.data.Device;
import org.thingsboard.server.common.data.exception.ThingsboardErrorCode;
import org.thingsboard.server.common.data.exception.ThingsboardException;
import org.thingsboard.server.common.data.id.DeviceId;
import org.thingsboard.server.common.data.security.Authority;
import org.thingsboard.server.config.annotations.ApiOperation;
import org.thingsboard.server.exception.ThingsboardErrorResponse;
import org.thingsboard.server.queue.util.TbCoreComponent;
import org.thingsboard.server.service.security.permission.Operation;
import org.thingsboard.server.service.video.VideoCameraBinding;
import org.thingsboard.server.service.video.VideoCameraBindingRequest;
import org.thingsboard.server.service.video.VideoCameraDetails;
import org.thingsboard.server.service.video.VideoCameraStatus;
import org.thingsboard.server.service.video.VideoSnapshot;
import org.thingsboard.server.service.video.VideoStopRequest;
import org.thingsboard.server.service.video.VideoStopResult;
import org.thingsboard.server.service.video.VideoCameraInfo;
import org.thingsboard.server.service.video.VideoCameraService;
import org.thingsboard.server.service.video.VideoPlaybackInfo;
import org.thingsboard.server.service.video.VideoPlayRequest;
import org.springframework.web.server.ResponseStatusException;

import java.util.List;
import java.util.UUID;
import java.util.concurrent.TimeUnit;

@RestController
@TbCoreComponent
@RequestMapping("/api/video")
@RequiredArgsConstructor
public class VideoController extends BaseController {

    private final VideoCameraService videoCameraService;

    @ExceptionHandler(ResponseStatusException.class)
    public ResponseEntity<ThingsboardErrorResponse> handleVideoApiException(ResponseStatusException error) {
        HttpStatus status = HttpStatus.resolve(error.getStatusCode().value());
        if (status == null) {
            status = HttpStatus.INTERNAL_SERVER_ERROR;
        }
        ThingsboardErrorCode errorCode = switch (status) {
            case BAD_REQUEST -> ThingsboardErrorCode.BAD_REQUEST_PARAMS;
            case FORBIDDEN -> ThingsboardErrorCode.PERMISSION_DENIED;
            case NOT_FOUND -> ThingsboardErrorCode.ITEM_NOT_FOUND;
            case CONFLICT -> ThingsboardErrorCode.VERSION_CONFLICT;
            default -> ThingsboardErrorCode.GENERAL;
        };
        String message = error.getReason() == null ? "Video API request failed" : error.getReason();
        return new ResponseEntity<>(ThingsboardErrorResponse.of(message, errorCode, status), status);
    }

    @ApiOperation(value = "List bound video cameras", notes = "Lists the current tenant's ThingsBoard camera bindings.")
    @PreAuthorize("hasAnyAuthority('TENANT_ADMIN', 'CUSTOMER_USER')")
    @GetMapping("/cameras")
    public List<VideoCameraInfo> listCameras() throws ThingsboardException {
        return videoCameraService.listBindings(getCurrentUser().getTenantId().getId()).stream()
                .filter(binding -> canReadCamera(binding.tbDeviceId().toString()))
                .map(videoCameraService::describe)
                .toList();
    }

    private boolean canReadCamera(String tbDeviceId) {
        if (tbDeviceId == null || tbDeviceId.isBlank()) {
            return false;
        }
        try {
            checkDeviceId(new DeviceId(UUID.fromString(tbDeviceId)), Operation.READ);
            return true;
        } catch (IllegalArgumentException | ThingsboardException error) {
            return false;
        }
    }

    @ApiOperation(value = "Start camera playback by ThingsBoard device",
            notes = "Resolves the binding by Device UUID, starts the provider stream and returns browser-safe URLs.")
    @PreAuthorize("hasAnyAuthority('TENANT_ADMIN', 'CUSTOMER_USER')")
    @PostMapping({"/cameras/{deviceOrCameraCode}/play", "/devices/{deviceOrCameraCode}/play"})
    public VideoPlaybackInfo startPlayback(
            @PathVariable String deviceOrCameraCode,
            @RequestBody(required = false) VideoPlayRequest request) throws ThingsboardException {
        validatePlayRequest(request);
        UUID deviceUuid;
        try {
            deviceUuid = UUID.fromString(deviceOrCameraCode);
        } catch (IllegalArgumentException ignored) {
            VideoCameraBinding binding = videoCameraService.getBindingByCameraCode(
                    getCurrentUser().getTenantId().getId(), deviceOrCameraCode);
            checkDeviceId(new DeviceId(binding.tbDeviceId()), Operation.READ);
            return videoCameraService.startPlayback(binding, getCurrentUser().getId().getId(), request);
        }
        Device device = checkDeviceId(new DeviceId(deviceUuid), Operation.READ);
        VideoCameraBinding binding = videoCameraService.getBinding(
                device.getTenantId().getId(), device.getId().getId());
        return videoCameraService.startPlayback(binding, getCurrentUser().getId().getId(), request);
    }

    private static void validatePlayRequest(VideoPlayRequest request) {
        String protocol = request == null || request.protocol() == null || request.protocol().isBlank()
                ? "hls"
                : request.protocol().trim().toLowerCase(java.util.Locale.ROOT);
        if (!"hls".equals(protocol)) {
            throw new ResponseStatusException(
                    HttpStatus.BAD_REQUEST,
                    "Unsupported video protocol: " + protocol + ". Only hls is currently supported");
        }
        String streamProfile = request == null || request.streamProfile() == null || request.streamProfile().isBlank()
                ? "main"
                : request.streamProfile().trim().toLowerCase(java.util.Locale.ROOT);
        if (!"main".equals(streamProfile)) {
            throw new ResponseStatusException(
                    HttpStatus.BAD_REQUEST,
                    "Unsupported streamProfile: " + streamProfile + ". Only main is currently supported");
        }
    }

    @ApiOperation(value = "Get video camera details",
            notes = "Returns one ThingsBoard camera binding together with its current provider status.")
    @PreAuthorize("hasAnyAuthority('TENANT_ADMIN', 'CUSTOMER_USER')")
    @GetMapping("/cameras/{deviceId}")
    public VideoCameraDetails getCamera(@PathVariable String deviceId) throws ThingsboardException {
        return videoCameraService.getDetails(readableBinding(deviceId));
    }

    @ApiOperation(value = "Get video camera status",
            notes = "Returns provider stream state and active API playback sessions without starting the stream.")
    @PreAuthorize("hasAnyAuthority('TENANT_ADMIN', 'CUSTOMER_USER')")
    @GetMapping("/cameras/{deviceId}/status")
    public VideoCameraStatus getStatus(@PathVariable String deviceId) throws ThingsboardException {
        return videoCameraService.getStatus(readableBinding(deviceId));
    }

    @ApiOperation(value = "Release or force-stop camera playback",
            notes = "Releases one session, all sessions owned by the current user, or force-stops all sessions for tenant administrators.")
    @PreAuthorize("hasAnyAuthority('TENANT_ADMIN', 'CUSTOMER_USER')")
    @PostMapping("/cameras/{deviceId}/stop")
    public VideoStopResult stopPlayback(
            @PathVariable String deviceId,
            @RequestBody(required = false) VideoStopRequest request) throws ThingsboardException {
        VideoCameraBinding binding = readableBinding(deviceId);
        boolean allowForce = getCurrentUser().getAuthority() == Authority.TENANT_ADMIN;
        return videoCameraService.stopPlayback(
                binding,
                getCurrentUser().getId().getId(),
                request,
                allowForce);
    }

    @ApiOperation(value = "Get camera snapshot",
            notes = "Returns a short-lived cached image generated by the configured video provider.")
    @PreAuthorize("hasAnyAuthority('TENANT_ADMIN', 'CUSTOMER_USER')")
    @GetMapping("/cameras/{deviceId}/snapshot")
    public ResponseEntity<byte[]> getSnapshot(@PathVariable String deviceId) throws ThingsboardException {
        VideoSnapshot snapshot = videoCameraService.getSnapshot(readableBinding(deviceId));
        return ResponseEntity.ok()
                .contentType(MediaType.parseMediaType(snapshot.contentType()))
                .contentLength(snapshot.data().length)
                .cacheControl(CacheControl.maxAge(
                        videoCameraService.snapshotCacheSeconds(),
                        TimeUnit.SECONDS).cachePrivate())
                .header("X-Video-Captured-At", Long.toString(snapshot.capturedAt()))
                .body(snapshot.data());
    }

    @ApiOperation(value = "Get camera binding", notes = "Gets the video mapping for one ThingsBoard camera device.")
    @PreAuthorize("hasAnyAuthority('TENANT_ADMIN', 'CUSTOMER_USER')")
    @GetMapping("/devices/{deviceId}/binding")
    public VideoCameraBinding getBinding(@PathVariable String deviceId) throws ThingsboardException {
        Device device = checkDeviceId(new DeviceId(toUUID(deviceId)), Operation.READ);
        return videoCameraService.getBinding(device.getTenantId().getId(), device.getId().getId());
    }

    @ApiOperation(value = "Create or update camera binding",
            notes = "Creates or updates the provider mapping for one ThingsBoard camera device.")
    @PreAuthorize("hasAuthority('TENANT_ADMIN')")
    @PutMapping("/devices/{deviceId}/binding")
    public VideoCameraBinding saveBinding(
            @PathVariable String deviceId,
            @RequestBody VideoCameraBindingRequest request) throws ThingsboardException {
        Device device = checkDeviceId(new DeviceId(toUUID(deviceId)), Operation.WRITE);
        return videoCameraService.saveBinding(device.getTenantId().getId(), device.getId().getId(), request);
    }

    @ApiOperation(value = "Delete camera binding", notes = "Deletes the video mapping for one ThingsBoard camera device.")
    @PreAuthorize("hasAuthority('TENANT_ADMIN')")
    @DeleteMapping("/devices/{deviceId}/binding")
    public void deleteBinding(@PathVariable String deviceId) throws ThingsboardException {
        Device device = checkDeviceId(new DeviceId(toUUID(deviceId)), Operation.WRITE);
        videoCameraService.deleteBinding(device.getTenantId().getId(), device.getId().getId());
    }

    private VideoCameraBinding readableBinding(String deviceId) throws ThingsboardException {
        Device device = checkDeviceId(new DeviceId(toUUID(deviceId)), Operation.READ);
        return videoCameraService.getBinding(device.getTenantId().getId(), device.getId().getId());
    }

}