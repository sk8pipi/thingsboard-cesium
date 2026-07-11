[CmdletBinding(SupportsShouldProcess)]
param(
  [string]$Token,
  [string]$UserEmail = '13616392174@163.com',
  [string]$BatchId,
  [string]$ApiUrl = 'http://localhost:8080',
  [switch]$Force
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'
$ApiUrl = $ApiUrl.TrimEnd('/')

function Read-JwtToken {
  if ($null -eq (Get-Command Get-Clipboard -ErrorAction SilentlyContinue)) {
    throw 'Get-Clipboard is unavailable. Pass the JWT with the -Token parameter instead.'
  }

  Write-Host 'Copy the complete TOKEN__ value to the clipboard first.'
  Read-Host 'Press Enter to read the token from the clipboard' | Out-Null
  return Get-Clipboard -Raw
}

function Invoke-TbRequest {
  param(
    [Parameter(Mandatory)]
    [ValidateSet('GET', 'DELETE')]
    [string]$Method,
    [Parameter(Mandatory)]
    [string]$Path
  )

  return Invoke-RestMethod -Method $Method -Uri "$ApiUrl$Path" -Headers @{ 'X-Authorization' = "Bearer $Token" } -TimeoutSec 20
}

function Get-EntityId([object]$entity) {
  if ($null -eq $entity) { return '' }
  if ($entity -is [string]) { return $entity }
  return [string]$entity.id
}

if ([string]::IsNullOrWhiteSpace($Token)) {
  $Token = Read-JwtToken
}

$Token = [regex]::Replace([string]$Token, '[\s\x00-\x1F\x7F]+', '')
if ($Token -notmatch '^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$') {
  throw 'The JWT format is invalid. Copy the complete TOKEN__ value and try again.'
}

$escapedEmail = [Uri]::EscapeDataString($UserEmail)
$users = Invoke-TbRequest -Method GET -Path "/api/users?pageSize=100&page=0&textSearch=$escapedEmail&sortProperty=email&sortOrder=ASC"
$targetUser = @($users.data | Where-Object { $_.email -eq $UserEmail } | Select-Object -First 1)[0]
if ($null -eq $targetUser) { throw "No ThingsBoard user was found for $UserEmail." }

$customerId = Get-EntityId $targetUser.customerId
if ([string]::IsNullOrWhiteSpace($customerId)) { throw 'The target user has no customer assignment.' }

$deviceIds = @{}
$page = 0
do {
  $devicePage = Invoke-TbRequest -Method GET -Path "/api/customer/$customerId/devices?pageSize=100&page=$page&sortProperty=name&sortOrder=ASC"
  foreach ($device in @($devicePage.data)) {
    $deviceIds[(Get-EntityId $device.id)] = $device.name
  }
  $page++
} while ($devicePage.hasNext)

$typePattern = if ([string]::IsNullOrWhiteSpace($BatchId)) {
  '^TEST_TABLE(?:_|$)'
} else {
  '^TEST_TABLE_' + [regex]::Escape($BatchId) + '_\d+$'
}

$testAlarms = @()
$page = 0
do {
  $alarmPage = Invoke-TbRequest -Method GET -Path "/api/v2/alarms?pageSize=100&page=$page&sortProperty=createdTime&sortOrder=DESC&fetchOriginator=true"
  $testAlarms += @($alarmPage.data | Where-Object {
    $originatorId = Get-EntityId $_.originator
    $_.type -match $typePattern -and $deviceIds.ContainsKey($originatorId)
  })
  $page++
} while ($alarmPage.hasNext)

if (-not $testAlarms.Count) {
  Write-Host 'No matching test alarms were found.'
  exit 0
}

Write-Host "Found $($testAlarms.Count) test alarms for $UserEmail."
if (-not $Force -and -not $WhatIfPreference) {
  $confirmation = Read-Host 'Type DELETE to remove them'
  if ($confirmation -cne 'DELETE') {
    Write-Host 'Cancelled. No alarms were deleted.'
    exit 0
  }
}

$deleted = @()
$failed = @()
foreach ($alarm in $testAlarms) {
  $alarmId = Get-EntityId $alarm.id
  $deviceName = $deviceIds[(Get-EntityId $alarm.originator)]
  if (-not $PSCmdlet.ShouldProcess("$deviceName / $($alarm.type)", 'Delete test alarm')) {
    continue
  }

  try {
    Invoke-TbRequest -Method DELETE -Path "/api/alarm/$alarmId" | Out-Null
    $deleted += $alarmId
  } catch {
    $failed += [pscustomobject]@{ Type = $alarm.type; Device = $deviceName; Error = $_.Exception.Message }
  }
}

Write-Host "Deleted: $($deleted.Count); Failed: $($failed.Count)"
if ($failed.Count) {
  $failed | Format-Table Type, Device, Error -AutoSize
  exit 1
}