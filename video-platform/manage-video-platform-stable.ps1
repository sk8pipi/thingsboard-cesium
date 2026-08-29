param(
  [ValidateSet("start", "stop", "restart", "status", "logs", "validate")]
  [string]$Action = "status"
)

$ErrorActionPreference = "Stop"

$baseManager = Join-Path $PSScriptRoot "manage-video-platform.ps1"
& $baseManager -Action $Action
if ($LASTEXITCODE -ne 0) {
  throw "Video platform manager failed with exit code $LASTEXITCODE."
}

if ($Action -notin @("start", "restart")) {
  return
}

$deployDirectory = Join-Path $PSScriptRoot "deploy"
$environmentFile = Join-Path $deployDirectory ".env"
$composeFileNames = @(
  "compose.yaml",
  "compose.postgres-wvp.yaml",
  "compose.wvp-skipgit.yaml",
  "compose.web.yaml",
  "compose.web-build-fix.yaml",
  "compose.web-network.yaml",
  "compose.wvp-init.yaml"
)
$composeArguments = @("compose", "--env-file", $environmentFile)
foreach ($composeFileName in $composeFileNames) {
  $composeArguments += @("-f", (Join-Path $deployDirectory $composeFileName))
}
$composeArguments += @("up", "-d", "--no-deps", "polaris-wvp")
& docker @composeArguments
if ($LASTEXITCODE -ne 0) {
  throw "Failed to apply the WVP init override."
}

$wvpContainer = "tb-video-validation-polaris-wvp-1"
$probeContainer = "tb-video-validation-virtual-camera-stream-registrar-1"
$wvpReady = $false
for ($attempt = 1; $attempt -le 120; $attempt++) {
  & docker exec $probeContainer curl -sS -o /dev/null --max-time 3 http://polaris-wvp:18978/api/user/login
  if ($LASTEXITCODE -eq 0) {
    $wvpReady = $true
    break
  }
  Start-Sleep -Seconds 5
}
if (-not $wvpReady) {
  throw "WVP API did not become ready within 10 minutes. Inspect $wvpContainer before restarting it."
}

$wvpEnvironmentFile = Join-Path $PSScriptRoot "data\wvp.env"
$thingsBoardEnvironmentFile = Join-Path $PSScriptRoot "..\.env.video.local"
$syncScript = Join-Path $deployDirectory "sync-wvp-admin-password-secure.sh"
$loginProbeScript = Join-Path $deployDirectory "probe-wvp-login-v2.sh"
foreach ($requiredFile in @(
  $wvpEnvironmentFile,
  $thingsBoardEnvironmentFile,
  $syncScript,
  $loginProbeScript
)) {
  if (-not (Test-Path -LiteralPath $requiredFile -PathType Leaf)) {
    throw "Missing WVP validation input: $requiredFile"
  }
}

$syncMount = "$($syncScript):/opt/video-platform/sync-wvp-admin-password.sh:ro"
& docker run --rm `
  --network tb-video-validation-net `
  --add-host host.docker.internal:host-gateway `
  --env-file $wvpEnvironmentFile `
  --env-file $thingsBoardEnvironmentFile `
  --volume $syncMount `
  postgres:13-alpine `
  sh /opt/video-platform/sync-wvp-admin-password.sh
if ($LASTEXITCODE -ne 0) {
  throw "Failed to synchronize the WVP administrator password."
}

$probeMount = "$($loginProbeScript):/opt/video-platform/probe-wvp-login.sh:ro"
& docker run --rm `
  --network tb-video-validation-net `
  --env-file $wvpEnvironmentFile `
  --env-file $thingsBoardEnvironmentFile `
  --env VIDEO_WVP_PROBE_URL=http://polaris-nginx:8080/api/user/login `
  --volume $probeMount `
  --entrypoint sh `
  curlimages/curl:8.12.1 `
  /opt/video-platform/probe-wvp-login.sh
if ($LASTEXITCODE -ne 0) {
  throw "WVP login validation through Nginx failed."
}

Write-Host "WVP API is ready and login through Nginx was verified."
