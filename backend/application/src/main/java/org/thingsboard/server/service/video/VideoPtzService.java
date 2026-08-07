/**
 * Copyright © 2016-2025 The Thingsboard Authors
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 */
package org.thingsboard.server.service.video;

import lombok.extern.slf4j.Slf4j;
import org.thingsboard.common.util.JacksonUtil;
import org.thingsboard.server.common.data.id.DeviceId;
import org.thingsboard.server.common.data.id.TenantId;
import org.thingsboard.server.common.data.rpc.ToDeviceRpcRequestBody;
import org.thingsboard.server.common.msg.rpc.ToDeviceRpcRequest;
import org.thingsboard.server.queue.util.TbCoreComponent;
import org.thingsboard.server.service.rpc.TbCoreDeviceRpcService;
import org.thingsboard.server.service.security.model.SecurityUser;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.context.annotation.Lazy;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.web.server.ResponseStatusException;

import java.util.Locale;
import java.util.Map;
import java.util.Set;
import java.util.UUID;

@Slf4j
@Service
@TbCoreComponent
public class VideoPtzService {

    private static final Set<String> COMMANDS = Set.of(
            "ptz.up", "ptz.down", "ptz.left", "ptz.right",
            "ptz.up-left", "ptz.up-right", "ptz.down-left", "ptz.down-right", "ptz.stop",
            "zoom.in", "zoom.out",
            "preset.call", "preset.save", "preset.delete");

    private final TbCoreDeviceRpcService deviceRpcService;
    private final long rpcTimeoutMs;

    public VideoPtzService(
            @Lazy TbCoreDeviceRpcService deviceRpcService,
            @Value("${video.ptz.rpc-timeout-ms:10000}") long rpcTimeoutMs) {
        this.deviceRpcService = deviceRpcService;
        this.rpcTimeoutMs = Math.max(1000, rpcTimeoutMs);
    }

    public VideoPtzResult control(
            VideoCameraBinding binding,
            VideoProvider provider,
            SecurityUser currentUser,
            VideoPtzRequest request) {
        VideoPtzRequest normalized = normalize(request);
        if (hasText(binding.providerDeviceId()) && hasText(binding.providerChannelId())) {
            return provider.controlPtz(binding, normalized);
        }
        return sendThingsBoardRpc(binding, currentUser, normalized);
    }

    static VideoPtzRequest normalize(VideoPtzRequest request) {
        if (request == null || !hasText(request.command())) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "PTZ command is required");
        }
        String command = request.command().trim().toLowerCase(Locale.ROOT);
        if (!COMMANDS.contains(command)) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Unsupported PTZ command: " + command);
        }
        int speed = request.speed() == null ? 50 : request.speed();
        if (speed < 1 || speed > 100) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "PTZ speed must be between 1 and 100");
        }
        Integer durationMs = request.durationMs();
        if (durationMs != null && (durationMs < 100 || durationMs > 10000)) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "durationMs must be between 100 and 10000");
        }
        Integer presetId = request.presetId();
        if (command.startsWith("preset.") && (presetId == null || presetId < 1 || presetId > 255)) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "presetId must be between 1 and 255");
        }
        return new VideoPtzRequest(command, speed, durationMs, presetId);
    }

    private VideoPtzResult sendThingsBoardRpc(
            VideoCameraBinding binding,
            SecurityUser currentUser,
            VideoPtzRequest request) {
        UUID requestId = UUID.randomUUID();
        long now = System.currentTimeMillis();
        Map<String, Object> params = new java.util.LinkedHashMap<>();
        params.put("speed", request.speed());
        if (request.durationMs() != null) {
            params.put("durationMs", request.durationMs());
        }
        if (request.presetId() != null) {
            params.put("presetId", request.presetId());
        }
        ToDeviceRpcRequestBody body = new ToDeviceRpcRequestBody(
                request.command(),
                JacksonUtil.toString(params));
        ToDeviceRpcRequest rpcRequest = new ToDeviceRpcRequest(
                requestId,
                new TenantId(binding.tenantId()),
                new DeviceId(binding.tbDeviceId()),
                true,
                now + rpcTimeoutMs,
                body,
                false,
                null,
                JacksonUtil.toString(Map.of("source", "video-api")));
        deviceRpcService.processRestApiRpcRequest(
                rpcRequest,
                response -> response.getError().ifPresent(error ->
                        log.warn("[{}] Camera PTZ RPC {} failed: {}", binding.tbDeviceId(), requestId, error)),
                currentUser);
        return new VideoPtzResult(
                binding.tbDeviceId().toString(),
                binding.cameraCode(),
                binding.provider(),
                "thingsboard-rpc",
                request.command(),
                true,
                requestId.toString(),
                now);
    }

    private static boolean hasText(String value) {
        return value != null && !value.isBlank();
    }
}
