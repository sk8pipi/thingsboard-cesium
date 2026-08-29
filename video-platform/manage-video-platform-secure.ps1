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

Write-Host "WVP administrator credentials synchronized for local ThingsBoard video validation."
