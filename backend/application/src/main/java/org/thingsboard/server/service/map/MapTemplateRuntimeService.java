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

import com.fasterxml.jackson.databind.JsonNode;
import jakarta.annotation.PreDestroy;
import lombok.Data;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;
import org.springframework.web.servlet.mvc.method.annotation.SseEmitter;
import org.thingsboard.common.util.JacksonUtil;
import org.thingsboard.server.common.data.AttributeScope;
import org.thingsboard.server.common.data.Dashboard;
import org.thingsboard.server.common.data.DeviceInfo;
import org.thingsboard.server.common.data.ShortCustomerInfo;
import org.thingsboard.server.common.data.id.CustomerId;
import org.thingsboard.server.common.data.id.DashboardId;
import org.thingsboard.server.common.data.id.DeviceId;
import org.thingsboard.server.common.data.id.TenantId;
import org.thingsboard.server.common.data.kv.AttributeKvEntry;
import org.thingsboard.server.common.data.kv.KvEntry;
import org.thingsboard.server.common.data.kv.TsKvEntry;
import org.thingsboard.server.dao.attributes.AttributesService;
import org.thingsboard.server.dao.dashboard.DashboardService;
import org.thingsboard.server.dao.device.DeviceService;
import org.thingsboard.server.dao.timeseries.TimeseriesService;
import org.thingsboard.server.queue.util.TbCoreComponent;
import org.thingsboard.server.service.security.model.SecurityUser;

import java.io.IOException;
import java.util.Collection;
import java.util.HashSet;
import java.util.LinkedHashMap;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Map;
import java.util.Objects;
import java.util.Optional;
import java.util.Set;
import java.util.UUID;
import java.util.concurrent.Executors;
import java.util.concurrent.ScheduledExecutorService;
import java.util.concurrent.ScheduledFuture;
import java.util.concurrent.TimeUnit;

@Slf4j
@Service
@TbCoreComponent
@RequiredArgsConstructor
public class MapTemplateRuntimeService {

    private static final String MAP_TEMPLATE_CONFIG_KEY = "__mapWidgetEditor";
    private static final long POLL_INTERVAL_MS = 2000L;
    private static final long DAO_TIMEOUT_SECONDS = 5L;

    private static final Set<String> BASE_ATTRIBUTE_KEYS = Set.of(
            "cameraId", "cameraCode", "cameraName", "cameraModel", "hlsUrl", "streamUrlMain", "streamUrl",
            "webRtcUrl", "rtspUrl", "flvUrl", "streamType", "supportsLive", "supportsPlayback", "supportsPtz",
            "supportsZoom", "supportsPreset", "supportsAudio", "controlMode", "supportedRpcMethods",
            "rpcTargetDeviceId", "controlDeviceId", "gatewayDeviceId", "rpcTargetCameraId", "rpcDeviceName",
            "rpcGatewayMethod", "rpcTopic", "rpcPayloadMode", "rpcTargetMode", "rpcCallType", "rpcTimeout",
            "lat", "lon", "lng", "latitude", "longitude", "height", "alt", "altitude", "sensorModel", "deviceType"
    );
    private static final Set<String> BASE_TELEMETRY_KEYS = Set.of(
            "online", "active", "status", "lastActivityTime", "streamOnline", "streamAlive", "fps", "bitrate",
            "delayMs", "motion", "alarm", "recording", "videoLoss", "motionDetected", "tamperAlarm"
    );

    private final DashboardService dashboardService;
    private final DeviceService deviceService;
    private final AttributesService attributesService;
    private final TimeseriesService tsService;
    private final ScheduledExecutorService scheduler = Executors.newScheduledThreadPool(2, runnable -> {
        Thread thread = new Thread(runnable, "map-template-runtime-poll");
        thread.setDaemon(true);
        return thread;
    });

    public MapTemplateRuntimeResponse buildRuntime(Dashboard dashboard) {
        JsonNode template = getTemplateNode(dashboard);
        Map<String, DeviceRuntimeRequest> requests = collectDeviceRuntimeRequests(template);
        Map<String, Map<String, Object>> devices = new LinkedHashMap<>();

        for (DeviceRuntimeRequest request : requests.values()) {
            devices.put(request.getDeviceId(), loadDeviceRuntime(dashboard.getTenantId(), request));
        }

        long updatedTime = template.path("updatedTime").asLong(dashboard.getCreatedTime());
        long version = template.path("version").asLong(updatedTime);
        return new MapTemplateRuntimeResponse(
                dashboard.getId().getId().toString(),
                version,
                updatedTime,
                template,
                devices
        );
    }

