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
package org.thingsboard.server.service.entitiy.dashboard;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.node.ObjectNode;
import lombok.AllArgsConstructor;
import org.apache.commons.collections4.CollectionUtils;
import org.springframework.stereotype.Service;
import org.thingsboard.server.common.data.Customer;
import org.thingsboard.server.common.data.Dashboard;
import org.thingsboard.server.common.data.EntityType;
import org.thingsboard.server.common.data.ShortCustomerInfo;
import org.thingsboard.server.common.data.User;
import org.thingsboard.server.common.data.audit.ActionType;
import org.thingsboard.server.common.data.edge.Edge;
import org.thingsboard.server.common.data.exception.ThingsboardException;
import org.thingsboard.server.common.data.id.CustomerId;
import org.thingsboard.server.common.data.id.DashboardId;
import org.thingsboard.server.common.data.id.EdgeId;
import org.thingsboard.server.common.data.id.TenantId;
import org.thingsboard.server.dao.dashboard.DashboardService;
import org.thingsboard.server.queue.util.TbCoreComponent;
import org.thingsboard.server.service.entitiy.AbstractTbEntityService;
import org.thingsboard.server.service.map.MapTemplateUpdateService;
import org.thingsboard.server.service.resource.TbResourceService;
import org.thingsboard.server.service.security.model.SecurityUser;

import java.util.HashSet;
import java.util.Set;

@Service
@TbCoreComponent
@AllArgsConstructor
public class DefaultTbDashboardService extends AbstractTbEntityService implements TbDashboardService {

    private static final String MAP_TEMPLATE_CONFIG_KEY = "__mapWidgetEditor";
    private static final String MAP_TEMPLATE_VERSION_KEY = "version";
    private static final String MAP_TEMPLATE_UPDATED_TIME_KEY = "updatedTime";

    private final DashboardService dashboardService;
    private final TbResourceService tbResourceService;
    private final MapTemplateUpdateService mapTemplateUpdateService;

    @Override
    public Dashboard save(Dashboard dashboard, SecurityUser user) throws Exception {
        ActionType actionType = dashboard.getId() == null ? ActionType.ADDED : ActionType.UPDATED;
        TenantId tenantId = dashboard.getTenantId();

        if (CollectionUtils.isNotEmpty(dashboard.getResources())) {
            tbResourceService.importResources(dashboard.getResources(), user);
        }

        try {
            Dashboard existingDashboard = dashboard.getId() != null
                    ? dashboardService.findDashboardById(tenantId, dashboard.getId()) : null;
            Long mapTemplateVersion = prepareMapTemplateVersion(dashboard, existingDashboard);
            Dashboard savedDashboard = checkNotNull(dashboardService.saveDashboard(dashboard));
            autoCommit(user, savedDashboard.getId());
            logEntityActionService.logEntityAction(tenantId, savedDashboard.getId(), savedDashboard, null,
                    actionType, user);
            if (mapTemplateVersion != null) {
                mapTemplateUpdateService.publish(savedDashboard, mapTemplateVersion, mapTemplateVersion);
            }
            return savedDashboard;
        } catch (Exception e) {
            logEntityActionService.logEntityAction(tenantId, emptyId(EntityType.DASHBOARD), dashboard, actionType, user, e);
            throw e;
        }
    }

    @Override
    public void delete(Dashboard dashboard, User user) {
        ActionType actionType = ActionType.DELETED;
        DashboardId dashboardId = dashboard.getId();
        TenantId tenantId = dashboard.getTenantId();
        try {
            dashboardService.deleteDashboard(tenantId, dashboardId);
            logEntityActionService.logEntityAction(tenantId, dashboardId, dashboard, null, actionType, user, dashboardId.toString());
        } catch (Exception e) {
            logEntityActionService.logEntityAction(tenantId, emptyId(EntityType.DASHBOARD), actionType, user, e, dashboardId.toString());
            throw e;
        }
    }

    @Override
    public Dashboard assignDashboardToCustomer(Dashboard dashboard, Customer customer, User user) throws ThingsboardException {
        ActionType actionType = ActionType.ASSIGNED_TO_CUSTOMER;
        TenantId tenantId = dashboard.getTenantId();
        CustomerId customerId = customer.getId();
        DashboardId dashboardId = dashboard.getId();
        try {
            Dashboard savedDashboard = checkNotNull(dashboardService.assignDashboardToCustomer(tenantId, dashboardId, customerId));
            logEntityActionService.logEntityAction(tenantId, dashboardId, savedDashboard, customerId, actionType,
                    user, dashboardId.toString(), customerId.toString(), customer.getName());
            return savedDashboard;
        } catch (Exception e) {
            logEntityActionService.logEntityAction(tenantId, emptyId(EntityType.DASHBOARD), actionType,
                    user, e, dashboardId.toString(), customerId.toString());
            throw e;
        }
    }

