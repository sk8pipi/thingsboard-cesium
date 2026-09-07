[CmdletBinding()]
param(
    [Parameter(Mandatory = $true)][string]$OutputPath
)
$ErrorActionPreference = 'Stop'
$repository = [IO.Path]::GetFullPath((Join-Path $PSScriptRoot '../..'))
$schema = [IO.File]::ReadAllText((Join-Path $repository 'backend/dao/src/main/resources/sql/schema-entities.sql'))
$functions = [IO.File]::ReadAllText((Join-Path $repository 'backend/dao/src/main/resources/sql/schema-functions.sql'))

function Read-MarkedBlock([string]$text, [string]$start, [string]$end) {
    $first = $text.IndexOf($start, [StringComparison]::Ordinal)
    $last = $text.IndexOf($end, [StringComparison]::Ordinal)
    if ($first -lt 0 -or $last -le $first) { throw "Missing SQL markers: $start / $end" }
    return $text.Substring($first, $last + $end.Length - $first)
}

$ddl = Read-MarkedBlock $schema '-- BEGIN ALARM STATISTICS SCHEMA' '-- END ALARM STATISTICS SCHEMA'
$capture = Read-MarkedBlock $functions '-- BEGIN ALARM STATISTICS CAPTURE START' '-- END ALARM STATISTICS CAPTURE START'
$firstFunction = $functions.IndexOf('CREATE OR REPLACE FUNCTION create_or_update_active_alarm(', [StringComparison]::Ordinal)
$nextFunction = $functions.IndexOf('DROP FUNCTION IF EXISTS acknowledge_alarm;', [StringComparison]::Ordinal)
if ($firstFunction -lt 0 -or $nextFunction -le $firstFunction) { throw 'Alarm function boundaries not found' }
$alarmFunctions = $functions.Substring($firstFunction, $nextFunction - $firstFunction)
# The canonical fresh-install script drops update_alarm before recreating it. An in-place
# migration keeps the existing function object, privileges and dependencies intact.
$alarmFunctions = [Text.RegularExpressions.Regex]::Replace(
    $alarmFunctions,
    '(?m)^DROP FUNCTION IF EXISTS update_alarm;\r?\n',
    ''
)

$sql = @"
-- Generated from the repository's canonical schema/functions. Review before execution.
-- Requires a maintenance window with all alarm writers/deleters and TTL cleanup paused.
-- Run using psql -X -v ON_ERROR_STOP=1 -f <this-file> against the explicitly approved database.
-- This migration does not delete, truncate, alter or update rows in existing business tables.
BEGIN;
SET LOCAL lock_timeout = '10s';
LOCK TABLE alarm IN SHARE ROW EXCLUSIVE MODE;
$ddl
$alarmFunctions
$capture
INSERT INTO alarm_occurrence
    (tenant_id, alarm_id, created_time, customer_id, originator_id, originator_type,
     alarm_type, severity, record_source, recorded_at)
SELECT a.tenant_id, a.id, a.created_time,
       NULLIF(a.customer_id, '13814000-1dd2-11b2-8080-808080808080'::uuid),
       a.originator_id, a.originator_type, a.type, COALESCE(a.severity, 'INDETERMINATE'),
       'BACKFILL', floor(extract(epoch FROM clock_timestamp()) * 1000)::bigint
FROM alarm a JOIN tenant t ON t.id = a.tenant_id
ON CONFLICT (tenant_id, alarm_id) DO NOTHING;
COMMIT;
-- Backfill cannot recover previously deleted alarms. Never reset capture_started_time on rerun.
"@
$resolvedOutput = [IO.Path]::GetFullPath($OutputPath)
if (Test-Path -LiteralPath $resolvedOutput) { throw "Output already exists; choose a new path: $resolvedOutput" }
[IO.Directory]::CreateDirectory([IO.Path]::GetDirectoryName($resolvedOutput)) | Out-Null
[IO.File]::WriteAllText($resolvedOutput, $sql, [Text.UTF8Encoding]::new($false))
Write-Host "Migration SQL generated (not executed): $resolvedOutput"
