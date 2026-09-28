/**
 * Copyright © 2016-2025 The Thingsboard Authors
 * Licensed under the Apache License, Version 2.0 (the "License");
 */
package org.thingsboard.server.service.map;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.node.ObjectNode;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.thingsboard.common.util.JacksonUtil;
import org.thingsboard.server.common.data.AttributeScope;
import org.thingsboard.server.common.data.Device;
import org.thingsboard.server.common.data.User;
import org.thingsboard.server.common.data.exception.EntityVersionMismatchException;
import org.thingsboard.server.common.data.kv.AttributeKvEntry;
import org.thingsboard.server.dao.attributes.AttributesService;
import org.thingsboard.server.queue.util.TbCoreComponent;
import org.thingsboard.server.service.entitiy.device.TbDeviceService;

import java.math.BigDecimal;
import java.util.List;
import java.util.Optional;
import java.util.concurrent.TimeUnit;

/** The only map position writer; callers must authorize the supplied device before invoking it. */
@Service
@TbCoreComponent
@RequiredArgsConstructor
public class MapDeviceLocationService {
    private static final String LOCATION = "mapLocation";
    private static final List<String> LONGITUDE_KEYS = List.of("longitude", "lon", "lng");
    private static final List<String> LATITUDE_KEYS = List.of("latitude", "lat");
    private static final List<String> HEIGHT_KEYS = List.of("height", "altitude", "alt");
    private static final List<String> LOCATION_KEYS = List.of("longitude", "lon", "lng", "latitude", "lat", "height", "altitude", "alt");
    private final AttributesService attributesService;
    private final TbDeviceService tbDeviceService;
    private final MapDeviceLocationProjectionService projectionService;

    public record DeviceLocation(double longitude, double latitude, double height, String heightMode,
                                 long revision, long updatedTime, String source) { }

    public record LocationRequest(Double longitude, Double latitude, Double height, BigDecimal expectedRevision) { }
    public record LocationResponse(DeviceLocation location) { }
    public record SaveResponse(DeviceLocation location, boolean attributesSynced) { }

    public DeviceLocation read(Device device) throws Exception {
        JsonNode info = device.getAdditionalInfo();
        // A malformed canonical record must not silently revive a legacy location.
        if (hasCanonical(info)) {
            return confirmed(info);
        }
        DeviceLocation legacy = legacy(info);
        if (legacy != null) {
            return legacy;
        }
        List<AttributeKvEntry> entries;
        try {
            entries = attributesService.find(device.getTenantId(), device.getId(), AttributeScope.SERVER_SCOPE, LOCATION_KEYS)
                    .get(5, TimeUnit.SECONDS);
        } catch (InterruptedException e) {
            Thread.currentThread().interrupt();
            throw e;
        }
        ObjectNode attributes = JacksonUtil.OBJECT_MAPPER.createObjectNode();
        if (entries != null) {
            for (AttributeKvEntry entry : entries) {
                Object value = entry.getValue();
                if (value instanceof Optional<?> optional) {
                    value = optional.orElse(null);
                }
                attributes.set(entry.getKey(), JacksonUtil.OBJECT_MAPPER.valueToTree(value));
            }
        }
        return legacy(attributes);
    }

    public SaveResponse save(Device authorizedDevice, LocationRequest request, User user) throws Exception {
        long expectedRevision = validate(request);
        if (!authorizedDevice.getTenantId().equals(user.getTenantId())) {
            throw new IllegalArgumentException("Device does not belong to the current tenant");
        }
        DeviceLocation current = confirmed(authorizedDevice.getAdditionalInfo());
        if (hasCanonical(authorizedDevice.getAdditionalInfo()) && current == null) {
            throw new IllegalArgumentException("Invalid canonical device location; administrator repair required");
        }
        long revision = current == null ? 0 : current.revision();
        if (current != null && samePosition(current, request) && expectedRevision <= revision) {
            return new SaveResponse(current, projectionService.project(authorizedDevice));
        }
        if (expectedRevision != revision) {
            throw conflict();
        }
        // Never pass null: the DAO interprets a missing version as an unconditional overwrite.
        if (authorizedDevice.getVersion() == null || revision == Long.MAX_VALUE) {
            throw conflict();
        }
        Device update = new Device(authorizedDevice);
        ObjectNode info = copyInfo(authorizedDevice.getAdditionalInfo());
        long updatedTime = Math.max(System.currentTimeMillis(), current == null ? 0 : current.updatedTime() + 1);
        DeviceLocation location = new DeviceLocation(request.longitude(), request.latitude(), request.height(),
                "absolute", revision + 1, updatedTime, "confirmed");
        info.set(LOCATION, JacksonUtil.OBJECT_MAPPER.valueToTree(location));
        putCompatibilityFields(info, location);
        update.setAdditionalInfo(info);
        // Keep the exact entity version read during authorization. A concurrent device/location save
        // must fail at the database merge, never re-read a newer version and overwrite it.
        tbDeviceService.save(update, null, user);
        return new SaveResponse(location, projectionService.project(authorizedDevice));
    }

