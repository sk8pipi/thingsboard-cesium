/**
 * Copyright © 2016-2025 The Thingsboard Authors
 * Licensed under the Apache License, Version 2.0 (the "License");
 */
package org.thingsboard.server.controller;

import lombok.RequiredArgsConstructor;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;
import org.thingsboard.server.common.data.Device;
import org.thingsboard.server.common.data.id.DeviceId;
import org.thingsboard.server.queue.util.TbCoreComponent;
import org.thingsboard.server.service.map.MapDeviceLocationService;
import org.thingsboard.server.service.map.MapDeviceLocationService.LocationRequest;
import org.thingsboard.server.service.map.MapDeviceLocationService.LocationResponse;
import org.thingsboard.server.service.map.MapDeviceLocationService.SaveResponse;
import org.thingsboard.server.service.security.permission.Operation;

@RestController
@TbCoreComponent
@RequiredArgsConstructor
@RequestMapping("/api/map-device")
public class MapDeviceLocationController extends BaseController {
    private final MapDeviceLocationService locationService;

    @PreAuthorize("hasAnyAuthority('TENANT_ADMIN', 'CUSTOMER_USER')")
    @GetMapping("/{deviceId}/location")
    public LocationResponse getLocation(@PathVariable("deviceId") String deviceId) throws Exception {
        checkParameter("deviceId", deviceId);
        Device device = checkDeviceId(new DeviceId(toUUID(deviceId)), Operation.READ);
        return new LocationResponse(locationService.read(device));
    }

    @PreAuthorize("hasAuthority('TENANT_ADMIN')")
    @PutMapping("/{deviceId}/location")
    public SaveResponse saveLocation(@PathVariable("deviceId") String deviceId, @RequestBody LocationRequest request) throws Exception {
        checkParameter("deviceId", deviceId);
        Device device = checkDeviceId(new DeviceId(toUUID(deviceId)), Operation.WRITE);
        return locationService.save(device, request, getCurrentUser());
    }
}
