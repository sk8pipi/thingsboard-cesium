[CmdletBinding()]
param(
    [string]$EnvironmentFile,
    [string]$MigrationSql,
    [string]$PostgresBin = 'E:\postgresql\bin',
    [switch]$Execute
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

$repositoryRoot = [IO.Path]::GetFullPath((Join-Path $PSScriptRoot '../..'))
if ([string]::IsNullOrWhiteSpace($EnvironmentFile)) {
    $EnvironmentFile = Join-Path $repositoryRoot '.env.video.local'
}
if ([string]::IsNullOrWhiteSpace($MigrationSql)) {
    $MigrationSql = Join-Path $repositoryRoot 'backend/dao/target/alarm-statistics-migrate.sql'
}

$resolvedEnvironmentFile = [IO.Path]::GetFullPath($EnvironmentFile)
$resolvedMigrationSql = [IO.Path]::GetFullPath($MigrationSql)
if (-not (Test-Path -LiteralPath $resolvedEnvironmentFile -PathType Leaf)) {
    throw "Environment file not found: $resolvedEnvironmentFile"
}
if ($Execute -and -not (Test-Path -LiteralPath $resolvedMigrationSql -PathType Leaf)) {
    throw "Migration SQL not found: $resolvedMigrationSql"
}

$settings = @{}
foreach ($rawLine in Get-Content -LiteralPath $resolvedEnvironmentFile -Encoding utf8) {
    $line = $rawLine.Trim()
    if ($line.Length -eq 0 -or $line.StartsWith('#')) { continue }
    $separatorIndex = $line.IndexOf('=')
    if ($separatorIndex -le 0) { continue }
    $name = $line.Substring(0, $separatorIndex).Trim()
    if ($name -in @('SPRING_DATASOURCE_URL', 'SPRING_DATASOURCE_USERNAME', 'SPRING_DATASOURCE_PASSWORD')) {
        $settings[$name] = $line.Substring($separatorIndex + 1).Trim()
    }
}

foreach ($required in @('SPRING_DATASOURCE_URL', 'SPRING_DATASOURCE_USERNAME', 'SPRING_DATASOURCE_PASSWORD')) {
    if (-not $settings.ContainsKey($required) -or [string]::IsNullOrWhiteSpace($settings[$required])) {
        throw "Required setting is missing: $required"
    }
}

$jdbcUrl = [string]$settings['SPRING_DATASOURCE_URL']
if (-not $jdbcUrl.StartsWith('jdbc:postgresql://', [StringComparison]::OrdinalIgnoreCase)) {
    throw 'Only a PostgreSQL JDBC URL is supported.'
}
$databaseUri = [Uri]$jdbcUrl.Substring(5)
$databaseName = [Uri]::UnescapeDataString($databaseUri.AbsolutePath.TrimStart('/'))
if ([string]::IsNullOrWhiteSpace($databaseName) -or $databaseName.Contains('/')) {
    throw 'The JDBC URL does not contain one valid database name.'
}
$databasePort = if ($databaseUri.IsDefaultPort) { 5432 } else { $databaseUri.Port }

$schemaName = 'public'
foreach ($entry in $databaseUri.Query.TrimStart('?').Split('&', [StringSplitOptions]::RemoveEmptyEntries)) {
    $pair = $entry.Split('=', 2)
    if ([Uri]::UnescapeDataString($pair[0]) -eq 'currentSchema' -and $pair.Count -eq 2) {
        $schemaName = [Uri]::UnescapeDataString($pair[1])
    }
}
if ($schemaName -notmatch '^[A-Za-z_][A-Za-z0-9_]*$') {
    throw 'The configured currentSchema is not a safe PostgreSQL identifier.'
}

$psql = Join-Path $PostgresBin 'psql.exe'
$pgDump = Join-Path $PostgresBin 'pg_dump.exe'
$pgRestore = Join-Path $PostgresBin 'pg_restore.exe'
foreach ($tool in @($psql, $pgDump, $pgRestore)) {
    if (-not (Test-Path -LiteralPath $tool -PathType Leaf)) { throw "PostgreSQL tool not found: $tool" }
}

$connectionArgs = @('-X', '-v', 'ON_ERROR_STOP=1', '-h', $databaseUri.Host, '-p', "$databasePort",
                    '-U', [string]$settings['SPRING_DATASOURCE_USERNAME'], '-d', $databaseName)
$previousPassword = [Environment]::GetEnvironmentVariable('PGPASSWORD', 'Process')
$previousOptions = [Environment]::GetEnvironmentVariable('PGOPTIONS', 'Process')
$env:PGPASSWORD = [string]$settings['SPRING_DATASOURCE_PASSWORD']
$env:PGOPTIONS = "-c search_path=$schemaName"

function Invoke-PsqlQuery([string]$Sql) {
    $result = & $psql @connectionArgs -At -c $Sql
    if ($LASTEXITCODE -ne 0) { throw "PostgreSQL query failed with exit code $LASTEXITCODE" }
    return $result
}

try {
    $preflightSql = @"
SELECT 'database=' || current_database()
UNION ALL SELECT 'server_version=' || current_setting('server_version')
UNION ALL SELECT 'schema=' || current_schema()
UNION ALL SELECT 'database_size_bytes=' || pg_database_size(current_database())
UNION ALL SELECT 'alarm_table=' || COALESCE(to_regclass('alarm')::text, 'MISSING')
UNION ALL SELECT 'alarm_rows=' || CASE WHEN to_regclass('alarm') IS NULL THEN 'UNKNOWN' ELSE (SELECT count(*)::text FROM alarm) END
UNION ALL SELECT 'occurrence_table=' || COALESCE(to_regclass('alarm_occurrence')::text, 'MISSING')
UNION ALL SELECT 'state_table=' || COALESCE(to_regclass('alarm_statistics_state')::text, 'MISSING')
UNION ALL SELECT 'create_function_count=' || count(*) FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
 WHERE n.nspname = current_schema() AND p.proname = 'create_or_update_active_alarm'
UNION ALL SELECT 'update_function_count=' || count(*) FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
 WHERE n.nspname = current_schema() AND p.proname = 'update_alarm';
"@
    Write-Host "Read-only preflight target: $($databaseUri.Host):$databasePort/$databaseName (schema $schemaName)"
    $preflight = Invoke-PsqlQuery $preflightSql
    $preflight | ForEach-Object { Write-Host $_ }

    if (-not $Execute) {
        Write-Host 'Preflight completed. No database changes were made.'
        return
    }
    if (-not ($preflight -contains 'alarm_table=alarm')) {
        throw 'Expected ThingsBoard alarm table was not found; migration refused.'
    }
    if (-not ($preflight -contains 'create_function_count=1') -or -not ($preflight -contains 'update_function_count=1')) {
        throw 'Expected alarm function signatures were not found exactly once; migration refused.'
    }

    $timestamp = Get-Date -Format 'yyyyMMdd-HHmmss'
    $backupDirectory = Join-Path $repositoryRoot "backend/dao/target/alarm-statistics-backups/$timestamp"
    [IO.Directory]::CreateDirectory($backupDirectory) | Out-Null
    $databaseBackup = Join-Path $backupDirectory 'database-before-migration.dump'
    $functionBackup = Join-Path $backupDirectory 'alarm-functions-before-migration.sql'
    $migrationCopy = Join-Path $backupDirectory 'migration-executed.sql'

    Write-Host "Creating pre-migration backup in: $backupDirectory"
    & $pgDump -h $databaseUri.Host -p "$databasePort" -U ([string]$settings['SPRING_DATASOURCE_USERNAME']) `
        -d $databaseName -Fc --no-owner --no-privileges -f $databaseBackup
    if ($LASTEXITCODE -ne 0 -or -not (Test-Path -LiteralPath $databaseBackup) -or (Get-Item $databaseBackup).Length -eq 0) {
        throw 'Full database backup failed; migration refused.'
    }
    & $pgRestore --list $databaseBackup | Out-Null
    if ($LASTEXITCODE -ne 0) { throw 'Database backup verification failed; migration refused.' }

    $functionSql = @"
SELECT pg_get_functiondef(p.oid) || E';\n'
FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE n.nspname = current_schema()
  AND p.proname IN ('create_or_update_active_alarm', 'update_alarm')
ORDER BY p.proname;
"@
    $functionDefinitions = Invoke-PsqlQuery $functionSql
    [IO.File]::WriteAllLines($functionBackup, [string[]]$functionDefinitions, [Text.UTF8Encoding]::new($false))
    Copy-Item -LiteralPath $resolvedMigrationSql -Destination $migrationCopy

    Write-Host 'Executing the reviewed alarm statistics migration in one transaction.'
    & $psql @connectionArgs -f $resolvedMigrationSql
    if ($LASTEXITCODE -ne 0) { throw "Migration failed with exit code $LASTEXITCODE" }

    $postflightSql = @"
SELECT 'capture_state_rows=' || count(*) FROM alarm_statistics_state
UNION ALL SELECT 'occurrence_rows=' || count(*) FROM alarm_occurrence
UNION ALL SELECT 'missing_existing_alarms=' || count(*)
FROM alarm a JOIN tenant t ON t.id = a.tenant_id
LEFT JOIN alarm_occurrence h ON h.tenant_id = a.tenant_id AND h.alarm_id = a.id
WHERE h.alarm_id IS NULL;
"@
    $postflight = Invoke-PsqlQuery $postflightSql
    $postflight | ForEach-Object { Write-Host $_ }
    if (-not ($postflight -contains 'capture_state_rows=1') -or -not ($postflight -contains 'missing_existing_alarms=0')) {
        throw 'Post-migration verification failed. Keep the backend stopped and inspect the backup and database.'
    }
    Write-Host "Alarm statistics migration completed successfully. Backup: $databaseBackup"
}
finally {
    [Environment]::SetEnvironmentVariable('PGPASSWORD', $previousPassword, 'Process')
    [Environment]::SetEnvironmentVariable('PGOPTIONS', $previousOptions, 'Process')
}