    @Override
    public Dashboard assignDashboardToPublicCustomer(Dashboard dashboard, User user) throws ThingsboardException {
        ActionType actionType = ActionType.ASSIGNED_TO_CUSTOMER;
        TenantId tenantId = dashboard.getTenantId();
        DashboardId dashboardId = dashboard.getId();
        try {
            Customer publicCustomer = customerService.findOrCreatePublicCustomer(tenantId);
            Dashboard savedDashboard = checkNotNull(dashboardService.assignDashboardToCustomer(tenantId, dashboardId, publicCustomer.getId()));
            logEntityActionService.logEntityAction(tenantId, dashboardId, savedDashboard, publicCustomer.getId(),
                    actionType, user, dashboardId.toString(), publicCustomer.getId().toString(), publicCustomer.getName());
            return savedDashboard;
        } catch (Exception e) {
            logEntityActionService.logEntityAction(tenantId, emptyId(EntityType.DASHBOARD), actionType, user, e, dashboardId.toString());
            throw e;
        }
    }

    @Override
    public Dashboard unassignDashboardFromPublicCustomer(Dashboard dashboard, User user) throws ThingsboardException {
        ActionType actionType = ActionType.UNASSIGNED_FROM_CUSTOMER;
        TenantId tenantId = dashboard.getTenantId();
        DashboardId dashboardId = dashboard.getId();
        try {
            Customer publicCustomer = customerService.findOrCreatePublicCustomer(tenantId);
            Dashboard savedDashboard = checkNotNull(dashboardService.unassignDashboardFromCustomer(tenantId, dashboardId, publicCustomer.getId()));
            logEntityActionService.logEntityAction(tenantId, dashboardId, dashboard, publicCustomer.getId(), actionType,
                    user, dashboardId.toString(), publicCustomer.getId().toString(), publicCustomer.getName());
            return savedDashboard;
        } catch (Exception e) {
            logEntityActionService.logEntityAction(tenantId, emptyId(EntityType.DASHBOARD), actionType, user, e, dashboardId.toString());
            throw e;
        }
    }

    @Override
    public Dashboard updateDashboardCustomers(Dashboard dashboard, Set<CustomerId> customerIds, User user) throws ThingsboardException {
        ActionType actionType = ActionType.ASSIGNED_TO_CUSTOMER;
        TenantId tenantId = dashboard.getTenantId();
        DashboardId dashboardId = dashboard.getId();
        try {
            Set<CustomerId> addedCustomerIds = new HashSet<>();
            Set<CustomerId> removedCustomerIds = new HashSet<>();
            for (CustomerId customerId : customerIds) {
                if (!dashboard.isAssignedToCustomer(customerId)) {
                    addedCustomerIds.add(customerId);
                }
            }

            Set<ShortCustomerInfo> assignedCustomers = dashboard.getAssignedCustomers();
            if (assignedCustomers != null) {
                for (ShortCustomerInfo customerInfo : assignedCustomers) {
                    if (!customerIds.contains(customerInfo.getCustomerId())) {
                        removedCustomerIds.add(customerInfo.getCustomerId());
                    }
                }
            }

            if (addedCustomerIds.isEmpty() && removedCustomerIds.isEmpty()) {
                return dashboard;
            } else {
                Dashboard savedDashboard = null;
                for (CustomerId customerId : addedCustomerIds) {
                    savedDashboard = checkNotNull(dashboardService.assignDashboardToCustomer(tenantId, dashboardId, customerId));
                    ShortCustomerInfo customerInfo = savedDashboard.getAssignedCustomerInfo(customerId);
                    logEntityActionService.logEntityAction(tenantId, savedDashboard.getId(), savedDashboard, customerId,
                            actionType, user, dashboardId.toString(), customerId.toString(), customerInfo.getTitle());
                }
                actionType = ActionType.UNASSIGNED_FROM_CUSTOMER;
                for (CustomerId customerId : removedCustomerIds) {
                    ShortCustomerInfo customerInfo = dashboard.getAssignedCustomerInfo(customerId);
                    savedDashboard = checkNotNull(dashboardService.unassignDashboardFromCustomer(tenantId, dashboardId, customerId));
                    logEntityActionService.logEntityAction(tenantId, savedDashboard.getId(), savedDashboard, customerId,
                            actionType, user, dashboardId.toString(), customerId.toString(), customerInfo.getTitle());
                }
                return savedDashboard;
            }
        } catch (Exception e) {
            logEntityActionService.logEntityAction(tenantId, emptyId(EntityType.DASHBOARD), actionType, user, e, dashboardId.toString());
            throw e;
        }
    }