    public SseEmitter subscribe(Dashboard dashboard, SecurityUser user) {
        SseEmitter emitter = new SseEmitter(0L);
        Subscription subscription = new Subscription();
        subscription.setDashboardId(dashboard.getId());
        subscription.setTenantId(user.getTenantId());
        subscription.setCustomerId(user.isCustomerUser() ? user.getCustomerId() : null);
        subscription.setEmitter(emitter);

        ScheduledFuture<?> task = scheduler.scheduleWithFixedDelay(
                () -> pollAndSend(subscription),
                0L,
                POLL_INTERVAL_MS,
                TimeUnit.MILLISECONDS
        );
        subscription.setTask(task);

        emitter.onCompletion(() -> remove(subscription));
        emitter.onTimeout(() -> remove(subscription));
        emitter.onError(error -> remove(subscription));
        return emitter;
    }

    private void pollAndSend(Subscription subscription) {
        if (subscription.isClosed()) {
            return;
        }

        try {
            Dashboard dashboard = dashboardService.findDashboardById(subscription.getTenantId(), subscription.getDashboardId());
            if (dashboard == null || !canReceive(subscription, dashboard)) {
                subscription.getEmitter().complete();
                remove(subscription);
                return;
            }

            MapTemplateRuntimeResponse runtime = buildRuntime(dashboard);
            String payloadSignature = JacksonUtil.toString(runtime);
            if (Objects.equals(payloadSignature, subscription.getLastPayloadSignature())) {
                return;
            }

            String type = subscription.getLastPayloadSignature() == null ? "snapshot" :
                    runtime.getVersion() != subscription.getLastVersion() ? "templateUpdated" : "runtimeUpdated";
            JsonNode template = "runtimeUpdated".equals(type) ? null : runtime.getTemplate();
            MapTemplateRuntimeEvent event = new MapTemplateRuntimeEvent(
                    type,
                    runtime.getDashboardId(),
                    runtime.getVersion(),
                    runtime.getUpdatedTime(),
                    template,
                    runtime.getDevices()
            );
            subscription.getEmitter().send(SseEmitter.event().name("mapTemplateRuntime").data(event));
            subscription.setLastPayloadSignature(payloadSignature);
            subscription.setLastVersion(runtime.getVersion());
        } catch (IOException | IllegalStateException e) {
            log.debug("[{}] Failed to send map template runtime event", subscription.getDashboardId(), e);
            remove(subscription);
        } catch (Exception e) {
            log.debug("[{}] Failed to poll map template runtime", subscription.getDashboardId(), e);
        }
    }

    private Map<String, DeviceRuntimeRequest> collectDeviceRuntimeRequests(JsonNode template) {
        Map<String, DeviceRuntimeRequest> requests = new LinkedHashMap<>();
        JsonNode mapPoints = template.path("mapPoints");
        if (!mapPoints.isArray()) {
            collectWidgetRuntimeRequests(template.path("widgets"), requests);
            return requests;
        }

        for (JsonNode point : mapPoints) {
            if (!"DEVICE".equals(point.path("entityType").asText())) {
                continue;
            }
            String deviceId = point.path("entityId").asText("");
            if (!isUuid(deviceId)) {
                continue;
            }
            DeviceRuntimeRequest request = requests.computeIfAbsent(deviceId, DeviceRuntimeRequest::new);
            request.getAttributeKeys().addAll(BASE_ATTRIBUTE_KEYS);
            request.getTelemetryKeys().addAll(BASE_TELEMETRY_KEYS);
            collectDatasourceKeys(point.path("datasource").path("keys"), request);
        }
        collectWidgetRuntimeRequests(template.path("widgets"), requests);
        return requests;
    }

    private void collectWidgetRuntimeRequests(JsonNode widgets, Map<String, DeviceRuntimeRequest> requests) {
        if (!widgets.isObject()) {
            return;
        }

        widgets.elements().forEachRemaining(widget -> {
            collectWidgetDatasource(widget.path("datasource"), requests);
            collectWidgetDatasource(widget.path("config").path("datasource"), requests);
            collectWidgetDatasources(widget.path("datasources"), requests);
            collectWidgetDatasources(widget.path("config").path("datasources"), requests);
        });
    }

    private void collectWidgetDatasources(JsonNode datasources, Map<String, DeviceRuntimeRequest> requests) {
        if (!datasources.isArray()) {
            return;
        }
        datasources.forEach(datasource -> collectWidgetDatasource(datasource, requests));
    }

