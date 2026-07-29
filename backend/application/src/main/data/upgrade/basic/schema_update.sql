--
-- Copyright © 2016-2025 The Thingsboard Authors
--
-- Licensed under the Apache License, Version 2.0 (the "License");
-- you may not use this file except in compliance with the License.
-- You may obtain a copy of the License at
--
--     http://www.apache.org/licenses/LICENSE-2.0
--
-- Unless required by applicable law or agreed to in writing, software
-- distributed under the License is distributed on an "AS IS" BASIS,
-- WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
-- See the License for the specific language governing permissions and
-- limitations under the License.
--

-- UPDATE TENANT PROFILE CONFIGURATION START

UPDATE tenant_profile
SET profile_data = jsonb_set(
    profile_data,
    '{configuration}',
    jsonb_build_object(
        'minAllowedScheduledUpdateIntervalInSecForCF', 60,
        'maxRelationLevelPerCfArgument', 10,
        'maxRelatedEntitiesToReturnPerCfArgument', 100,
        'minAllowedDeduplicationIntervalInSecForCF', 10,
        'minAllowedAggregationIntervalInSecForCF', 60,
        'intermediateAggregationIntervalInSecForCF', 300,
        'cfReevaluationCheckInterval', 60,
        'alarmsReevaluationInterval', 60
    )
    ||
    jsonb_strip_nulls(profile_data -> 'configuration')
)
WHERE NOT (
    jsonb_strip_nulls(profile_data -> 'configuration') ?& ARRAY[
        'minAllowedScheduledUpdateIntervalInSecForCF',
        'maxRelationLevelPerCfArgument',
        'maxRelatedEntitiesToReturnPerCfArgument',
        'minAllowedDeduplicationIntervalInSecForCF',
        'minAllowedAggregationIntervalInSecForCF',
        'intermediateAggregationIntervalInSecForCF',
        'cfReevaluationCheckInterval',
        'alarmsReevaluationInterval'
    ]
);

-- UPDATE TENANT PROFILE CONFIGURATION END

-- CALCULATED FIELD UNIQUE CONSTRAINT UPDATE START

ALTER TABLE calculated_field DROP CONSTRAINT IF EXISTS calculated_field_unq_key;
ALTER TABLE calculated_field ADD CONSTRAINT calculated_field_unq_key UNIQUE (entity_id, type, name);

-- CALCULATED FIELD UNIQUE CONSTRAINT UPDATE END

-- CALCULATED FIELD OUTPUT STRATEGY UPDATE START

UPDATE calculated_field
SET configuration = jsonb_set(
        configuration::jsonb,
        '{output}',
        (configuration::jsonb -> 'output')
            || jsonb_build_object(
                'strategy',
                jsonb_build_object(
                        'type', 'RULE_CHAIN'
                )
               ),
        false
                    )
WHERE (configuration::jsonb -> 'output' -> 'strategy') IS NULL;

-- CALCULATED FIELD OUTPUT STRATEGY UPDATE END

-- REMOVAL OF CALCULATED FIELD LINKS PERSISTENCE START

DROP TABLE IF EXISTS calculated_field_link;
ANALYZE calculated_field;

-- REMOVAL OF CALCULATED FIELD LINKS PERSISTENCE END

-- VIDEO CAMERA BINDING START

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
    CONSTRAINT fk_video_camera_binding_device FOREIGN KEY (tb_device_id) REFERENCES device(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_video_camera_binding_tenant_id ON video_camera_binding(tenant_id);
CREATE INDEX IF NOT EXISTS idx_video_camera_binding_provider_stream ON video_camera_binding(provider, stream_app, stream_id);
CREATE UNIQUE INDEX IF NOT EXISTS idx_video_camera_binding_provider_channel_unq
    ON video_camera_binding(tenant_id, provider, provider_device_id, provider_channel_id)
    WHERE enabled = true AND provider_device_id IS NOT NULL AND provider_channel_id IS NOT NULL;

-- VIDEO CAMERA BINDING END
