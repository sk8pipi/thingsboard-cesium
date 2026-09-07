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

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.junit.After;
import org.junit.Before;
import org.junit.Test;
import org.junit.Assume;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.core.namedparam.NamedParameterJdbcTemplate;
import org.springframework.jdbc.datasource.DriverManagerDataSource;
import org.thingsboard.server.common.data.alarm.AlarmSeverity;
import org.thingsboard.server.common.data.id.CustomerId;
import org.thingsboard.server.common.data.id.TenantId;
import org.thingsboard.server.dao.alarm.AlarmStatisticsDao;

import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.sql.Connection;
import java.sql.DriverManager;
import java.util.UUID;
import java.util.concurrent.Executors;
import java.util.concurrent.Callable;
import java.util.ArrayList;

import static org.junit.Assert.*;

/** Opt-in integration test. Only a disposable loopback database named alarm_statistics_test is accepted. */
public class AlarmStatisticsPostgresTest {
    private String url;
    private String schema;
    private JdbcTemplate jdbc;
    private JdbcAlarmStatisticsDao dao;
    private UUID tenant;
    private UUID customer;
    private long now;
    private final ObjectMapper json = new ObjectMapper();

    @Before
    public void setUp() throws Exception {
        url = System.getenv("ALARM_STATISTICS_TEST_URL");
        Assume.assumeTrue("Set ALARM_STATISTICS_TEST_URL to a disposable database", url != null);
        if (!url.matches("jdbc:postgresql://127\\.0\\.0\\.1:[0-9]+/alarm_statistics_test")) {
            throw new IllegalArgumentException("Only the disposable loopback alarm_statistics_test database is permitted");
        }
        schema = "alarm_test_" + UUID.randomUUID().toString().replace("-", "");
        try (Connection connection = DriverManager.getConnection(url, "alarm_test", "")) {
            connection.createStatement().execute("CREATE SCHEMA " + schema);
        }
        var source = new DriverManagerDataSource(url + "?currentSchema=" + schema, "alarm_test", "");
        jdbc = new JdbcTemplate(source);
        for (String file : new String[]{"schema-ts-psql.sql", "schema-entities.sql", "schema-views.sql", "schema-functions.sql"}) {
            try (var input = getClass().getResourceAsStream("/sql/" + file)) {
                assertNotNull(file, input);
                jdbc.execute(new String(input.readAllBytes(), StandardCharsets.UTF_8));
            }
        }
        dao = new JdbcAlarmStatisticsDao(new NamedParameterJdbcTemplate(source));
        tenant = UUID.randomUUID();
        customer = UUID.randomUUID();
        now = System.currentTimeMillis();
        createTenant(tenant);
    }

    @After
    public void tearDown() throws Exception {
        if (schema != null) {
            try (Connection connection = DriverManager.getConnection(url, "alarm_test", "")) {
                connection.createStatement().execute("DROP SCHEMA " + schema + " CASCADE");
            }
        }
    }

    private void createTenant(UUID id) {
        UUID profile = UUID.randomUUID();
        jdbc.update("INSERT INTO tenant_profile(id, created_time, name) VALUES (?, 0, ?)", profile, profile.toString());
        jdbc.update("INSERT INTO tenant(id, created_time, tenant_profile_id) VALUES (?, 0, ?)", id, profile);
    }

    private JsonNode create(UUID owner, UUID id, UUID origin, UUID client, String severity, long time) throws Exception {
        return create(jdbc, owner, id, origin, client, severity, time);
    }

    private JsonNode create(JdbcTemplate template, UUID owner, UUID id, UUID origin, UUID client, String severity, long time) throws Exception {
        return json.readTree(template.queryForObject("""
                SELECT create_or_update_active_alarm(?::uuid, ?::uuid, ?::uuid, ?::bigint,
                  ?::uuid, 5, 'TEST'::varchar, ?::varchar, ?::bigint, ?::bigint,
                  '{}'::varchar, false, false, false, ''::varchar, true)
                """, String.class, owner, client, id, time, origin, severity, time, time));
    }

    private long count(UUID owner, UUID client) {
        return dao.count(TenantId.fromUUID(owner), client == null ? null : new CustomerId(client),
                now - 86400000L, now + 86400000L, 3600000L)
                .stream().mapToLong(AlarmStatisticsDao.Count::total).sum();
    }

