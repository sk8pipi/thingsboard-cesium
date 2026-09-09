[CmdletBinding()]
param(
    [string]$EnvironmentFile,
    [switch]$RebuildNativeUi
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

if ([string]::IsNullOrWhiteSpace($EnvironmentFile)) {
    $EnvironmentFile = Join-Path $PSScriptRoot '..\.env.video.local'
}

$repositoryRoot = [System.IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..'))
$backendRoot = Join-Path $repositoryRoot 'backend'
$resolvedEnvironmentFile = [System.IO.Path]::GetFullPath($EnvironmentFile)

if (-not (Test-Path -LiteralPath $resolvedEnvironmentFile -PathType Leaf)) {
    throw @"
Local video environment file was not found:
$resolvedEnvironmentFile

Copy .env.video.example to .env.video.local, fill in the local-only credentials,
and run this script again.
"@
}

foreach ($rawLine in Get-Content -LiteralPath $resolvedEnvironmentFile -Encoding utf8) {
    $line = $rawLine.Trim()
    if ($line.Length -eq 0 -or $line.StartsWith('#')) {
        continue
    }

    $separatorIndex = $line.IndexOf('=')
    if ($separatorIndex -le 0) {
        throw "Invalid environment entry in ${resolvedEnvironmentFile}: $rawLine"
    }

    $name = $line.Substring(0, $separatorIndex).Trim()
    $value = $line.Substring($separatorIndex + 1).Trim()
    if ($name -notmatch '^[A-Z][A-Z0-9_]*$') {
        throw "Invalid environment variable name '$name' in $resolvedEnvironmentFile"
    }

    [System.Environment]::SetEnvironmentVariable($name, $value, 'Process')
}

$requiredVariables = @(
    'SPRING_DATASOURCE_URL',
    'SPRING_DATASOURCE_USERNAME',
    'SPRING_DATASOURCE_PASSWORD',
    'VIDEO_WVP_ENABLED',
    'VIDEO_WVP_BASE_URL',
    'VIDEO_WVP_USERNAME',
    'VIDEO_WVP_PASSWORD',
    'VIDEO_ZLM_ENABLED',
    'VIDEO_ZLM_BASE_URL',
    'VIDEO_ZLM_SECRET',
    'VIDEO_ZLM_RTSP_BASE_URL'
)

$missingVariables = @(
    foreach ($name in $requiredVariables) {
        $value = [System.Environment]::GetEnvironmentVariable($name, 'Process')
        if ([string]::IsNullOrWhiteSpace($value)) {
            $name
        }
    }
)

if ($missingVariables.Count -gt 0) {
    throw "Required local environment variables are missing: $($missingVariables -join ', ')"
}

if ($env:VIDEO_WVP_ENABLED -ne 'true' -or $env:VIDEO_ZLM_ENABLED -ne 'true') {
    throw 'VIDEO_WVP_ENABLED and VIDEO_ZLM_ENABLED must both be true for local video validation.'
}

$mavenCommand = Get-Command mvn.cmd -ErrorAction SilentlyContinue
if (-not $mavenCommand) {
    $mavenCommand = Get-Command mvn -ErrorAction Stop
}

Write-Host 'Starting ThingsBoard with the local WVP/ZLMediaKit integration enabled.'
Write-Host "Backend: $backendRoot"
Write-Host "Environment: $resolvedEnvironmentFile"
Write-Host 'Credentials remain in the local ignored environment file and are not sent to the frontend.'

Push-Location $backendRoot
try {
    # spring-boot:run resolves ui-ngx from the local Maven repository, not its source directory.
    $nativeUiIndex = Join-Path $backendRoot 'ui-ngx\target\generated-resources\public\index.html'
    if ($RebuildNativeUi -or -not (Test-Path -LiteralPath $nativeUiIndex -PathType Leaf)) {
        Write-Host 'Building and installing the ThingsBoard native UI for port 8080.'
        & $mavenCommand.Source -pl ui-ngx -DskipTests install
    }
    else {
        Write-Host 'Packaging and installing the existing native UI build (use -RebuildNativeUi after UI source changes).'
        & $mavenCommand.Source -pl ui-ngx -DskipTests '-Dskip.yarn=true' '-Dskip.installyarn=true' install
    }
    if ($LASTEXITCODE -ne 0) {
        throw "ThingsBoard native UI build exited with code $LASTEXITCODE"
    }
    if (-not (Test-Path -LiteralPath $nativeUiIndex -PathType Leaf)) {
        throw 'ThingsBoard native UI index.html is missing. Backend startup was stopped to avoid an empty UI.'
    }

    Write-Host 'Building shared data and DAO modules required by the application.'
    & $mavenCommand.Source -pl 'common/data,dao' -DskipTests install
    if ($LASTEXITCODE -ne 0) {
        throw "ThingsBoard shared backend modules build exited with code $LASTEXITCODE"
    }

    & $mavenCommand.Source -pl application -DskipTests spring-boot:run
    if ($LASTEXITCODE -ne 0) {
        throw "ThingsBoard backend exited with code $LASTEXITCODE"
    }
}
finally {
    Pop-Location
}
