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

import org.junit.Test;
import org.thingsboard.server.common.data.alarm.AlarmSeverity;
import org.thingsboard.server.common.data.id.TenantId;
import org.thingsboard.server.common.data.id.CustomerId;
import java.time.Clock;
import java.time.Instant;
import java.time.ZoneOffset;
import java.util.List;
import java.util.UUID;
import static org.junit.Assert.*;
import static org.mockito.Mockito.*;

public class AlarmStatisticsServiceTest {
    private static final long NOW = Instant.parse("2026-09-06T16:15:30Z").toEpochMilli();
    private final AlarmStatisticsDao dao = mock(AlarmStatisticsDao.class);
    private final AlarmStatisticsService service = new AlarmStatisticsService(dao,
            Clock.fixed(Instant.ofEpochMilli(NOW), ZoneOffset.UTC));
    private final TenantId tenant = TenantId.fromUUID(UUID.randomUUID());

    @Test
    public void dailyBucketsUseShanghaiAndCustomerScope() {
        var customer = new CustomerId(UUID.randomUUID());
        long start = Instant.parse("2026-08-31T16:00:00Z").toEpochMilli();
        when(dao.getCaptureStartedTime()).thenReturn(NOW - 1000);
        when(dao.count(tenant, customer, start, NOW + 1, 86400000L)).thenReturn(List.of(
                new AlarmStatisticsDao.Count(6, AlarmSeverity.MAJOR, 10),
                new AlarmStatisticsDao.Count(6, AlarmSeverity.CRITICAL, 2)));
        var result = service.getTrend(tenant, customer, "sevenDays");
        assertEquals(7, result.buckets().size());
        assertEquals("09/01", result.buckets().get(0).label());
        assertEquals("09/07", result.buckets().get(6).label());
        assertEquals(0, result.buckets().get(0).total());
        assertEquals(12, result.buckets().get(6).total());
        assertEquals(Long.valueOf(10), result.buckets().get(6).severityCounts().get(AlarmSeverity.MAJOR));
        assertTrue(result.historicalDataIncomplete());
        verify(dao).count(tenant, customer, start, NOW + 1, 86400000L);
    }

    @Test
    public void hourlyBucketsAreBoundedAndOldCoverageIsComplete() {
        long start = Instant.parse("2026-09-05T17:00:00Z").toEpochMilli();
        when(dao.getCaptureStartedTime()).thenReturn(start);
        when(dao.count(tenant, null, start, NOW + 1, 3600000L)).thenReturn(List.of());
        var result = service.getTrend(tenant, null, "twentyFourHours");
        assertEquals(24, result.buckets().size());
        assertEquals("01:00", result.buckets().get(0).label());
        assertEquals("00:00", result.buckets().get(23).label());
        assertFalse(result.historicalDataIncomplete());
        assertEquals(NOW, result.endTime());
        assertEquals("Asia/Shanghai", result.timeZone());
    }

    @Test
    public void rejectsInvalidModeWithoutQueryingDatabase() {
        assertThrows(IllegalArgumentException.class, () -> service.getTrend(tenant, null, "all"));
        verifyNoInteractions(dao);
    }

    @Test
    public void databaseFailureIsNotAnEmptyChart() {
        when(dao.getCaptureStartedTime()).thenThrow(new org.springframework.dao.DataAccessResourceFailureException("test"));
        assertThrows(org.springframework.dao.DataAccessException.class,
                () -> service.getTrend(tenant, null, "sevenDays"));
    }
}