    private void collectWidgetDatasource(JsonNode datasource, Map<String, DeviceRuntimeRequest> requests) {
        if (!datasource.isObject() || !"DEVICE".equalsIgnoreCase(datasource.path("entityType").asText(datasource.path("type").asText()))) {
            return;
        }
        String deviceId = datasource.path("entityId").asText(datasource.path("id").asText(""));
        if (!isUuid(deviceId)) {
            return;
        }

        DeviceRuntimeRequest request = requests.computeIfAbsent(deviceId, DeviceRuntimeRequest::new);
        request.getAttributeKeys().addAll(BASE_ATTRIBUTE_KEYS);
        request.getTelemetryKeys().addAll(BASE_TELEMETRY_KEYS);
        collectDatasourceKeys(datasource.path("keys"), request);
        collectDatasourceKeys(datasource.path("dataKeys"), request);
    }

    private void collectDatasourceKeys(JsonNode keys, DeviceRuntimeRequest request) {
        if (!keys.isArray()) {
            return;
        }

        for (JsonNode key : keys) {
            String name = key.isTextual() ? key.asText("") : key.path("name").asText("");
            if (name.isBlank()) {
                continue;
            }
            String type = key.path("type").asText("timeseries");
            if ("attribute".equals(type)) {
                request.getAttributeKeys().add(name);
            } else if ("timeseries".equals(type)) {
                request.getTelemetryKeys().add(name);
            }
        }
    }

    private Map<String, Object> loadDeviceRuntime(TenantId tenantId, DeviceRuntimeRequest request) {
        Map<String, Object> values = new LinkedHashMap<>();
        DeviceId deviceId = new DeviceId(UUID.fromString(request.getDeviceId()));

        JsonNode deviceAdditionalInfo = putDeviceInfo(values, tenantId, deviceId);
        putAttributes(values, tenantId, deviceId, request.getAttributeKeys());
        putDeviceLocation(values, deviceAdditionalInfo);
        putTimeseries(values, tenantId, deviceId, request.getTelemetryKeys());
        applyDerivedStatus(values);
        return values;
    }

    private JsonNode putDeviceInfo(Map<String, Object> values, TenantId tenantId, DeviceId deviceId) {
        try {
            DeviceInfo deviceInfo = deviceService.findDeviceInfoById(tenantId, deviceId);
            if (deviceInfo != null) {
                values.put("deviceActive", deviceInfo.isActive());
                values.put("active", deviceInfo.isActive());
                values.put("entityName", deviceInfo.getName());
                if (deviceInfo.getType() != null) {
                    values.put("tbDeviceType", deviceInfo.getType());
                }
                if (deviceInfo.getDeviceProfileName() != null) {
                    values.put("deviceProfileName", deviceInfo.getDeviceProfileName());
                }
                return deviceInfo.getAdditionalInfo();
            }
        } catch (Exception e) {
            log.debug("[{}] Failed to load map template runtime device info", deviceId, e);
        }
        return null;
    }

    private void putDeviceLocation(Map<String, Object> values, JsonNode additionalInfo) {
        Double longitude = firstNumber(values, List.of("longitude", "lon", "lng"));
        Double latitude = firstNumber(values, List.of("latitude", "lat"));
        Double height = firstNumber(values, List.of("altitude", "height", "alt"));
        String source = longitude != null && latitude != null ? "attribute" : "deviceInfo";

        if ((longitude == null || latitude == null) && additionalInfo != null && additionalInfo.isObject()) {
            longitude = firstNumber(additionalInfo, List.of("longitude", "lon", "lng"));
            latitude = firstNumber(additionalInfo, List.of("latitude", "lat"));
            height = firstNumber(additionalInfo, List.of("altitude", "height", "alt"));
        }

        if (longitude == null || latitude == null ||
                Math.abs(longitude) > 180D || Math.abs(latitude) > 90D) {
            return;
        }

        values.put("longitude", longitude);
        values.put("latitude", latitude);
        if (height != null) {
            values.put("height", height);
        }
        values.put("mapLocationSource", source);
    }

    private Double firstNumber(Map<String, Object> source, List<String> keys) {
        for (String key : keys) {
            Object value = source.get(key);
            if (value == null || String.valueOf(value).isBlank()) {
                continue;
            }
            try {
                double number = value instanceof Number numberValue ? numberValue.doubleValue() : Double.parseDouble(String.valueOf(value));
                if (Double.isFinite(number)) {
                    return number;
                }
            } catch (NumberFormatException ignored) {
                // Try the next supported location alias.
            }
        }
        return null;
    }
    private Double firstNumber(JsonNode source, List<String> keys) {
        for (String key : keys) {
            JsonNode value = source.get(key);
            if (value == null || value.isNull()) {
                continue;
            }
            try {
                double number = value.isNumber() ? value.asDouble() : Double.parseDouble(value.asText());
                if (Double.isFinite(number)) {
                    return number;
                }
            } catch (NumberFormatException ignored) {
                // Try the next supported location alias.
            }
        }
        return null;
    }

