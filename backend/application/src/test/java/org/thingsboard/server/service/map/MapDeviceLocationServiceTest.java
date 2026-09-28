/**
 * Copyright © 2016-2025 The Thingsboard Authors
 * Licensed under the Apache License, Version 2.0 (the "License");
 */
package org.thingsboard.server.service.map;

import com.fasterxml.jackson.databind.node.ObjectNode;
import com.google.common.util.concurrent.Futures;
import org.junit.Before;
import org.junit.Test;
import org.mockito.ArgumentCaptor;
import org.thingsboard.common.util.JacksonUtil;
import org.thingsboard.server.common.data.AttributeScope;
import org.thingsboard.server.common.data.Device;
import org.thingsboard.server.common.data.User;
import org.thingsboard.server.common.data.exception.EntityVersionMismatchException;
import org.thingsboard.server.common.data.id.DeviceId;
import org.thingsboard.server.common.data.id.TenantId;
import org.thingsboard.server.common.data.kv.BaseAttributeKvEntry;
import org.thingsboard.server.common.data.kv.DoubleDataEntry;
import org.thingsboard.server.dao.attributes.AttributesService;
import org.thingsboard.server.service.entitiy.device.TbDeviceService;
import org.thingsboard.server.service.map.MapDeviceLocationService.LocationRequest;

import java.math.BigDecimal;
import java.util.List;
import java.util.UUID;

import static org.junit.Assert.*;
import static org.mockito.ArgumentMatchers.*;
import static org.mockito.Mockito.*;

public class MapDeviceLocationServiceTest {
    private final TenantId tenantId = new TenantId(UUID.randomUUID());
    private AttributesService attributes;
    private TbDeviceService devices;
    private MapDeviceLocationProjectionService projection;
    private MapDeviceLocationService service;
    private Device device;
    private User user;

    @Before
    public void setUp() {
        attributes = mock(AttributesService.class);
        devices = mock(TbDeviceService.class);
        projection = mock(MapDeviceLocationProjectionService.class);
        service = new MapDeviceLocationService(attributes, devices, projection);
        device = new Device(new DeviceId(UUID.randomUUID()));
        device.setTenantId(tenantId);
        device.setVersion(12L);
        device.setAdditionalInfo(JacksonUtil.OBJECT_MAPPER.createObjectNode().put("description", "keep"));
        user = new User();
        user.setTenantId(tenantId);
        when(attributes.find(eq(tenantId), eq(device.getId()), eq(AttributeScope.SERVER_SCOPE), anyCollection()))
                .thenReturn(Futures.immediateFuture(List.of()));
        when(projection.project(any())).thenReturn(true);
    }

    @Test
    public void firstConfirmationUsesReadEntityVersionAndAtomicallyUpdatesAliases() throws Exception {
        var response = service.save(device, request(0, 120), user);
        ArgumentCaptor<Device> captured = ArgumentCaptor.forClass(Device.class);
        verify(devices).save(captured.capture(), isNull(), eq(user));
        Device saved = captured.getValue();
        assertEquals(Long.valueOf(12), saved.getVersion());
        assertEquals("keep", saved.getAdditionalInfo().path("description").asText());
        assertEquals(120, saved.getAdditionalInfo().path("lng").asDouble(), 0);
        assertEquals(30, saved.getAdditionalInfo().path("lat").asDouble(), 0);
        assertEquals(50, saved.getAdditionalInfo().path("altitude").asDouble(), 0);
        assertEquals("absolute", saved.getAdditionalInfo().path("heightMode").asText());
        assertEquals(1, response.location().revision());
        assertEquals("confirmed", response.location().source());
        assertTrue(response.attributesSynced());
        assertFalse(device.getAdditionalInfo().has("mapLocation"));
        verifyNoInteractions(attributes);
    }

    @Test
    public void wrongRevisionCannotOverwriteNewerPosition() {
        confirm(3, 119);
        assertThrows(EntityVersionMismatchException.class, () -> service.save(device, request(2, 120), user));
        assertThrows(EntityVersionMismatchException.class, () -> service.save(device, request(4, 119), user));
        verifyNoInteractions(devices, projection);
    }

    @Test
    public void sameTargetRetryIsIdempotentAndRetriesLatestProjection() throws Exception {
        confirm(3, 120);
        var result = service.save(device, request(2, 120), user);
        assertEquals(3, result.location().revision());
        verifyNoInteractions(devices);
        verify(projection).project(device);
    }

    @Test
    public void databaseOptimisticConflictPropagatesWithoutProjecting() throws Exception {
        when(devices.save(any(), isNull(), eq(user))).thenThrow(new EntityVersionMismatchException("race", null));
        assertThrows(EntityVersionMismatchException.class, () -> service.save(device, request(0, 120), user));
        verifyNoInteractions(projection);
    }

    @Test
    public void missingDatabaseVersionNeverEnablesUnconditionalOverwrite() {
        device.setVersion(null);
        assertThrows(EntityVersionMismatchException.class, () -> service.save(device, request(0, 120), user));
        verifyNoInteractions(devices, projection);
    }

    @Test
    public void projectionFailureKeepsCanonicalSuccess() throws Exception {
        when(projection.project(device)).thenReturn(false);
        var response = service.save(device, request(0, 120), user);
        assertEquals(1, response.location().revision());
        assertFalse(response.attributesSynced());
        verify(devices).save(any(), isNull(), eq(user));
    }

