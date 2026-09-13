/**
 * Copyright © 2016-2025 The Thingsboard Authors
 * Licensed under the Apache License, Version 2.0 (the "License");
 */
package org.thingsboard.server.service.map;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.node.ArrayNode;
import com.fasterxml.jackson.databind.node.ObjectNode;
import com.google.common.util.concurrent.Futures;
import org.junit.After;
import org.junit.Before;
import org.junit.Test;
import org.springframework.test.util.ReflectionTestUtils;
import org.thingsboard.common.util.JacksonUtil;
import org.thingsboard.server.common.data.Dashboard;
import org.thingsboard.server.common.data.DeviceInfo;
import org.thingsboard.server.common.data.DeviceProfile;
import org.thingsboard.server.common.data.id.DashboardId;
import org.thingsboard.server.common.data.id.DeviceId;
import org.thingsboard.server.common.data.id.DeviceProfileId;
import org.thingsboard.server.common.data.id.TenantId;
import org.thingsboard.server.common.data.kv.BaseAttributeKvEntry;
import org.thingsboard.server.common.data.kv.BasicTsKvEntry;
import org.thingsboard.server.common.data.kv.StringDataEntry;
import org.thingsboard.server.dao.attributes.AttributesService;
import org.thingsboard.server.dao.device.DeviceProfileService;
import org.thingsboard.server.dao.device.DeviceService;
import org.thingsboard.server.dao.timeseries.TimeseriesService;

import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.UUID;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertNotEquals;
import static org.junit.Assert.assertTrue;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyCollection;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.times;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.verifyNoInteractions;
import static org.mockito.Mockito.when;

public class MapTemplateRuntimeServiceTest {
    private final TenantId tenantId = new TenantId(UUID.randomUUID());
    private DeviceService deviceService;
    private DeviceProfileService profileService;
    private AttributesService attributesService;
    private TimeseriesService timeseriesService;
    private MapTemplateRuntimeService service;

    @Before
    public void setUp() {
        deviceService = mock(DeviceService.class);
        profileService = mock(DeviceProfileService.class);
        attributesService = mock(AttributesService.class);
        timeseriesService = mock(TimeseriesService.class);
        when(attributesService.find(eq(tenantId), any(DeviceId.class), any(), anyCollection()))
                .thenReturn(Futures.immediateFuture(List.of()));
        when(timeseriesService.findLatest(eq(tenantId), any(DeviceId.class), anyCollection()))
                .thenReturn(Futures.immediateFuture(List.of()));
        service = new MapTemplateRuntimeService(null, deviceService, attributesService, timeseriesService, profileService);
    }

    @After
    public void tearDown() {
        service.destroy();
    }

    @Test
    public void removedMapDevicesRemainInBusinessRuntimeWithoutCoordinates() throws Exception {
        MapTemplateRuntimeService service = new MapTemplateRuntimeService(null, null, null, null, null);
        try {
            String id = "11111111-1111-4111-8111-111111111111";
            JsonNode template = JacksonUtil.OBJECT_MAPPER.readTree("""
                    {
                      "mapPoints": [],
                      "excludedDeviceIds": ["%s", "%s", "invalid"],
                      "excludedDeviceBindings": {
                        "%s": {"type":"sensor", "datasource":{"keys":[{"name":"temperature","type":"timeseries"}]},
                               "telemetryKeys":["electricity_consumption"]}
                      }
                    }
                    """.formatted(id, id, id));
            Map<?, ?> requests = ReflectionTestUtils.invokeMethod(service, "collectDeviceRuntimeRequests", template);
            assertEquals(1, requests.size());
            Object request = requests.get(id);
            Set<?> telemetryKeys = (Set<?>) ReflectionTestUtils.getField(request, "telemetryKeys");
            assertTrue(telemetryKeys.contains("online"));
            assertTrue(telemetryKeys.contains("temperature"));
            assertTrue(telemetryKeys.contains("electricity_consumption"));
            // 即使旧模板没有 mapPoints 字段，排除设备也不能从统计集合消失。
            Map<?, ?> legacy = ReflectionTestUtils.invokeMethod(service, "collectDeviceRuntimeRequests",
                    JacksonUtil.OBJECT_MAPPER.readTree("{\"excludedDeviceIds\":[\"" + id + "\"]}"));
            assertEquals(Set.of(id), legacy.keySet());
        } finally {
            service.destroy();
        }
    }

