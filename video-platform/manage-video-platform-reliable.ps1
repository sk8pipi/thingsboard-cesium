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

$wvpContainer = "tb-video-validation-polaris-wvp-1"
$probeContainer = "tb-video-validation-virtual-camera-stream-registrar-1"

& docker restart $wvpContainer | Out-Null
if ($LASTEXITCODE -ne 0) {
  throw "Failed to restart WVP after Redis became healthy."
}

$wvpReady = $false
for ($attempt = 1; $attempt -le 24; $attempt++) {
  & docker exec $probeContainer curl -sS -o /dev/null --max-time 3 http://polaris-wvp:18978/api/user/login
  if ($LASTEXITCODE -eq 0) {
    $wvpReady = $true
    break
  }
  Start-Sleep -Seconds 5
}
if (-not $wvpReady) {
  throw "WVP API did not become ready after Redis recovery."
}

$wvpEnvironmentFile = Join-Path $PSScriptRoot "data\wvp.env"
$thingsBoardEnvironmentFile = Join-Path $PSScriptRoot "..\.env.video.local"
$syncScript = Join-Path $PSScriptRoot "deploy\sync-wvp-admin-password-secure.sh"

foreach ($requiredFile in @($wvpEnvironmentFile, $thingsBoardEnvironmentFile, $syncScript)) {
  if (-not (Test-Path -LiteralPath $requiredFile -PathType Leaf)) {
    throw "Missing WVP credential sync input: $requiredFile"
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

Write-Host "WVP API is ready and administrator credentials match local ThingsBoard."
