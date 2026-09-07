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
 */
package org.thingsboard.server.controller;

import com.fasterxml.jackson.databind.ObjectMapper;
import org.junit.After;
import org.junit.Before;
import org.junit.Test;
import org.springframework.aop.framework.ProxyFactory;
import org.springframework.dao.DataAccessResourceFailureException;
import org.springframework.security.access.AccessDeniedException;
import org.springframework.security.authentication.AuthenticationCredentialsNotFoundException;
import org.springframework.security.authentication.UsernamePasswordAuthenticationToken;
import org.springframework.security.authorization.method.AuthorizationManagerBeforeMethodInterceptor;
import org.springframework.security.core.context.SecurityContextHolder;
import org.thingsboard.server.common.data.alarm.AlarmTrend;
import org.thingsboard.server.common.data.exception.ThingsboardException;
import org.thingsboard.server.common.data.exception.ThingsboardErrorCode;
import org.thingsboard.server.common.data.id.CustomerId;
import org.thingsboard.server.common.data.id.TenantId;
import org.thingsboard.server.common.data.security.Authority;
import org.thingsboard.server.dao.alarm.AlarmStatisticsService;
import org.thingsboard.server.service.security.model.SecurityUser;

import java.util.List;
import java.util.UUID;

import static org.junit.Assert.*;
import static org.mockito.Mockito.*;

public class AlarmStatisticsControllerTest {
    private AlarmStatisticsController controller;
    private AlarmStatisticsService service;
    private final TenantId tenant = TenantId.fromUUID(UUID.randomUUID());

    @Before
    public void setUp() {
        service = mock(AlarmStatisticsService.class);
        var proxy = new ProxyFactory(new AlarmStatisticsController(service));
        proxy.setProxyTargetClass(true);
        proxy.addAdvisor(AuthorizationManagerBeforeMethodInterceptor.preAuthorize());
        controller = (AlarmStatisticsController) proxy.getProxy();
    }

    @After
    public void tearDown() {
        SecurityContextHolder.clearContext();
    }

    private void login(Authority authority, CustomerId customer) {
        var user = new SecurityUser();
        user.setTenantId(tenant);
        user.setAuthority(authority);
        user.setCustomerId(customer);
        SecurityContextHolder.getContext().setAuthentication(
                new UsernamePasswordAuthenticationToken(user, null, user.getAuthorities()));
    }

    @Test
    public void tenantScopeAndJsonContract() throws Exception {
        login(Authority.TENANT_ADMIN, new CustomerId(UUID.randomUUID()));
        var trend = new AlarmTrend("sevenDays", "Asia/Shanghai", 20, 0, 20, 10, true, List.of());
        when(service.getTrend(tenant, null, "sevenDays")).thenReturn(trend);
        var response = controller.getTrend("sevenDays");
        assertEquals(200, response.getStatusCode().value());
        assertEquals("no-store", response.getHeaders().getCacheControl());
        assertEquals("Asia/Shanghai", new ObjectMapper().valueToTree(response.getBody()).get("timeZone").asText());
        verify(service).getTrend(tenant, null, "sevenDays");
    }

    @Test
    public void customerScopeComesFromAuthenticatedUser() throws Exception {
        var customer = new CustomerId(UUID.randomUUID());
        login(Authority.CUSTOMER_USER, customer);
        controller.getTrend("twentyFourHours");
        verify(service).getTrend(tenant, customer, "twentyFourHours");
    }

    @Test
    public void missingCustomerMustNotFallBackToWholeTenant() {
        for (CustomerId customer : new CustomerId[]{null, new CustomerId(null), new CustomerId(CustomerId.NULL_UUID)}) {
            login(Authority.CUSTOMER_USER, customer);
            var error = assertThrows(ThingsboardException.class, () -> controller.getTrend("sevenDays"));
            assertEquals(ThingsboardErrorCode.PERMISSION_DENIED, error.getErrorCode());
        }
        verifyNoInteractions(service);
    }

    @Test
    public void unauthenticatedAndSystemAdminAreRejectedByMethodSecurity() {
        assertThrows(AuthenticationCredentialsNotFoundException.class, () -> controller.getTrend("sevenDays"));
        login(Authority.SYS_ADMIN, null);
        assertThrows(AccessDeniedException.class, () -> controller.getTrend("sevenDays"));
        verifyNoInteractions(service);
    }

    @Test
    public void unavailableDatabaseReturns503WithoutSensitiveDetails() throws Exception {
        login(Authority.TENANT_ADMIN, null);
        when(service.getTrend(tenant, null, "sevenDays"))
                .thenThrow(new DataAccessResourceFailureException("sensitive SQL connection detail"));
        var response = controller.getTrend("sevenDays");
        assertEquals(503, response.getStatusCode().value());
        assertFalse(response.getBody().toString().contains("sensitive"));
    }

    @Test
    public void invalidModeIsBadRequest() {
        login(Authority.TENANT_ADMIN, null);
        when(service.getTrend(tenant, null, "invalid")).thenThrow(new IllegalArgumentException("Invalid mode"));
        var error = assertThrows(ThingsboardException.class, () -> controller.getTrend("invalid"));
        assertEquals(ThingsboardErrorCode.BAD_REQUEST_PARAMS, error.getErrorCode());
    }

    @Test
    public void transactionConnectionFailureAlsoReturnsSafe503() throws Exception {
        login(Authority.TENANT_ADMIN, null);
        when(service.getTrend(tenant, null, "sevenDays"))
                .thenThrow(new org.springframework.transaction.CannotCreateTransactionException("sensitive connection"));
        var response = controller.getTrend("sevenDays");
        assertEquals(503, response.getStatusCode().value());
        assertFalse(response.getBody().toString().contains("sensitive"));
    }
}
