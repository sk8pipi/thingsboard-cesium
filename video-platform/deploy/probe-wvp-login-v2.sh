#!/bin/sh
set -eu

: "${VIDEO_WVP_USERNAME:?VIDEO_WVP_USERNAME is required}"
: "${VIDEO_WVP_PASSWORD:?VIDEO_WVP_PASSWORD is required}"

probe_url="${VIDEO_WVP_PROBE_URL:-http://polaris-nginx:8080/api/user/login}"
password_hash="$(printf '%s' "${VIDEO_WVP_PASSWORD}" | md5sum | cut -d ' ' -f 1)"
response_file="$(mktemp)"
trap 'rm -f "${response_file}"' EXIT

http_status="$(curl -sS \
  --output "${response_file}" \
  --write-out '%{http_code}' \
  --max-time 30 \
  --get \
  "${probe_url}" \
  --data-urlencode "username=${VIDEO_WVP_USERNAME}" \
  --data-urlencode "password=${password_hash}")"

wvp_code="$(sed -n 's/.*"code"[[:space:]]*:[[:space:]]*\([-0-9]*\).*/\1/p' "${response_file}" | head -n 1)"
if grep -q '"accessToken"' "${response_file}"; then
  has_access_token=true
else
  has_access_token=false
fi

printf 'HTTP_STATUS=%s\nWVP_CODE=%s\nHAS_ACCESS_TOKEN=%s\n' \
  "${http_status}" "${wvp_code:-unknown}" "${has_access_token}"

test "${http_status}" = "200"
test "${wvp_code}" = "0"
test "${has_access_token}" = "true"
