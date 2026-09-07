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

import lombok.RequiredArgsConstructor;
import org.springframework.dao.DataAccessException;
import org.springframework.http.ResponseEntity;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.transaction.TransactionException;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;
import org.thingsboard.server.common.data.exception.ThingsboardErrorCode;
import org.thingsboard.server.common.data.exception.ThingsboardException;
import org.thingsboard.server.common.data.security.Authority;
import org.thingsboard.server.dao.alarm.AlarmStatisticsService;
import org.thingsboard.server.queue.util.TbCoreComponent;

import java.util.Map;

@RestController
@TbCoreComponent
@RequiredArgsConstructor
@RequestMapping("/api/alarm/statistics")
public class AlarmStatisticsController extends BaseController {
    private final AlarmStatisticsService statisticsService;

    @PreAuthorize("hasAnyAuthority('TENANT_ADMIN', 'CUSTOMER_USER')")
    @GetMapping("/trend")
    public ResponseEntity<?> getTrend(@RequestParam(name = "mode", defaultValue = "sevenDays") String mode) throws ThingsboardException {
        var user = getCurrentUser();
        // User.isCustomerUser() infers the role from customerId, so an absent customer could look like an admin.
        boolean customerUser = user.getAuthority() == Authority.CUSTOMER_USER;
        if (customerUser && (user.getCustomerId() == null || user.getCustomerId().getId() == null || user.getCustomerId().isNullUid())) {
            throw new ThingsboardException("Customer is required", ThingsboardErrorCode.PERMISSION_DENIED);
        }
        try {
            var trend = statisticsService.getTrend(user.getTenantId(), customerUser ? user.getCustomerId() : null, mode);
            return ResponseEntity.ok().header("Cache-Control", "no-store").body(trend);
        } catch (IllegalArgumentException e) {
            throw new ThingsboardException(e.getMessage(), ThingsboardErrorCode.BAD_REQUEST_PARAMS);
        } catch (DataAccessException | TransactionException e) {
            // Do not expose database SQL, connection details or turn missing migration into zero counts.
            return ResponseEntity.status(503).header("Cache-Control", "no-store").body(Map.of(
                    "status", 503, "message", "报警趋势服务暂不可用，请确认统计数据库迁移已完成",
                    "errorCode", ThingsboardErrorCode.GENERAL.getErrorCode(), "timestamp", System.currentTimeMillis()));
        }
    }
}