    @Test
    public void invalidCoordinatesAndFractionalRevisionNeverWrite() {
        for (LocationRequest invalid : List.of(
                new LocationRequest(181D, 30D, 0D, BigDecimal.ZERO),
                new LocationRequest(120D, 91D, 0D, BigDecimal.ZERO),
                new LocationRequest(Double.NaN, 30D, 0D, BigDecimal.ZERO),
                new LocationRequest(120D, 30D, Double.POSITIVE_INFINITY, BigDecimal.ZERO),
                new LocationRequest(120D, 30D, null, BigDecimal.ZERO),
                new LocationRequest(120D, 30D, 0D, null),
                new LocationRequest(120D, 30D, 0D, new BigDecimal("1.2")),
                new LocationRequest(120D, 30D, 0D, new BigDecimal("-1")),
                new LocationRequest(120D, 30D, 0D, new BigDecimal("999999999999999999999")))) {
            assertThrows(IllegalArgumentException.class, () -> service.save(device, invalid, user));
        }
        verifyNoInteractions(devices, projection);
    }

    @Test
    public void canonicalBeatsEveryLegacySourceWithoutAttributeRead() throws Exception {
        confirm(2, 120);
        ((ObjectNode) device.getAdditionalInfo()).put("longitude", 99).put("latitude", 12);
        assertEquals(120, service.read(device).longitude(), 0);
        assertEquals(2, service.read(device).revision());
        verifyNoInteractions(attributes);
    }

    @Test
    public void legacyAdditionalInfoPrecedesServerScopeAndNeverWrites() throws Exception {
        ((ObjectNode) device.getAdditionalInfo()).put("lng", "120.5").put("lat", 30).put("altitude", 60);
        var location = service.read(device);
        assertEquals(120.5, location.longitude(), 0);
        assertEquals(60, location.height(), 0);
        assertEquals("legacy", location.source());
        assertEquals(0, location.revision());
        verifyNoInteractions(attributes, devices, projection);
    }

    @Test
    public void legacyServerScopeIsOnlyFallback() throws Exception {
        when(attributes.find(eq(tenantId), eq(device.getId()), eq(AttributeScope.SERVER_SCOPE), anyCollection()))
                .thenReturn(Futures.immediateFuture(List.of(
                        new BaseAttributeKvEntry(new DoubleDataEntry("longitude", 120D), 1),
                        new BaseAttributeKvEntry(new DoubleDataEntry("latitude", 30D), 1))));
        assertEquals(120, service.read(device).longitude(), 0);
        assertEquals(0, service.read(device).height(), 0);
        verify(attributes, times(2)).find(eq(tenantId), eq(device.getId()), eq(AttributeScope.SERVER_SCOPE), anyCollection());
        verifyNoInteractions(devices, projection);
    }

    @Test
    public void unavailableAndMissingLocationsAreDifferent() throws Exception {
        assertNull(service.read(device));
        when(attributes.find(eq(tenantId), eq(device.getId()), eq(AttributeScope.SERVER_SCOPE), anyCollection()))
                .thenReturn(Futures.immediateFailedFuture(new IllegalStateException("unavailable")));
        assertThrows(Exception.class, () -> service.read(device));
    }

    @Test
    public void malformedCanonicalDoesNotReviveLegacyOrResetRevision() throws Exception {
        ((ObjectNode) device.getAdditionalInfo()).putNull("mapLocation").put("longitude", 120).put("latitude", 30);
        assertNull(service.read(device));
        assertThrows(IllegalArgumentException.class, () -> service.save(device, request(0, 120), user));
        verifyNoInteractions(attributes, devices, projection);
    }

    @Test
    public void genericOldSavePreservesLocationAndAttachesDatabaseVersion() {
        confirm(3, 120);
        Device incoming = new Device(device.getId());
        incoming.setAdditionalInfo(JacksonUtil.OBJECT_MAPPER.createObjectNode().put("label", "new").put("longitude", 99));
        MapDeviceLocationService.protectGenericSave(incoming, device);
        assertEquals(device.getAdditionalInfo().path("mapLocation"), incoming.getAdditionalInfo().path("mapLocation"));
        assertEquals(120, incoming.getAdditionalInfo().path("longitude").asDouble(), 0);
        assertEquals("new", incoming.getAdditionalInfo().path("label").asText());
        assertEquals(device.getVersion(), incoming.getVersion());
    }

    @Test
    public void genericCreationCannotInjectCanonicalAndStaleVersionRemainsStale() {
        confirm(3, 120);
        Device incoming = new Device(device);
        incoming.setVersion(1L);
        MapDeviceLocationService.protectGenericSave(incoming, device);
        assertEquals(Long.valueOf(1), incoming.getVersion());
        MapDeviceLocationService.protectGenericSave(incoming, null);
        assertFalse(incoming.getAdditionalInfo().has("mapLocation"));
    }

    private LocationRequest request(long revision, double longitude) {
        return new LocationRequest(longitude, 30D, 50D, BigDecimal.valueOf(revision));
    }

    private void confirm(long revision, double longitude) {
        ((ObjectNode) device.getAdditionalInfo()).set("mapLocation", JacksonUtil.OBJECT_MAPPER.valueToTree(
                new MapDeviceLocationService.DeviceLocation(longitude, 30, 50, "absolute", revision, 12345, "confirmed")));
    }
}
