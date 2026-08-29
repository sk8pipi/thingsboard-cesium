/**
 * Copyright © 2016-2025 The Thingsboard Authors
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 */
package org.thingsboard.server.service.video;

import org.junit.Test;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.http.client.SimpleClientHttpRequestFactory;
import org.springframework.scheduling.TaskScheduler;
import org.springframework.test.util.ReflectionTestUtils;
import org.springframework.test.web.client.MockRestServiceServer;
import org.springframework.web.client.RestTemplate;
import org.springframework.web.server.ResponseStatusException;

import static org.hamcrest.Matchers.startsWith;
import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertFalse;
import static org.junit.Assert.assertThrows;
import static org.junit.Assert.assertTrue;
import static org.mockito.Mockito.mock;
import static org.springframework.test.web.client.ExpectedCount.once;
import static org.springframework.test.web.client.match.MockRestRequestMatchers.requestTo;
import static org.springframework.test.web.client.response.MockRestResponseCreators.withStatus;
import static org.springframework.test.web.client.response.MockRestResponseCreators.withSuccess;

public class WvpVideoProviderTest {

    @Test
    public void shouldConfigureHttpTimeouts() {
        RestTemplate restTemplate = WvpVideoProvider.createRestTemplate(2_500, 7_500);

        assertTrue(restTemplate.getRequestFactory() instanceof SimpleClientHttpRequestFactory);
        SimpleClientHttpRequestFactory requestFactory =
                (SimpleClientHttpRequestFactory) restTemplate.getRequestFactory();
        assertEquals(2_500, ReflectionTestUtils.getField(requestFactory, "connectTimeout"));
        assertEquals(7_500, ReflectionTestUtils.getField(requestFactory, "readTimeout"));
    }

    @Test
    public void shouldClampHttpTimeoutsToSafeMinimum() {
        RestTemplate restTemplate = WvpVideoProvider.createRestTemplate(1, 2);
        SimpleClientHttpRequestFactory requestFactory =
                (SimpleClientHttpRequestFactory) restTemplate.getRequestFactory();

        assertEquals(1_000, ReflectionTestUtils.getField(requestFactory, "connectTimeout"));
        assertEquals(1_000, ReflectionTestUtils.getField(requestFactory, "readTimeout"));
    }
    @Test
    public void shouldMapSecondUnauthorizedResponseToStableBadGateway() {
        WvpVideoProvider provider = new WvpVideoProvider(
                mock(ZlmVideoClient.class),
                mock(TaskScheduler.class),
                true,
                "http://wvp.test",
                "admin",
                "local-password",
                "live",
                "Asia/Shanghai",
                5_000,
                20_000);
        RestTemplate restTemplate = (RestTemplate) ReflectionTestUtils.getField(provider, "restTemplate");
        MockRestServiceServer server = MockRestServiceServer.bindTo(restTemplate).build();

        server.expect(once(), requestTo(startsWith("http://wvp.test/api/user/login")))
                .andRespond(withSuccess(
                        """
                                {"code":0,"data":{"accessToken":"expired-token"}}
                                """,
                        MediaType.APPLICATION_JSON));
        server.expect(once(), requestTo(startsWith("http://wvp.test/api/proxy/list")))
                .andRespond(withStatus(HttpStatus.UNAUTHORIZED));
        server.expect(once(), requestTo(startsWith("http://wvp.test/api/user/login")))
                .andRespond(withSuccess(
                        """
                                {"code":0,"data":{"accessToken":"new-token"}}
                                """,
                        MediaType.APPLICATION_JSON));
        server.expect(once(), requestTo(startsWith("http://wvp.test/api/proxy/list")))
                .andRespond(withStatus(HttpStatus.UNAUTHORIZED).body("upstream-sensitive-message"));

        ResponseStatusException error = assertThrows(ResponseStatusException.class, provider::listCameras);

        assertEquals(HttpStatus.BAD_GATEWAY, error.getStatusCode());
        assertEquals("WVP request failed", error.getReason());
        assertFalse(error.getReason().contains("upstream-sensitive-message"));
        server.verify();
    }}
