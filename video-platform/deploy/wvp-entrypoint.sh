#!/usr/bin/env bash
set -euo pipefail

redis_host="${SPRING_DATA_REDIS_HOST:-${SPRING_REDIS_HOST:-redis}}"
redis_port="${SPRING_DATA_REDIS_PORT:-${SPRING_REDIS_PORT:-6379}}"
max_attempts="${WVP_REDIS_WAIT_ATTEMPTS:-60}"

for ((attempt = 1; attempt <= max_attempts; attempt++)); do
  if timeout 2 bash -c "</dev/tcp/${redis_host}/${redis_port}" 2>/dev/null; then
    exec java -Xms256m -Xmx1024m -XX:+HeapDumpOnOutOfMemoryError -jar /opt/wvp/wvp.jar
  fi
  echo "WVP is waiting for Redis at ${redis_host}:${redis_port} (${attempt}/${max_attempts})"
  sleep 2
done

echo "Redis did not become reachable before the WVP startup deadline." >&2
exit 1
