[CmdletBinding(SupportsShouldProcess)]
param(
  [string]$Token,
  [string]$UserEmail = '13616392174@163.com',
  [ValidateRange(1, 100)]
  [int]$Count = 50,
  [string]$ApiUrl = 'http://localhost:8080',
  [string]$DeviceNamePattern = '^sim-sensor-\d{3}$',
  [string]$BatchId = (Get-Date -Format 'yyyyMMddHHmmss')
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
    [ValidateSet('GET', 'POST')]
    [string]$Method,
    [Parameter(Mandatory)]
    [string]$Path,
    [object]$Body
  )

  $request = @{
    Method = $Method
    Uri = "$ApiUrl$Path"
    Headers = @{ 'X-Authorization' = "Bearer $Token" }
    TimeoutSec = 20
  }

  if ($null -ne $Body) {
    $request.ContentType = 'application/json'
    $request.Body = $Body | ConvertTo-Json -Depth 8 -Compress
  }

  return Invoke-RestMethod @request
}

if ([string]::IsNullOrWhiteSpace($Token)) {
  $Token = Read-JwtToken
}

# Browser copy operations can include an invisible line break. JWTs only use
# base64url characters and dots, so remove whitespace before sending headers.
$Token = [regex]::Replace([string]$Token, '[\s\x00-\x1F\x7F]+', '')
if ($Token -notmatch '^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$') {
  throw 'The JWT format is invalid. Copy the complete TOKEN__ value and paste it again.'
}

$escapedEmail = [Uri]::EscapeDataString($UserEmail)
$users = Invoke-TbRequest -Method GET -Path "/api/users?pageSize=100&page=0&textSearch=$escapedEmail&sortProperty=email&sortOrder=ASC"
$targetUser = @($users.data | Where-Object { $_.email -eq $UserEmail } | Select-Object -First 1)[0]

if ($null -eq $targetUser) {
  throw "No ThingsBoard user was found for $UserEmail."
}

$customerId = $targetUser.customerId.id
$tenantId = $targetUser.tenantId.id
if ([string]::IsNullOrWhiteSpace($customerId) -or [string]::IsNullOrWhiteSpace($tenantId)) {
  throw "The target user does not have a valid customer or tenant assignment."
}

$matchingDevices = @()
$page = 0
do {
  $devicePage = Invoke-TbRequest -Method GET -Path "/api/customer/$customerId/devices?pageSize=100&page=$page&sortProperty=name&sortOrder=ASC"
  $matchingDevices += @($devicePage.data | Where-Object { $_.name -match $DeviceNamePattern })
  $page++
} while ($devicePage.hasNext -and $matchingDevices.Count -lt $Count)

$devices = @($matchingDevices | Sort-Object name | Select-Object -First $Count)
if ($devices.Count -lt $Count) {
  throw "Only $($devices.Count) matching devices were found. Pattern: $DeviceNamePattern"
}

$severities = @('CRITICAL', 'MAJOR', 'MINOR', 'WARNING')
$created = @()
$failed = @()

Write-Host "Target user: $UserEmail"
Write-Host "Batch: $BatchId"
Write-Host "Devices: $($devices.Count)"

for ($index = 0; $index -lt $devices.Count; $index++) {
  $number = $index + 1
  $device = $devices[$index]
  $alarmType = 'TEST_TABLE_{0}_{1:D2}' -f $BatchId, $number
  $alarm = [ordered]@{
    tenantId = @{ entityType = 'TENANT'; id = $tenantId }
    customerId = @{ entityType = 'CUSTOMER'; id = $customerId }
    originator = @{ entityType = 'DEVICE'; id = $device.id.id }
    type = $alarmType
    severity = $severities[$index % $severities.Count]
    details = @{
      message = 'Dashboard alarm list test {0:D2}' -f $number
      test = $true
      batchId = $BatchId
      sequence = $number
      source = 'scripts/simulate-test-alarms.ps1'
    }
  }

  if (-not $PSCmdlet.ShouldProcess("$($device.name) / $alarmType", 'Create active test alarm')) {
    continue
  }

  try {
    $saved = Invoke-TbRequest -Method POST -Path '/api/alarm' -Body $alarm
    $created += [pscustomobject]@{
      Number = $number
      Device = $device.name
      Type = $saved.type
      Severity = $saved.severity
      Status = $saved.status
      AlarmId = $saved.id.id
    }
  } catch {
    $failed += [pscustomobject]@{
      Number = $number
      Device = $device.name
      Error = $_.Exception.Message
    }
  }
}

if ($created.Count) {
  $created | Format-Table Number, Device, Type, Severity, Status -AutoSize
}

Write-Host "Created: $($created.Count); Failed: $($failed.Count); Batch: $BatchId"
if ($failed.Count) {
  $failed | Format-Table Number, Device, Error -AutoSize
  exit 1
}