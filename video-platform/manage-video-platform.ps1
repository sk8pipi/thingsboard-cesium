param(
  [ValidateSet("start", "stop", "restart", "status", "logs", "validate")]
  [string]$Action = "status"
)

$ErrorActionPreference = "Stop"

$deployDirectory = Join-Path $PSScriptRoot "deploy"
$environmentFile = Join-Path $deployDirectory ".env"
$composeFileNames = @(
  "compose.yaml",
  "compose.postgres-wvp.yaml",
  "compose.wvp-skipgit.yaml",
  "compose.web.yaml",
  "compose.web-build-fix.yaml",
  "compose.web-network.yaml"
)

if (-not (Get-Command docker -ErrorAction SilentlyContinue)) {
  throw "Docker CLI was not found. Start Docker Desktop and try again."
}

if (-not (Test-Path -LiteralPath $environmentFile)) {
  throw "Missing environment file: $environmentFile"
}

$composeArguments = @("compose", "--env-file", $environmentFile)
foreach ($composeFileName in $composeFileNames) {
  $composeArguments += @("-f", (Join-Path $deployDirectory $composeFileName))
}

function Ensure-VideoIotNetwork {
  & docker network inspect video-iot-net *> $null
  if ($LASTEXITCODE -eq 0) {
    return
  }

  & docker network create video-iot-net | Out-Null
  if ($LASTEXITCODE -ne 0) {
    throw "Failed to create Docker network video-iot-net."
  }
}
function Invoke-VideoCompose {
  param([string[]]$Arguments)

  & docker @composeArguments @Arguments
  if ($LASTEXITCODE -ne 0) {
    throw "Docker Compose failed with exit code $LASTEXITCODE."
  }
}

switch ($Action) {
  "start" {
    Ensure-VideoIotNetwork
    Invoke-VideoCompose @("config", "--quiet")
    Invoke-VideoCompose @("up", "-d", "--no-build")
    Invoke-VideoCompose @("ps")
  }
  "stop" {
    Invoke-VideoCompose @("stop")
  }
  "restart" {
    Ensure-VideoIotNetwork
    Invoke-VideoCompose @("config", "--quiet")
    Invoke-VideoCompose @("up", "-d", "--no-build", "--force-recreate")
    Invoke-VideoCompose @("ps")
  }
  "status" {
    Invoke-VideoCompose @("ps")
  }
  "logs" {
    Invoke-VideoCompose @("logs", "--tail", "150")
  }
  "validate" {
    Invoke-VideoCompose @("config", "--quiet")
    $response = Invoke-WebRequest -UseBasicParsing -Uri "http://127.0.0.1:18080/" -TimeoutSec 10
    if ($response.StatusCode -ne 200) {
      throw "WVP returned HTTP $($response.StatusCode)."
    }
    Write-Host "WVP web: http://127.0.0.1:18080 (HTTP 200)"
    Write-Host "ZLMediaKit API: http://127.0.0.1:18081"
  }
}