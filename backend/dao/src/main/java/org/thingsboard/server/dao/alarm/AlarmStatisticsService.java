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
package org.thingsboard.server.dao.alarm;

import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Isolation;
import org.springframework.transaction.annotation.Transactional;
import org.thingsboard.server.common.data.alarm.AlarmSeverity;
import org.thingsboard.server.common.data.alarm.AlarmTrend;
import org.thingsboard.server.common.data.id.CustomerId;
import org.thingsboard.server.common.data.id.TenantId;

import java.time.Clock;
import java.time.Instant;
import java.time.ZoneId;
import java.time.temporal.ChronoUnit;
import java.time.format.DateTimeFormatter;
import java.util.ArrayList;
import java.util.EnumMap;
import java.util.List;
import java.util.Map;

@Service
public class AlarmStatisticsService {
    private static final ZoneId ZONE = ZoneId.of("Asia/Shanghai");
    private final AlarmStatisticsDao dao;
    private final Clock clock;

    @Autowired
    public AlarmStatisticsService(AlarmStatisticsDao dao) {
        this(dao, Clock.systemUTC());
    }

    AlarmStatisticsService(AlarmStatisticsDao dao, Clock clock) {
        this.dao = dao;
        this.clock = clock;
    }

    @Transactional(readOnly = true, isolation = Isolation.REPEATABLE_READ)
    public AlarmTrend getTrend(TenantId tenantId, CustomerId customerId, String mode) {
        if (!"sevenDays".equals(mode) && !"twentyFourHours".equals(mode)) {
            throw new IllegalArgumentException("mode must be sevenDays or twentyFourHours");
        }
        if (tenantId == null || tenantId.isNullUid()) {
            throw new IllegalArgumentException("Tenant is required");
        }
        boolean daily = "sevenDays".equals(mode);
        long now = clock.millis();
        var localNow = Instant.ofEpochMilli(now).atZone(ZONE);
        var start = daily ? localNow.toLocalDate().atStartOfDay(ZONE).minusDays(6)
                : localNow.truncatedTo(ChronoUnit.HOURS).minusHours(23);
        long startTime = start.toInstant().toEpochMilli();
        long bucketSize = daily ? 86_400_000L : 3_600_000L;
        int count = daily ? 7 : 24;
        long completeFrom = dao.getCaptureStartedTime();
        List<Map<AlarmSeverity, Long>> counts = new ArrayList<>(count);
        for (int index = 0; index < count; index++) {
            Map<AlarmSeverity, Long> severities = new EnumMap<>(AlarmSeverity.class);
            for (AlarmSeverity severity : AlarmSeverity.values()) {
                severities.put(severity, 0L);
            }
            counts.add(severities);
        }
        // Inclusive server 'now', exclusive SQL upper bound; no future alarms enter the current bucket.
        for (var row : dao.count(tenantId, customerId, startTime, now + 1, bucketSize)) {
            if (row.bucketIndex() >= 0 && row.bucketIndex() < count) {
                counts.get(row.bucketIndex()).merge(row.severity(), row.total(), Long::sum);
            }
        }
        List<AlarmTrend.Bucket> buckets = new ArrayList<>(count);
        var labelFormat = DateTimeFormatter.ofPattern(daily ? "MM/dd" : "HH:mm");
        for (int index = 0; index < count; index++) {
            long bucketStart = startTime + index * bucketSize;
            var severities = counts.get(index);
            buckets.add(new AlarmTrend.Bucket((daily ? "day-" : "hour-") + bucketStart,
                    bucketStart, bucketStart + bucketSize,
                    Instant.ofEpochMilli(bucketStart).atZone(ZONE).format(labelFormat),
                    severities.values().stream().mapToLong(Long::longValue).sum(), severities));
        }
        return new AlarmTrend(mode, ZONE.getId(), now, startTime, now, completeFrom,
                startTime < completeFrom, buckets);
    }
}
