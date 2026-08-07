/**
 * Copyright © 2016-2025 The Thingsboard Authors
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 */
package org.thingsboard.server.controller;

import org.junit.Before;
import org.junit.Test;
import org.springframework.http.MediaType;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.setup.MockMvcBuilders;
import org.thingsboard.server.service.video.VideoZlmHookService;

import java.util.Map;

import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

public class VideoZlmHookControllerTest {

    private VideoZlmHookService hookService;
    private MockMvc mockMvc;

    @Before
    public void setUp() {
        hookService = mock(VideoZlmHookService.class);
        when(hookService.handle(any(), any())).thenReturn(Map.of("code", 0, "msg", "success"));
        mockMvc = MockMvcBuilders.standaloneSetup(
                new VideoZlmHookController(hookService, "test-hook-token")).build();
    }

    @Test
    public void shouldAcceptAuthenticatedPathEvent() throws Exception {
        mockMvc.perform(post("/api/noauth/video/hooks/zlm/on_stream_changed")
                        .header("X-Video-Hook-Token", "test-hook-token")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("""
                                {"app":"live","stream":"camera-001","regist":true}
                                """))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.code").value(0));

        verify(hookService).handle(eq("on_stream_changed"), any());
    }

    @Test
    public void shouldAcceptForwardedEventHeader() throws Exception {
        mockMvc.perform(post("/api/noauth/video/hooks/zlm")
                        .header("X-Zlm-Hook-Event", "on_stream_none_reader")
                        .param("token", "test-hook-token")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("""
                                {"app":"live","stream":"camera-001"}
                                """))
                .andExpect(status().isOk());

        verify(hookService).handle(eq("on_stream_none_reader"), any());
    }

    @Test
    public void shouldRejectInvalidToken() throws Exception {
        mockMvc.perform(post("/api/noauth/video/hooks/zlm/on_stream_changed")
                        .header("X-Video-Hook-Token", "wrong")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{}"))
                .andExpect(status().isUnauthorized());
    }

    @Test
    public void shouldDisableEndpointWhenTokenIsMissingFromConfiguration() throws Exception {
        MockMvc disabledMvc = MockMvcBuilders.standaloneSetup(
                new VideoZlmHookController(hookService, "")).build();

        disabledMvc.perform(post("/api/noauth/video/hooks/zlm/on_stream_changed")
                        .header("X-Video-Hook-Token", "anything")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{}"))
                .andExpect(status().isServiceUnavailable());
    }
}
