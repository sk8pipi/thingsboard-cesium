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
import org.springframework.http.MediaType;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.servlet.mvc.method.annotation.SseEmitter;
import org.thingsboard.server.common.data.Dashboard;
import org.thingsboard.server.common.data.exception.ThingsboardException;
import org.thingsboard.server.common.data.id.DashboardId;
import org.thingsboard.server.queue.util.TbCoreComponent;
import org.thingsboard.server.service.map.MapTemplateRuntimeResponse;
import org.thingsboard.server.service.map.MapTemplateRuntimeService;
import org.thingsboard.server.service.map.MapTemplateUpdateService;
import org.thingsboard.server.service.security.permission.Operation;

import static org.thingsboard.server.controller.DashboardController.DASHBOARD_ID;

@RestController
@TbCoreComponent
@RequiredArgsConstructor
@RequestMapping("/api")
public class MapTemplateController extends BaseController {

    private final MapTemplateUpdateService mapTemplateUpdateService;
    private final MapTemplateRuntimeService mapTemplateRuntimeService;

    @PreAuthorize("hasAnyAuthority('TENANT_ADMIN', 'CUSTOMER_USER')")
    @GetMapping(value = "/map-template/{dashboardId}/runtime")
    public MapTemplateRuntimeResponse getMapTemplateRuntime(@PathVariable(DASHBOARD_ID) String strDashboardId)
            throws ThingsboardException {
        checkParameter(DASHBOARD_ID, strDashboardId);
        DashboardId dashboardId = new DashboardId(toUUID(strDashboardId));
        Dashboard dashboard = checkDashboardId(dashboardId, Operation.READ);
        return mapTemplateRuntimeService.buildRuntime(dashboard);
    }

    @PreAuthorize("hasAnyAuthority('TENANT_ADMIN', 'CUSTOMER_USER')")
    @GetMapping(value = "/map-template/{dashboardId}/events", produces = MediaType.TEXT_EVENT_STREAM_VALUE)
    public SseEmitter subscribeMapTemplateEvents(@PathVariable(DASHBOARD_ID) String strDashboardId)
            throws ThingsboardException {
        checkParameter(DASHBOARD_ID, strDashboardId);
        DashboardId dashboardId = new DashboardId(toUUID(strDashboardId));
        Dashboard dashboard = checkDashboardId(dashboardId, Operation.READ);
        return mapTemplateUpdateService.subscribe(dashboard, getCurrentUser());
    }

    @PreAuthorize("hasAnyAuthority('TENANT_ADMIN', 'CUSTOMER_USER')")
    @GetMapping(value = "/map-template/{dashboardId}/runtime/events", produces = MediaType.TEXT_EVENT_STREAM_VALUE)
    public SseEmitter subscribeMapTemplateRuntimeEvents(@PathVariable(DASHBOARD_ID) String strDashboardId)
            throws ThingsboardException {
        checkParameter(DASHBOARD_ID, strDashboardId);
        DashboardId dashboardId = new DashboardId(toUUID(strDashboardId));
        Dashboard dashboard = checkDashboardId(dashboardId, Operation.READ);
        return mapTemplateRuntimeService.subscribe(dashboard, getCurrentUser());
    }

}