    @Test
    public void deletionAndStatusChangesPreserveCountsWhileUpdatesKeepLatestSeverity() throws Exception {
        UUID id = UUID.randomUUID();
        UUID origin = UUID.randomUUID();
        assertTrue(create(tenant, id, origin, customer, "MAJOR", now).get("created").asBoolean());
        var repeated = create(tenant, UUID.randomUUID(), origin, UUID.randomUUID(), "CRITICAL", now);
        assertFalse(repeated.path("created").asBoolean());
        assertEquals(1, count(tenant, customer)); // Customer snapshot did not move.
        assertEquals("CRITICAL", jdbc.queryForObject("SELECT severity FROM alarm_occurrence", String.class));
        var update = jdbc.queryForObject("""
                SELECT update_alarm(?::uuid, ?::uuid, 'MINOR'::varchar, ?::bigint, ?::bigint,
                                    '{}'::varchar, false, false, false, ''::varchar)
                """, String.class, tenant, id, now, now);
        assertTrue(json.readTree(update).get("modified").asBoolean());
        assertEquals("MINOR", jdbc.queryForObject("SELECT severity FROM alarm_occurrence", String.class));
        var unchanged = create(tenant, UUID.randomUUID(), origin, customer, "MINOR", now);
        assertFalse(unchanged.get("modified").asBoolean());
        jdbc.queryForObject("SELECT acknowledge_alarm(?::uuid, ?::uuid, ?::bigint)", String.class, tenant, id, now);
        jdbc.queryForObject("SELECT clear_alarm(?::uuid, ?::uuid, ?::bigint, '{}'::varchar)", String.class, tenant, id, now);
        assertEquals(1, count(tenant, null));
        UUID next = UUID.randomUUID();
        assertTrue(create(tenant, next, origin, customer, "MAJOR", now).get("created").asBoolean());
        assertEquals(2, count(tenant, null));
        jdbc.update("DELETE FROM alarm WHERE tenant_id = ?", tenant); // Also models TTL removal.
        assertEquals(2, count(tenant, null));
        // A fresh DAO/connection still reads persisted data, without joining alarm.
        assertEquals(2, new JdbcAlarmStatisticsDao(new NamedParameterJdbcTemplate(jdbc))
                .count(TenantId.fromUUID(tenant), null, now - 1, now + 1, 3600000L)
                .stream().mapToLong(AlarmStatisticsDao.Count::total).sum());
    }

    @Test
    public void tenantAndCustomerIsolationAndTenantDeletion() throws Exception {
        UUID otherTenant = UUID.randomUUID();
        UUID otherCustomer = UUID.randomUUID();
        createTenant(otherTenant);
        create(tenant, UUID.randomUUID(), UUID.randomUUID(), customer, "MAJOR", now);
        create(tenant, UUID.randomUUID(), UUID.randomUUID(), otherCustomer, "MAJOR", now);
        create(otherTenant, UUID.randomUUID(), UUID.randomUUID(), customer, "CRITICAL", now);
        assertEquals(2, count(tenant, null));
        assertEquals(1, count(tenant, customer));
        assertEquals(0, count(tenant, UUID.randomUUID()));
        assertEquals(1, count(otherTenant, null));
        jdbc.update("DELETE FROM tenant WHERE id = ?", tenant);
        assertEquals(0, count(tenant, null));
        assertEquals(1, count(otherTenant, null));
    }

    @Test
    public void captureFailureRollsBackAlarmAndExplicitRollbackRollsBackBoth() throws Exception {
        UUID failedId = UUID.randomUUID();
        jdbc.execute("ALTER TABLE alarm_occurrence ADD CONSTRAINT reject_test CHECK (alarm_type <> 'TEST')");
        assertThrows(Exception.class, () -> create(tenant, failedId, UUID.randomUUID(), customer, "MAJOR", now));
        assertEquals(0L, (long) jdbc.queryForObject("SELECT count(*) FROM alarm WHERE id = ?", Long.class, failedId));
        jdbc.execute("ALTER TABLE alarm_occurrence DROP CONSTRAINT reject_test");
        try (Connection connection = jdbc.getDataSource().getConnection()) {
            connection.setAutoCommit(false);
            var transactional = new JdbcTemplate(new org.springframework.jdbc.datasource.SingleConnectionDataSource(connection, true));
            create(transactional, tenant, failedId, UUID.randomUUID(), customer, "MAJOR", now);
            assertEquals(1L, (long) transactional.queryForObject("SELECT count(*) FROM alarm", Long.class));
            assertEquals(1L, (long) transactional.queryForObject("SELECT count(*) FROM alarm_occurrence", Long.class));
            connection.rollback();
        }
        assertEquals(0, count(tenant, null));
        assertEquals(0L, (long) jdbc.queryForObject("SELECT count(*) FROM alarm_occurrence", Long.class));
        assertEquals(0L, (long) jdbc.queryForObject("SELECT count(*) FROM alarm", Long.class));
    }