    @Override
    public Dashboard addDashboardCustomers(Dashboard dashboard, Set<CustomerId> customerIds, User user) throws ThingsboardException {
        ActionType actionType = ActionType.ASSIGNED_TO_CUSTOMER;
        TenantId tenantId = dashboard.getTenantId();
        DashboardId dashboardId = dashboard.getId();
        try {
            Set<CustomerId> addedCustomerIds = new HashSet<>();
            for (CustomerId customerId : customerIds) {
                if (!dashboard.isAssignedToCustomer(customerId)) {
                    addedCustomerIds.add(customerId);
                }
            }
            if (addedCustomerIds.isEmpty()) {
                return dashboard;
            } else {
                Dashboard savedDashboard = null;
                for (CustomerId customerId : addedCustomerIds) {
                    savedDashboard = checkNotNull(dashboardService.assignDashboardToCustomer(tenantId, dashboardId, customerId));
                    ShortCustomerInfo customerInfo = savedDashboard.getAssignedCustomerInfo(customerId);
                    logEntityActionService.logEntityAction(tenantId, dashboardId, savedDashboard, customerId,
                            actionType, user, dashboardId.toString(), customerId.toString(), customerInfo.getTitle());
                }
                return savedDashboard;
            }
        } catch (Exception e) {
            logEntityActionService.logEntityAction(tenantId, emptyId(EntityType.DASHBOARD), actionType, user, e, dashboardId.toString());
            throw e;
        }
    }

    @Override
    public Dashboard removeDashboardCustomers(Dashboard dashboard, Set<CustomerId> customerIds, User user) throws ThingsboardException {
        ActionType actionType = ActionType.UNASSIGNED_FROM_CUSTOMER;
        TenantId tenantId = dashboard.getTenantId();
        DashboardId dashboardId = dashboard.getId();
        try {
            Set<CustomerId> removedCustomerIds = new HashSet<>();
            for (CustomerId customerId : customerIds) {
                if (dashboard.isAssignedToCustomer(customerId)) {
                    removedCustomerIds.add(customerId);
                }
            }
            if (removedCustomerIds.isEmpty()) {
                return dashboard;
            } else {
                Dashboard savedDashboard = null;
                for (CustomerId customerId : removedCustomerIds) {
                    ShortCustomerInfo customerInfo = dashboard.getAssignedCustomerInfo(customerId);
                    savedDashboard = checkNotNull(dashboardService.unassignDashboardFromCustomer(tenantId, dashboardId, customerId));
                    logEntityActionService.logEntityAction(tenantId, dashboardId, savedDashboard, customerId,
                            actionType, user, dashboardId.toString(), customerId.toString(), customerInfo.getTitle());
                }
                return savedDashboard;
            }
        } catch (Exception e) {
            logEntityActionService.logEntityAction(tenantId, emptyId(EntityType.DASHBOARD), actionType, user, e, dashboardId.toString());
            throw e;
        }
    }

    @Override
    public Dashboard asignDashboardToEdge(TenantId tenantId, DashboardId dashboardId, Edge edge, User user) throws ThingsboardException {
        ActionType actionType = ActionType.ASSIGNED_TO_EDGE;
        EdgeId edgeId = edge.getId();
        try {
            Dashboard savedDashboard = checkNotNull(dashboardService.assignDashboardToEdge(tenantId, dashboardId, edgeId));
            logEntityActionService.logEntityAction(tenantId, dashboardId, savedDashboard, null, actionType,
                    user, dashboardId.toString(), edgeId.toString(), edge.getName());
            return savedDashboard;
        } catch (Exception e) {
            logEntityActionService.logEntityAction(tenantId, emptyId(EntityType.DEVICE),
                    actionType, user, e, dashboardId.toString(), edgeId);
            throw e;
        }
    }

