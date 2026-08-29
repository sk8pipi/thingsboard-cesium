/**
 * Copyright © 2016-2025 The Thingsboard Authors
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 */
package org.thingsboard.server.controller;

import com.fasterxml.jackson.databind.JsonNode;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.HttpStatus;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestHeader;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.server.ResponseStatusException;
import org.thingsboard.server.queue.util.TbCoreComponent;
import org.thingsboard.server.service.video.VideoZlmHookService;

import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.util.Map;

@RestController
@TbCoreComponent
@RequestMapping("/api/noauth/video/hooks/zlm")
public class VideoZlmHookController {

    private final VideoZlmHookService hookService;
    private final String hookToken;

    public VideoZlmHookController(
            VideoZlmHookService hookService,
            @Value("${video.zlm.hook-token:}") String hookToken) {
        this.hookService = hookService;
        this.hookToken = hookToken == null ? "" : hookToken;
    }

    @PostMapping("/{event}")
    public Map<String, Object> handle(
            @PathVariable String event,
            @RequestHeader(value = "X-Video-Hook-Token", required = false) String headerToken,
            @RequestBody(required = false) JsonNode body) {
        requireValidToken(headerToken);
        return hookService.handle(event, body);
    }

    @PostMapping
    public Map<String, Object> handleForwarded(
            @RequestHeader("X-Zlm-Hook-Event") String event,
            @RequestHeader(value = "X-Video-Hook-Token", required = false) String headerToken,
            @RequestBody(required = false) JsonNode body) {
        requireValidToken(headerToken);
        return hookService.handle(event, body);
    }

    private void requireValidToken(String headerToken) {
        if (hookToken.isBlank()) {
            throw new ResponseStatusException(
                    HttpStatus.SERVICE_UNAVAILABLE,
                    "ZLMediaKit Hook is disabled because VIDEO_ZLM_HOOK_TOKEN is not configured");
        }
        if (headerToken == null || !MessageDigest.isEqual(
                hookToken.getBytes(StandardCharsets.UTF_8),
                headerToken.getBytes(StandardCharsets.UTF_8))) {
            throw new ResponseStatusException(HttpStatus.UNAUTHORIZED, "Invalid ZLMediaKit Hook token");
        }
    }
}
