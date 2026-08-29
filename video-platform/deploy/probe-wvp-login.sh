#!/bin/sh
set -eu

: "${VIDEO_WVP_USERNAME:?VIDEO_WVP_USERNAME is required}"
: "${VIDEO_WVP_PASSWORD:?VIDEO_WVP_PASSWORD is required}"

password_hash="$(printf '%s' "${VIDEO_WVP_PASSWORD}" | md5sum | cut -d ' ' -f 1)"
response_file="$(mktemp)"
trap 'rm -f "${response_file}"' EXIT

http_status="$(curl -sS \
  --output "${response_file}" \
  --write-out '%{http_code}' \
  --max-time 10 \
  --get \
  'http://polaris-wvp:18978/api/user/login' \
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