    @Override
    public Dashboard unassignDashboardFromEdge(Dashboard dashboard, Edge edge, User user) throws ThingsboardException {
        ActionType actionType = ActionType.UNASSIGNED_FROM_EDGE;
        TenantId tenantId = dashboard.getTenantId();
        DashboardId dashboardId = dashboard.getId();
        EdgeId edgeId = edge.getId();
        try {
            Dashboard savedDevice = checkNotNull(dashboardService.unassignDashboardFromEdge(tenantId, dashboardId, edgeId));
            logEntityActionService.logEntityAction(tenantId, dashboardId, dashboard, null, actionType,
                    user, dashboardId.toString(), edgeId.toString(), edge.getName());
            return savedDevice;
        } catch (Exception e) {
            logEntityActionService.logEntityAction(tenantId, emptyId(EntityType.DASHBOARD), actionType, user, e,
                    dashboardId.toString(), edgeId.toString());
            throw e;
        }
    }

    @Override
    public Dashboard unassignDashboardFromCustomer(Dashboard dashboard, Customer customer, User user) throws ThingsboardException {
        ActionType actionType = ActionType.UNASSIGNED_FROM_CUSTOMER;
        TenantId tenantId = dashboard.getTenantId();
        DashboardId dashboardId = dashboard.getId();
        try {
            Dashboard savedDashboard = checkNotNull(dashboardService.unassignDashboardFromCustomer(tenantId, dashboardId, customer.getId()));
            logEntityActionService.logEntityAction(tenantId, dashboardId, savedDashboard, customer.getId(),
                    actionType, user, dashboardId.toString(), customer.getId().toString(), customer.getName());
            return savedDashboard;
        } catch (Exception e) {
            logEntityActionService.logEntityAction(tenantId, emptyId(EntityType.DASHBOARD), actionType, user, e, dashboardId.toString());
            throw e;
        }
    }

    private Long prepareMapTemplateVersion(Dashboard dashboard, Dashboard existingDashboard) {
        JsonNode newTemplate = getMapTemplateNode(dashboard);
        if (!(newTemplate instanceof ObjectNode newTemplateObject)) {
            return null;
        }

        JsonNode existingTemplate = getMapTemplateNode(existingDashboard);
        if (sameTemplateContent(newTemplate, existingTemplate)) {
            copyExistingTemplateVersion(newTemplateObject, existingTemplate);
            return null;
        }

        long version = System.currentTimeMillis();
        newTemplateObject.put(MAP_TEMPLATE_VERSION_KEY, version);
        newTemplateObject.put(MAP_TEMPLATE_UPDATED_TIME_KEY, version);
        return version;
    }

    private JsonNode getMapTemplateNode(Dashboard dashboard) {
        if (dashboard == null || dashboard.getConfiguration() == null || !dashboard.getConfiguration().isObject()) {
            return null;
        }
        return dashboard.getConfiguration().get(MAP_TEMPLATE_CONFIG_KEY);
    }

    private boolean sameTemplateContent(JsonNode newTemplate, JsonNode existingTemplate) {
        if (newTemplate == null || existingTemplate == null) {
            return newTemplate == existingTemplate;
        }
        return stripMapTemplateVersion(newTemplate).equals(stripMapTemplateVersion(existingTemplate));
    }

    private JsonNode stripMapTemplateVersion(JsonNode template) {
        if (!(template instanceof ObjectNode templateObject)) {
            return template;
        }
        ObjectNode copy = templateObject.deepCopy();
        copy.remove(MAP_TEMPLATE_VERSION_KEY);
        copy.remove(MAP_TEMPLATE_UPDATED_TIME_KEY);
        return copy;
    }

    private void copyExistingTemplateVersion(ObjectNode newTemplateObject, JsonNode existingTemplate) {
        if (!(existingTemplate instanceof ObjectNode existingTemplateObject)) {
            return;
        }
        JsonNode existingVersion = existingTemplateObject.get(MAP_TEMPLATE_VERSION_KEY);
        JsonNode existingUpdatedTime = existingTemplateObject.get(MAP_TEMPLATE_UPDATED_TIME_KEY);
        if (existingVersion != null) {
            newTemplateObject.set(MAP_TEMPLATE_VERSION_KEY, existingVersion);
        }
        if (existingUpdatedTime != null) {
            newTemplateObject.set(MAP_TEMPLATE_UPDATED_TIME_KEY, existingUpdatedTime);
        }
    }

}