    @Test
    public void entityMetadataCannotBeReplacedByAttributesOrTelemetry() {
        DeviceProfile profile = profile("temperature", "/api/images/public/temperature.png");
        DeviceInfo device = device(profile.getId());
        Dashboard dashboard = dashboard(device);
        when(attributesService.find(eq(tenantId), eq(device.getId()), any(), anyCollection()))
                .thenReturn(Futures.immediateFuture(List.of(
                        new BaseAttributeKvEntry(new StringDataEntry("entityMetadata", "forged-attribute"), 1L),
                        new BaseAttributeKvEntry(new StringDataEntry("deviceProfileName", "forged-name"), 1L))));
        assertEquals(expectedMetadata(profile), metadata(service.buildRuntime(dashboard), device));

        when(timeseriesService.findLatest(eq(tenantId), eq(device.getId()), anyCollection()))
                .thenReturn(Futures.immediateFuture(List.of(
                        new BasicTsKvEntry(2L, new StringDataEntry("entityMetadata", "forged-telemetry")),
                        new BasicTsKvEntry(2L, new StringDataEntry("deviceProfileId", "forged-id")),
                        new BasicTsKvEntry(2L, new StringDataEntry("deviceProfileName", "forged-name")),
                        new BasicTsKvEntry(2L, new StringDataEntry("deviceProfileImage", "forged-image")))));
        assertEquals(expectedMetadata(profile), metadata(service.buildRuntime(dashboard), device));
    }

    @Test
    public void devicesSharingAProfileQueryItOnlyOncePerSnapshot() {
        DeviceProfile profile = profile("humidity", null);
        DeviceInfo first = device(profile.getId());
        DeviceInfo second = device(profile.getId());
        Dashboard dashboard = dashboard(first, second);
        MapTemplateRuntimeResponse result = service.buildRuntime(dashboard);
        assertEquals(expectedMetadata(profile), metadata(result, first));
        assertEquals(expectedMetadata(profile), metadata(result, second));
        verify(profileService, times(1)).findDeviceProfileById(tenantId, profile.getId());
        service.buildRuntime(dashboard);
        verify(profileService, times(2)).findDeviceProfileById(tenantId, profile.getId());
    }

    @Test
    public void profileFailureIsDeduplicatedAndDoesNotDropOtherDevices() {
        DeviceProfileId failedId = new DeviceProfileId(UUID.randomUUID());
        DeviceInfo first = device(failedId);
        DeviceInfo second = device(failedId);
        DeviceProfile healthy = profile("camera", "/api/images/public/camera.png");
        DeviceInfo third = device(healthy.getId());
        when(profileService.findDeviceProfileById(tenantId, failedId)).thenThrow(new IllegalStateException("unavailable"));
        Dashboard dashboard = dashboard(first, second, third);
        MapTemplateRuntimeResponse result = service.buildRuntime(dashboard);
        assertEquals(3, result.getDevices().size());
        assertEquals(Map.of("deviceProfileId", failedId.toString(), "deviceProfileName", "device-info-name"), metadata(result, first));
        assertEquals(metadata(result, first), metadata(result, second));
        assertEquals(expectedMetadata(healthy), metadata(result, third));
        assertEquals(true, result.getDevices().get(first.getId().toString()).get("online"));
        verify(profileService, times(1)).findDeviceProfileById(tenantId, failedId);
        service.buildRuntime(dashboard);
        verify(profileService, times(2)).findDeviceProfileById(tenantId, failedId);
    }

    @Test
    public void absentProfileLookupIsAlsoDeduplicated() {
        DeviceProfileId absentId = new DeviceProfileId(UUID.randomUUID());
        DeviceInfo first = device(absentId);
        DeviceInfo second = device(absentId);
        MapTemplateRuntimeResponse result = service.buildRuntime(dashboard(first, second));
        assertEquals(Map.of("deviceProfileId", absentId.toString(), "deviceProfileName", "device-info-name"), metadata(result, first));
        assertEquals(metadata(result, first), metadata(result, second));
        verify(profileService, times(1)).findDeviceProfileById(tenantId, absentId);
    }