    private void putAttributes(Map<String, Object> values, TenantId tenantId, DeviceId deviceId, Collection<String> keys) {
        if (keys.isEmpty()) {
            return;
        }

        for (AttributeScope scope : List.of(
                AttributeScope.CLIENT_SCOPE,
                AttributeScope.SHARED_SCOPE,
                AttributeScope.SERVER_SCOPE)) {
            try {
                List<AttributeKvEntry> attributes = attributesService
                        .find(tenantId, deviceId, scope, keys)
                        .get(DAO_TIMEOUT_SECONDS, TimeUnit.SECONDS);
                putKvEntries(values, attributes);
            } catch (Exception e) {
                log.debug("[{}] Failed to load map template runtime attributes from scope [{}]", deviceId, scope, e);
            }
        }
    }

    private void putTimeseries(Map<String, Object> values, TenantId tenantId, DeviceId deviceId, Collection<String> keys) {
        if (keys.isEmpty()) {
            return;
        }

        try {
            List<TsKvEntry> latest = tsService
                    .findLatest(tenantId, deviceId, keys)
                    .get(DAO_TIMEOUT_SECONDS, TimeUnit.SECONDS);
            putKvEntries(values, latest);
            for (TsKvEntry entry : latest) {
                if (entry != null) {
                    values.put(entry.getKey() + "Ts", entry.getTs());
                }
            }
        } catch (Exception e) {
            log.debug("[{}] Failed to load map template runtime timeseries", deviceId, e);
        }
    }

    private void putKvEntries(Map<String, Object> values, List<? extends KvEntry> entries) {
        if (entries == null) {
            return;
        }

        for (KvEntry entry : entries) {
            if (entry != null && entry.getKey() != null) {
                Object value = unwrapKvValue(entry.getValue());
                values.put(entry.getKey(), value);

            }
        }
    }

    private Object unwrapKvValue(Object value) {
        if (value instanceof Optional<?> optionalValue) {
            return optionalValue.orElse(null);
        }
        return value;
    }

    private void applyDerivedStatus(Map<String, Object> values) {
        Boolean deviceActive = toBoolean(values.get("deviceActive"));
        boolean online = Boolean.TRUE.equals(deviceActive);
        values.put("online", online);
        if (!online) {
            values.put("streamOnline", false);
            values.put("streamAlive", false);
        }
        values.put("statusText", online ? "online" : "offline");
    }

    private Object firstValue(Map<String, Object> values, List<String> keys) {
        for (String key : keys) {
            Object value = values.get(key);
            if (value != null && !String.valueOf(value).isBlank()) {
                return value;
            }
        }
        return null;
    }

    private Boolean toBoolean(Object value) {
        if (value == null) {
            return null;
        }
        if (value instanceof Boolean booleanValue) {
            return booleanValue;
        }
        if (value instanceof Number numberValue) {
            return numberValue.doubleValue() != 0D;
        }

        String normalized = String.valueOf(value).trim().toLowerCase();
        if (Set.of("true", "1", "yes", "online", "on", "active").contains(normalized)) {
            return true;
        }
        if (Set.of("false", "0", "no", "offline", "off", "inactive").contains(normalized)) {
            return false;
        }
        return null;
    }

    private JsonNode getTemplateNode(Dashboard dashboard) {
        JsonNode configuration = dashboard.getConfiguration();
        JsonNode template = configuration != null ? configuration.get(MAP_TEMPLATE_CONFIG_KEY) : null;
        return template != null && !template.isNull() ? template : JacksonUtil.OBJECT_MAPPER.createObjectNode();
    }

    private boolean isUuid(String value) {
        try {
            UUID.fromString(value);
            return true;
        } catch (Exception e) {
            return false;
        }
    }

    private boolean canReceive(Subscription subscription, Dashboard dashboard) {
        if (!Objects.equals(subscription.getTenantId(), dashboard.getTenantId())) {
            return false;
        }
        CustomerId customerId = subscription.getCustomerId();
        return customerId == null || getAssignedCustomerIds(dashboard).contains(customerId);
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
        if (subscription.isClosed()) {
            return;
        }
        subscription.setClosed(true);
        ScheduledFuture<?> task = subscription.getTask();
        if (task != null) {
            task.cancel(false);
        }
    }

    @PreDestroy
    public void destroy() {
        scheduler.shutdownNow();
    }

    @Data
    private static class DeviceRuntimeRequest {
        private final String deviceId;
        private final Set<String> attributeKeys = new LinkedHashSet<>();
        private final Set<String> telemetryKeys = new LinkedHashSet<>();
    }

    @Data
    private static class Subscription {
        private DashboardId dashboardId;
        private TenantId tenantId;
        private CustomerId customerId;
        private SseEmitter emitter;
        private ScheduledFuture<?> task;
        private String lastPayloadSignature;
        private long lastVersion;
        private boolean closed;
    }

}



