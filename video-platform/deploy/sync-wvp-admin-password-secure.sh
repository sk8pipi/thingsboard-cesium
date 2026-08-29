#!/bin/sh
set -eu

: "${POSTGRES_HOST:?POSTGRES_HOST is required}"
: "${POSTGRES_PORT:?POSTGRES_PORT is required}"
: "${POSTGRES_DATABASE:?POSTGRES_DATABASE is required}"
: "${POSTGRES_USER:?POSTGRES_USER is required}"
: "${POSTGRES_PASSWORD:?POSTGRES_PASSWORD is required}"
: "${VIDEO_WVP_PASSWORD:?VIDEO_WVP_PASSWORD is required}"

export PGPASSWORD="${POSTGRES_PASSWORD}"
expected_hash="$(printf '%s' "${VIDEO_WVP_PASSWORD}" | md5sum | cut -d ' ' -f 1)"

psql \
  --host="${POSTGRES_HOST}" \
  --port="${POSTGRES_PORT}" \
  --username="${POSTGRES_USER}" \
  --dbname="${POSTGRES_DATABASE}" \
  --set=ON_ERROR_STOP=1 \
  --set=expected_hash="${expected_hash}" <<'SQL'
UPDATE wvp_user
SET password = :'expected_hash', update_time = CURRENT_TIMESTAMP
WHERE username = 'admin'
  AND password IS DISTINCT FROM :'expected_hash';
SQL
