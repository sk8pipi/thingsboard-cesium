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
package org.thingsboard.server.service.video;

import jakarta.annotation.PostConstruct;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.core.RowMapper;
import org.springframework.stereotype.Repository;
import org.thingsboard.server.queue.util.TbCoreComponent;

import java.sql.ResultSet;
import java.sql.SQLException;
import java.util.List;
import java.util.Optional;
import java.util.UUID;

@Slf4j
@Repository
@TbCoreComponent
@RequiredArgsConstructor
public class VideoCameraBindingRepository {

    private static final RowMapper<VideoCameraBinding> ROW_MAPPER = VideoCameraBindingRepository::mapRow;

    private final JdbcTemplate jdbcTemplate;

    @Value("${video.binding.auto-initialize-schema:true}")
    private boolean autoInitializeSchema;

    @PostConstruct
    void initializeSchema() {
        if (!autoInitializeSchema) {
            return;
        }
        jdbcTemplate.execute("""
                CREATE TABLE IF NOT EXISTS video_camera_binding (
                    id uuid NOT NULL CONSTRAINT video_camera_binding_pkey PRIMARY KEY,
                    created_time bigint NOT NULL,
                    updated_time bigint NOT NULL,
                    tenant_id uuid NOT NULL,
                    tb_device_id uuid NOT NULL,
                    camera_code varchar(255) NOT NULL,
                    provider varchar(64) NOT NULL,
                    provider_device_id varchar(255),
                    provider_channel_id varchar(255),
                    media_server_id varchar(255),
                    stream_app varchar(255) NOT NULL,
                    stream_id varchar(255) NOT NULL,
                    preferred_protocol varchar(32) NOT NULL,
                    enabled boolean NOT NULL DEFAULT true,
                    CONSTRAINT video_camera_binding_device_unq_key UNIQUE (tb_device_id),
                    CONSTRAINT video_camera_binding_camera_code_unq_key UNIQUE (tenant_id, camera_code),
                    CONSTRAINT fk_video_camera_binding_device
                        FOREIGN KEY (tb_device_id) REFERENCES device(id) ON DELETE CASCADE
                )
                """);
        jdbcTemplate.execute("CREATE INDEX IF NOT EXISTS idx_video_camera_binding_tenant_id ON video_camera_binding(tenant_id)");
        jdbcTemplate.execute("""
                CREATE INDEX IF NOT EXISTS idx_video_camera_binding_provider_stream
                    ON video_camera_binding(provider, stream_app, stream_id)
                """);
        jdbcTemplate.execute("""
                CREATE UNIQUE INDEX IF NOT EXISTS idx_video_camera_binding_provider_channel_unq
                    ON video_camera_binding(tenant_id, provider, provider_device_id, provider_channel_id)
                    WHERE enabled = true AND provider_device_id IS NOT NULL AND provider_channel_id IS NOT NULL
                """);
        log.info("Video camera binding schema is ready");
    }

    public Optional<VideoCameraBinding> findByTenantIdAndDeviceId(UUID tenantId, UUID deviceId) {
        return jdbcTemplate.query("""
                        SELECT *
                        FROM video_camera_binding
                        WHERE tenant_id = ? AND tb_device_id = ?
                        """,
                ROW_MAPPER,
                tenantId,
                deviceId).stream().findFirst();
    }

    public Optional<VideoCameraBinding> findByTenantIdAndCameraCode(UUID tenantId, String cameraCode) {
        return jdbcTemplate.query("""
                        SELECT *
                        FROM video_camera_binding
                        WHERE tenant_id = ? AND camera_code = ?
                        """,
                ROW_MAPPER,
                tenantId,
                cameraCode).stream().findFirst();
    }

    public List<VideoCameraBinding> findAllByTenantId(UUID tenantId) {
        return jdbcTemplate.query("""
                        SELECT *
                        FROM video_camera_binding
                        WHERE tenant_id = ?
                        ORDER BY camera_code
                        """,
                ROW_MAPPER,
                tenantId);
    }

    public List<VideoCameraBinding> findAllByStream(String app, String stream, String mediaServerId) {
        return jdbcTemplate.query("""
                        SELECT *
                        FROM video_camera_binding
                        WHERE stream_app = ?
                          AND stream_id = ?
                          AND enabled = true
                          AND (media_server_id = ? OR (media_server_id IS NULL AND ? IS NULL))
                        """,
                ROW_MAPPER,
                app,
                stream,
                mediaServerId,
                mediaServerId);
    }

    public VideoCameraBinding save(UUID tenantId, UUID deviceId, VideoCameraBindingRequest request) {
        long now = System.currentTimeMillis();
        UUID id = UUID.randomUUID();
        return jdbcTemplate.queryForObject("""
                        INSERT INTO video_camera_binding (
                            id, created_time, updated_time, tenant_id, tb_device_id,
                            camera_code, provider, provider_device_id, provider_channel_id,
                            media_server_id, stream_app, stream_id, preferred_protocol, enabled
                        )
                        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                        ON CONFLICT (tb_device_id) DO UPDATE SET
                            updated_time = EXCLUDED.updated_time,
                            camera_code = EXCLUDED.camera_code,
                            provider = EXCLUDED.provider,
                            provider_device_id = EXCLUDED.provider_device_id,
                            provider_channel_id = EXCLUDED.provider_channel_id,
                            media_server_id = EXCLUDED.media_server_id,
                            stream_app = EXCLUDED.stream_app,
                            stream_id = EXCLUDED.stream_id,
                            preferred_protocol = EXCLUDED.preferred_protocol,
                            enabled = EXCLUDED.enabled
                        RETURNING *
                        """,
                ROW_MAPPER,
                id,
                now,
                now,
                tenantId,
                deviceId,
                request.cameraCode(),
                request.provider(),
                request.providerDeviceId(),
                request.providerChannelId(),
                request.mediaServerId(),
                request.streamApp(),
                request.streamId(),
                request.preferredProtocol(),
                request.enabled());
    }

    public boolean delete(UUID tenantId, UUID deviceId) {
        return jdbcTemplate.update("""
                DELETE FROM video_camera_binding
                WHERE tenant_id = ? AND tb_device_id = ?
                """, tenantId, deviceId) > 0;
    }

    private static VideoCameraBinding mapRow(ResultSet resultSet, int rowNum) throws SQLException {
        return new VideoCameraBinding(
                resultSet.getObject("id", UUID.class),
                resultSet.getLong("created_time"),
                resultSet.getLong("updated_time"),
                resultSet.getObject("tenant_id", UUID.class),
                resultSet.getObject("tb_device_id", UUID.class),
                resultSet.getString("camera_code"),
                resultSet.getString("provider"),
                resultSet.getString("provider_device_id"),
                resultSet.getString("provider_channel_id"),
                resultSet.getString("media_server_id"),
                resultSet.getString("stream_app"),
                resultSet.getString("stream_id"),
                resultSet.getString("preferred_protocol"),
                resultSet.getBoolean("enabled"));
    }
}
