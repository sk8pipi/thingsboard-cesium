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
package org.thingsboard.server.service.map;

import lombok.Data;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;
import org.springframework.web.servlet.mvc.method.annotation.SseEmitter;
import org.thingsboard.server.common.data.Dashboard;
import org.thingsboard.server.common.data.ShortCustomerInfo;
import org.thingsboard.server.common.data.id.CustomerId;
import org.thingsboard.server.common.data.id.DashboardId;
import org.thingsboard.server.common.data.id.TenantId;
import org.thingsboard.server.queue.util.TbCoreComponent;
import org.thingsboard.server.service.security.model.SecurityUser;

import java.io.IOException;
import java.util.HashSet;
import java.util.Objects;
import java.util.Set;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.CopyOnWriteArraySet;

@Slf4j
@Service
@TbCoreComponent
public class MapTemplateUpdateService {

    private final ConcurrentHashMap<DashboardId, CopyOnWriteArraySet<Subscription>> subscriptions = new ConcurrentHashMap<>();

    public SseEmitter subscribe(Dashboard dashboard, SecurityUser user) {
        SseEmitter emitter = new SseEmitter(0L);
        DashboardId dashboardId = dashboard.getId();
        Subscription subscription = new Subscription();
        subscription.setDashboardId(dashboardId);
        subscription.setTenantId(user.getTenantId());
        subscription.setCustomerId(user.isCustomerUser() ? user.getCustomerId() : null);
        subscription.setEmitter(emitter);

        subscriptions.computeIfAbsent(dashboardId, id -> new CopyOnWriteArraySet<>()).add(subscription);

        emitter.onCompletion(() -> remove(subscription));
        emitter.onTimeout(() -> remove(subscription));
        emitter.onError(error -> remove(subscription));
        return emitter;
    }

    public void publish(Dashboard dashboard, long version, long updatedTime) {
        DashboardId dashboardId = dashboard.getId();
        Set<Subscription> dashboardSubscriptions = subscriptions.get(dashboardId);
        if (dashboardSubscriptions == null || dashboardSubscriptions.isEmpty()) {
            return;
        }

        MapTemplateUpdateEvent event = new MapTemplateUpdateEvent(dashboardId.getId().toString(), version, updatedTime);
        Set<CustomerId> assignedCustomerIds = getAssignedCustomerIds(dashboard);

        for (Subscription subscription : dashboardSubscriptions) {
            if (!canReceive(subscription, dashboard.getTenantId(), assignedCustomerIds)) {
                continue;
            }
            try {
                subscription.getEmitter().send(SseEmitter.event().name("mapTemplateUpdated").data(event));
            } catch (IOException | IllegalStateException e) {
                log.debug("[{}] Failed to send map template update event", dashboardId, e);
                remove(subscription);
            }
        }
    }

    private boolean canReceive(Subscription subscription, TenantId tenantId, Set<CustomerId> assignedCustomerIds) {
        if (!Objects.equals(subscription.getTenantId(), tenantId)) {
            return false;
        }
        CustomerId customerId = subscription.getCustomerId();
        return customerId == null || assignedCustomerIds.contains(customerId);
    }

    private Set<CustomerId> getAssignedCustomerIds(Dashboard dashboard) {
        Set<CustomerId> result = new HashSet<>();
        if (dashboard.getAssignedCustomers() == null) {
            return result;
        }
        for (ShortCustomerInfo customerInfo : dashboard.getAssignedCustomers()) {
            if (customerInfo.getCustomerId() != null) {
                result.add(customerInfo.getCustomerId());
            }
        }
        return result;
    }

    private void remove(Subscription subscription) {
        CopyOnWriteArraySet<Subscription> dashboardSubscriptions = subscriptions.get(subscription.getDashboardId());
        if (dashboardSubscriptions == null) {
            return;
        }
        dashboardSubscriptions.remove(subscription);
        if (dashboardSubscriptions.isEmpty()) {
            subscriptions.remove(subscription.getDashboardId(), dashboardSubscriptions);
        }
    }

    @Data
    private static class Subscription {
        private DashboardId dashboardId;
        private TenantId tenantId;
        private CustomerId customerId;
        private SseEmitter emitter;
    }

}
