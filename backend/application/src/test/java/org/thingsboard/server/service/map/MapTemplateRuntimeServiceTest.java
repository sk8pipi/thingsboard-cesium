/**
 * Copyright © 2016-2025 The Thingsboard Authors
 * Licensed under the Apache License, Version 2.0 (the "License");
 */
package org.thingsboard.server.service.map;

import com.fasterxml.jackson.databind.JsonNode;
import org.junit.Test;
import org.springframework.test.util.ReflectionTestUtils;
import org.thingsboard.common.util.JacksonUtil;

import java.util.Map;
import java.util.Set;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertTrue;

public class MapTemplateRuntimeServiceTest {
    @Test
    public void removedMapDevicesRemainInBusinessRuntimeWithoutCoordinates() throws Exception {
        MapTemplateRuntimeService service = new MapTemplateRuntimeService(null, null, null, null);
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
}