    /** Protect the reserved record at both generic Device REST save entry points. */
    public static void protectGenericSave(Device incoming, Device existing) {
        ObjectNode info = copyInfo(incoming.getAdditionalInfo());
        JsonNode existingInfo = existing == null ? null : existing.getAdditionalInfo();
        if (hasCanonical(existingInfo)) {
            info.set(LOCATION, existingInfo.get(LOCATION).deepCopy());
            DeviceLocation location = confirmed(existingInfo);
            if (location != null) {
                putCompatibilityFields(info, location);
            }
        } else {
            info.remove(LOCATION);
        }
        incoming.setAdditionalInfo(info);
        if (existing != null && incoming.getVersion() == null) {
            if (existing.getVersion() == null) {
                throw conflict();
            }
            // Even before the first confirmation, a racing location PUT must be protected.
            incoming.setVersion(existing.getVersion());
        }
    }

    private static long validate(LocationRequest request) {
        if (request == null || !valid(request.longitude(), request.latitude(), request.height()) || request.expectedRevision() == null) {
            throw new IllegalArgumentException("Finite longitude, latitude, height and non-negative integer expectedRevision are required");
        }
        try {
            long revision = request.expectedRevision().longValueExact();
            if (revision < 0) {
                throw new ArithmeticException();
            }
            return revision;
        } catch (ArithmeticException e) {
            throw new IllegalArgumentException("expectedRevision must be a non-negative integer");
        }
    }

    private static EntityVersionMismatchException conflict() {
        return new EntityVersionMismatchException("Device location changed; reload before confirming a new position", null);
    }

    private static boolean samePosition(DeviceLocation location, LocationRequest request) {
        return location.longitude() == request.longitude() && location.latitude() == request.latitude() && location.height() == request.height();
    }

    private static boolean hasCanonical(JsonNode info) {
        return info != null && info.isObject() && info.has(LOCATION);
    }

    static DeviceLocation confirmed(JsonNode info) {
        if (!hasCanonical(info)) {
            return null;
        }
        JsonNode node = info.get(LOCATION);
        Double longitude = number(node, List.of("longitude"));
        Double latitude = number(node, List.of("latitude"));
        Double height = number(node, List.of("height"));
        if (!valid(longitude, latitude, height) || !"absolute".equals(node.path("heightMode").asText()) ||
                !node.path("revision").isIntegralNumber() || !node.path("revision").canConvertToLong() || node.path("revision").asLong() < 1 ||
                !node.path("updatedTime").isIntegralNumber() || !node.path("updatedTime").canConvertToLong() || node.path("updatedTime").asLong() < 0) {
            return null;
        }
        return new DeviceLocation(longitude, latitude, height, "absolute", node.path("revision").asLong(), node.path("updatedTime").asLong(), "confirmed");
    }

    private static DeviceLocation legacy(JsonNode info) {
        Double longitude = number(info, LONGITUDE_KEYS);
        Double latitude = number(info, LATITUDE_KEYS);
        Double height = number(info, HEIGHT_KEYS);
        if (height == null) {
            height = 0D;
        }
        return valid(longitude, latitude, height) ? new DeviceLocation(longitude, latitude, height, "absolute", 0, 0, "legacy") : null;
    }

    private static boolean valid(Double longitude, Double latitude, Double height) {
        return longitude != null && latitude != null && height != null && Double.isFinite(longitude) && Double.isFinite(latitude)
                && Double.isFinite(height) && Math.abs(longitude) <= 180 && Math.abs(latitude) <= 90;
    }

    private static Double number(JsonNode info, List<String> keys) {
        if (info == null || !info.isObject()) {
            return null;
        }
        for (String key : keys) {
            JsonNode value = info.get(key);
            if (value == null || (!value.isNumber() && !value.isTextual())) {
                continue;
            }
            try {
                double number = Double.parseDouble(value.asText());
                if (Double.isFinite(number)) {
                    return number;
                }
            } catch (NumberFormatException ignored) {
                // Try the next legacy alias.
            }
        }
        return null;
    }

    private static ObjectNode copyInfo(JsonNode info) {
        return info != null && info.isObject() ? ((ObjectNode) info).deepCopy() : JacksonUtil.OBJECT_MAPPER.createObjectNode();
    }

    static void putCompatibilityFields(ObjectNode info, DeviceLocation location) {
        LONGITUDE_KEYS.forEach(key -> info.put(key, location.longitude()));
        LATITUDE_KEYS.forEach(key -> info.put(key, location.latitude()));
        HEIGHT_KEYS.forEach(key -> info.put(key, location.height()));
        info.put("heightMode", "absolute");
    }
}
