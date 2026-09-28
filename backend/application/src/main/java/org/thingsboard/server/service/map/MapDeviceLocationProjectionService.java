/**
 * Copyright © 2016-2025 The Thingsboard Authors
 * Licensed under the Apache License, Version 2.0 (the "License");
 */
package org.thingsboard.server.service.map;

import com.fasterxml.jackson.databind.node.ObjectNode;
import com.google.common.util.concurrent.Uninterruptibles;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.TransactionDefinition;
import org.springframework.transaction.support.TransactionTemplate;
import org.thingsboard.common.util.JacksonUtil;
import org.thingsboard.server.common.data.AttributeScope;
import org.thingsboard.server.common.data.Device;
import org.thingsboard.server.common.data.kv.BaseAttributeKvEntry;
import org.thingsboard.server.common.data.kv.DoubleDataEntry;
import org.thingsboard.server.common.data.kv.KvEntry;
import org.thingsboard.server.common.data.kv.StringDataEntry;
import org.thingsboard.server.dao.attributes.AttributesService;
import org.thingsboard.server.queue.util.TbCoreComponent;

/** Projects only a committed, freshly locked device record, never a request's captured target. */
@Slf4j
@Service
@TbCoreComponent
@RequiredArgsConstructor
public class MapDeviceLocationProjectionService {
    private final JdbcTemplate jdbcTemplate;
    private final PlatformTransactionManager transactionManager;
    private final AttributesService attributesService;

    public boolean project(Device device) {
        TransactionTemplate transaction = new TransactionTemplate(transactionManager);
        transaction.setPropagationBehavior(TransactionDefinition.PROPAGATION_REQUIRES_NEW);
        transaction.setIsolationLevel(TransactionDefinition.ISOLATION_READ_COMMITTED);
        try {
            return Boolean.TRUE.equals(transaction.execute(status -> {
                // Bound waiting to acquire the row; this does not time out an in-flight attribute write.
                jdbcTemplate.execute("SET LOCAL lock_timeout = '5s'");
                String json = jdbcTemplate.queryForObject(
                        "SELECT additional_info FROM device WHERE id = ? AND tenant_id = ? FOR UPDATE",
                        String.class, device.getId().getId(), device.getTenantId().getId());
                var location = MapDeviceLocationService.confirmed(JacksonUtil.toJsonNode(json));
                if (location == null) {
                    return false;
                }
                ObjectNode aliases = JacksonUtil.OBJECT_MAPPER.createObjectNode();
                MapDeviceLocationService.putCompatibilityFields(aliases, location);
                var fields = aliases.fields();
                while (fields.hasNext()) {
                    var field = fields.next();
                    KvEntry value = field.getValue().isNumber()
                            ? new DoubleDataEntry(field.getKey(), field.getValue().asDouble())
                            : new StringDataEntry(field.getKey(), field.getValue().asText());
                    try {
                        // Save one at a time: the list overload uses fail-fast allAsList, which can
                        // finish while other queued writes are still live. Do not release the row
                        // lock on timeout/interruption with a late old write still in flight.
                        Uninterruptibles.getUninterruptibly(attributesService.save(device.getTenantId(), device.getId(),
                                AttributeScope.SERVER_SCOPE, new BaseAttributeKvEntry(value, location.updatedTime())));
                    } catch (Exception e) {
                        return false;
                    }
                }
                return true;
            }));
        } catch (Exception e) {
            log.debug("[{}] Device location compatibility projection unavailable", device.getId());
            return false;
        }
    }
}