    @Test
    public void missingDeviceInfoClearsUntrustedMetadata() {
        DeviceInfo missing = device(new DeviceProfileId(UUID.randomUUID()));
        DeviceInfo failed = device(new DeviceProfileId(UUID.randomUUID()));
        DeviceInfo withoutProfile = device(null);
        when(deviceService.findDeviceInfoById(tenantId, missing.getId())).thenReturn(null);
        when(deviceService.findDeviceInfoById(tenantId, failed.getId())).thenThrow(new IllegalStateException("unavailable"));
        when(timeseriesService.findLatest(eq(tenantId), any(DeviceId.class), anyCollection()))
                .thenReturn(Futures.immediateFuture(List.of(
                        new BasicTsKvEntry(2L, new StringDataEntry("entityMetadata", "forged")))));
        MapTemplateRuntimeResponse result = service.buildRuntime(dashboard(missing, failed, withoutProfile));
        for (DeviceInfo device : List.of(missing, failed, withoutProfile)) {
            assertEquals(Map.of(), metadata(result, device));
        }
        verifyNoInteractions(profileService);
    }

    @Test
    public void profileReassignmentAndRenameAreVisibleInNextSnapshot() {
        DeviceProfile initial = profile("temperature", "/api/images/public/old.png");
        DeviceInfo device = device(initial.getId());
        Dashboard dashboard = dashboard(device);
        MapTemplateRuntimeResponse before = service.buildRuntime(dashboard);

        initial.setName("温度传感器");
        initial.setImage(null);
        MapTemplateRuntimeResponse renamed = service.buildRuntime(dashboard);
        assertEquals(expectedMetadata(initial), metadata(renamed, device));
        assertNotEquals(JacksonUtil.toString(before), JacksonUtil.toString(renamed));

        DeviceProfile replacement = profile("humidity", "/api/images/public/new.png");
        device.setDeviceProfileId(replacement.getId());
        MapTemplateRuntimeResponse reassigned = service.buildRuntime(dashboard);
        assertEquals(expectedMetadata(replacement), metadata(reassigned, device));
        assertNotEquals(JacksonUtil.toString(renamed), JacksonUtil.toString(reassigned));
        assertEquals(before.getVersion(), reassigned.getVersion());
        assertEquals(before.getTemplate(), reassigned.getTemplate());
    }

    private DeviceProfile profile(String name, String image) {
        DeviceProfile profile = new DeviceProfile(new DeviceProfileId(UUID.randomUUID()));
        profile.setName(name);
        profile.setImage(image);
        when(profileService.findDeviceProfileById(tenantId, profile.getId())).thenReturn(profile);
        return profile;
    }

    private DeviceInfo device(DeviceProfileId profileId) {
        DeviceInfo device = new DeviceInfo(new DeviceId(UUID.randomUUID()));
        device.setName("sim-device");
        device.setDeviceProfileId(profileId);
        device.setDeviceProfileName("device-info-name");
        device.setActive(true);
        when(deviceService.findDeviceInfoById(tenantId, device.getId())).thenReturn(device);
        return device;
    }

    private Dashboard dashboard(DeviceInfo... devices) {
        Dashboard dashboard = new Dashboard(new DashboardId(UUID.randomUUID()));
        dashboard.setTenantId(tenantId);
        ObjectNode configuration = JacksonUtil.OBJECT_MAPPER.createObjectNode();
        ArrayNode points = configuration.putObject("__mapWidgetEditor").putArray("mapPoints");
        for (DeviceInfo device : devices) {
            ObjectNode point = points.addObject().put("entityType", "DEVICE").put("entityId", device.getId().toString());
            ArrayNode keys = point.putObject("datasource").putArray("keys");
            for (String key : List.of("entityMetadata", "deviceProfileId", "deviceProfileName", "deviceProfileImage")) {
                keys.addObject().put("name", key).put("type", "attribute");
                keys.addObject().put("name", key).put("type", "timeseries");
            }
        }
        dashboard.setConfiguration(configuration);
        return dashboard;
    }

    private Object metadata(MapTemplateRuntimeResponse runtime, DeviceInfo device) {
        return runtime.getDevices().get(device.getId().toString()).get("entityMetadata");
    }

    private Map<String, String> expectedMetadata(DeviceProfile profile) {
        return profile.getImage() == null
                ? Map.of("deviceProfileId", profile.getId().toString(), "deviceProfileName", profile.getName())
                : Map.of("deviceProfileId", profile.getId().toString(), "deviceProfileName", profile.getName(),
                         "deviceProfileImage", profile.getImage());
    }
}
