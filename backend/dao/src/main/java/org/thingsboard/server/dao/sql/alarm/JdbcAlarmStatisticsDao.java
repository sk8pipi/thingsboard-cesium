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
package org.thingsboard.server.dao.sql.alarm;

import org.springframework.jdbc.core.namedparam.MapSqlParameterSource;
import org.springframework.jdbc.core.namedparam.NamedParameterJdbcTemplate;
import org.springframework.stereotype.Repository;
import org.thingsboard.server.common.data.alarm.AlarmSeverity;
import org.thingsboard.server.common.data.id.CustomerId;
import org.thingsboard.server.common.data.id.TenantId;
import org.thingsboard.server.dao.alarm.AlarmStatisticsDao;

import java.util.List;

@Repository
public class JdbcAlarmStatisticsDao implements AlarmStatisticsDao {
    private final NamedParameterJdbcTemplate jdbc;

    public JdbcAlarmStatisticsDao(NamedParameterJdbcTemplate jdbc) {
        this.jdbc = jdbc;
    }

    @Override
    public long getCaptureStartedTime() {
        // A missing table/row is an unavailable service, never a valid zero count.
        return jdbc.getJdbcTemplate().queryForObject(
                "SELECT capture_started_time FROM alarm_statistics_state WHERE id = true", Long.class);
    }

    @Override
    public List<Count> count(TenantId tenantId, CustomerId customerId, long startTime, long endTime, long bucketSize) {
        var params = new MapSqlParameterSource()
                .addValue("tenant", tenantId.getId()).addValue("start", startTime)
                .addValue("end", endTime).addValue("size", bucketSize);
        String customerFilter = "";
        if (customerId != null) {
            customerFilter = " AND customer_id = :customer";
            params.addValue("customer", customerId.getId());
        }
        return jdbc.query("""
                SELECT ((created_time - :start) / :size) AS bucket_index, severity, count(*) AS total
                FROM alarm_occurrence
                WHERE tenant_id = :tenant AND created_time >= :start AND created_time < :end
                """ + customerFilter + " GROUP BY bucket_index, severity", params,
                (rs, row) -> new Count(rs.getInt("bucket_index"), parseSeverity(rs.getString("severity")), rs.getLong("total")));
    }

    private static AlarmSeverity parseSeverity(String value) {
        try {
            return AlarmSeverity.valueOf(value);
        } catch (IllegalArgumentException | NullPointerException e) {
            return AlarmSeverity.INDETERMINATE;
        }
    }
}