    @Test
    public void concurrentDistinctAlarmsAndTimeBounds() throws Exception {
        var pool = Executors.newFixedThreadPool(4);
        try {
            var tasks = new ArrayList<Callable<Void>>();
            for (int i = 0; i < 20; i++) {
                tasks.add(() -> { create(tenant, UUID.randomUUID(), UUID.randomUUID(), customer, "MAJOR", now); return null; });
            }
            for (var future : pool.invokeAll(tasks)) future.get();
        } finally {
            pool.shutdownNow();
        }
        assertEquals(20, count(tenant, null));
        create(tenant, UUID.randomUUID(), UUID.randomUUID(), customer, "WARNING", now - 3600000L);
        create(tenant, UUID.randomUUID(), UUID.randomUUID(), customer, "MINOR", now + 1);
        var rows = dao.count(TenantId.fromUUID(tenant), null, now - 3600000L, now + 1, 3600000L);
        assertEquals(21, rows.stream().mapToLong(AlarmStatisticsDao.Count::total).sum());
        assertTrue(rows.stream().anyMatch(row -> row.bucketIndex() == 0 && row.severity() == AlarmSeverity.WARNING));
        assertTrue(rows.stream().anyMatch(row -> row.bucketIndex() == 1 && row.total() == 20));
    }

    @Test
    public void generatedMigrationBackfillsOnceAndDoesNotOverwriteLiveHistory() throws Exception {
        String path = System.getenv("ALARM_STATISTICS_MIGRATION_SQL");
        assertNotNull("Generate the migration SQL before running integration tests", path);
        UUID id = UUID.randomUUID();
        create(tenant, id, UUID.randomUUID(), customer, "MAJOR", now);
        long captureStart = dao.getCaptureStartedTime();
        UUID legacyId = UUID.randomUUID();
        jdbc.update("""
                INSERT INTO alarm(id, tenant_id, customer_id, created_time, type, severity, acknowledged, cleared)
                VALUES (?, ?, ?, ?, 'LEGACY', 'WARNING', false, false)
                """, legacyId, tenant, customer, now - 1000);
        String migration = Files.readString(Path.of(path));
        jdbc.execute(migration);
        jdbc.execute(migration);
        assertEquals(captureStart, dao.getCaptureStartedTime());
        assertEquals(2, count(tenant, customer));
        assertEquals("BACKFILL", jdbc.queryForObject("SELECT record_source FROM alarm_occurrence WHERE alarm_id = ?", String.class, legacyId));
        assertEquals("LIVE", jdbc.queryForObject("SELECT record_source FROM alarm_occurrence WHERE alarm_id = ?", String.class, id));
        jdbc.update("DELETE FROM alarm WHERE id = ?", legacyId);
        jdbc.execute(migration);
        assertEquals(2, count(tenant, customer));
    }

    @Test
    public void migrationActivatesAnUnmigratedDatabase() throws Exception {
        jdbc.execute("DROP TABLE alarm_occurrence; DROP TABLE alarm_statistics_state");
        assertThrows(org.springframework.dao.DataAccessException.class, () -> dao.getCaptureStartedTime());
        UUID legacyId = UUID.randomUUID();
        jdbc.update("INSERT INTO alarm(id, tenant_id, created_time, type, severity) VALUES (?, ?, ?, 'OLD', 'WARNING')",
                legacyId, tenant, now - 1000);
        jdbc.execute(Files.readString(Path.of(System.getenv("ALARM_STATISTICS_MIGRATION_SQL"))));
        assertEquals(1, count(tenant, null));
        assertTrue(dao.getCaptureStartedTime() >= now);
        create(tenant, UUID.randomUUID(), UUID.randomUUID(), customer, "MAJOR", now + 1);
        jdbc.update("DELETE FROM alarm WHERE tenant_id = ?", tenant);
        assertEquals(2, count(tenant, null));
    }

    @Test
    public void concurrentUpdatesDoNotMultiplyOneOccurrence() throws Exception {
        UUID origin = UUID.randomUUID();
        create(tenant, UUID.randomUUID(), origin, customer, "MAJOR", now);
        var pool = Executors.newFixedThreadPool(4);
        try {
            var tasks = new ArrayList<Callable<Void>>();
            for (int i = 0; i < 12; i++) {
                tasks.add(() -> { create(tenant, UUID.randomUUID(), origin, customer, "CRITICAL", now); return null; });
            }
            for (var future : pool.invokeAll(tasks)) future.get();
        } finally {
            pool.shutdownNow();
        }
        assertEquals(1, count(tenant, null));
        assertEquals("CRITICAL", jdbc.queryForObject("SELECT severity FROM alarm_occurrence", String.class));
    }
}
