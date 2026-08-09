[CmdletBinding()]
param(
  [string]$RepositoryRoot
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

if ([string]::IsNullOrWhiteSpace($RepositoryRoot)) {
  $RepositoryRoot = Join-Path $PSScriptRoot '..'
}

$repositoryPath = [IO.Path]::GetFullPath($RepositoryRoot)
$validationErrors = [Collections.Generic.List[string]]::new()
$normalizedScopes = [Collections.Generic.List[object]]::new()
$taskIds = @{}
$worktrees = @{}
$sharedResources = @{}

function Add-ValidationError([string]$message) {
  $script:validationErrors.Add($message)
}

function Get-RequiredString([object]$source, [string]$propertyName, [string]$label) {
  $property = $source.PSObject.Properties[$propertyName]
  if ($null -eq $property -or [string]::IsNullOrWhiteSpace([string]$property.Value)) {
    Add-ValidationError "$label is missing required property '$propertyName'."
    return ''
  }

  return ([string]$property.Value).Trim()
}

function Normalize-FileScope([string]$scope, [string]$taskId) {
  if ([string]::IsNullOrWhiteSpace($scope)) {
    Add-ValidationError "Task '$taskId' contains an empty file scope."
    return ''
  }

  $normalized = $scope.Trim().Replace('\', '/').TrimEnd('/')
  if ($normalized -eq '.' -or
      $normalized.StartsWith('/') -or
      $normalized -match '^[A-Za-z]:' -or
      $normalized -match '(^|/)\.\.(/|$)' -or
      $normalized.IndexOfAny([char[]]'*?[]') -ge 0) {
    Add-ValidationError "Task '$taskId' has invalid file scope '$scope'. Use a repository-relative file or directory prefix without wildcards."
    return ''
  }

  return $normalized
}

function Test-ScopeOverlap([string]$left, [string]$right) {
  return $left.Equals($right, [StringComparison]::OrdinalIgnoreCase) -or
    $left.StartsWith("$right/", [StringComparison]::OrdinalIgnoreCase) -or
    $right.StartsWith("$left/", [StringComparison]::OrdinalIgnoreCase)
}

function Test-FileContains([string]$relativePath, [string[]]$requiredValues) {
  $path = Join-Path $repositoryPath $relativePath
  if (-not (Test-Path -LiteralPath $path -PathType Leaf)) {
    Add-ValidationError "Required file is missing: $relativePath"
    return
  }

  $content = [IO.File]::ReadAllText($path)
  foreach ($requiredValue in $requiredValues) {
    if (-not $content.Contains($requiredValue)) {
      Add-ValidationError "$relativePath is missing required governance marker: $requiredValue"
    }
  }
}

$registryRelativePath = 'docs/changes/active-tasks.json'
$registryPath = Join-Path $repositoryPath $registryRelativePath
$registry = $null

if (-not (Test-Path -LiteralPath $registryPath -PathType Leaf)) {
  Add-ValidationError "Required activity registry is missing: $registryRelativePath"
} else {
  try {
    $registry = [IO.File]::ReadAllText($registryPath) | ConvertFrom-Json
  } catch {
    Add-ValidationError "Activity registry is not valid JSON: $($_.Exception.Message)"
  }
}

$activeStatuses = @('调研中', '待决策', '已批准', '实现中', '验证中', '待人工提交')

if ($null -ne $registry) {
  if ($registry.schemaVersion -ne 1) {
    Add-ValidationError "Unsupported activity registry schemaVersion '$($registry.schemaVersion)'. Expected 1."
  }

  if ([string]$registry.updatedAt -notmatch '^\d{4}-\d{2}-\d{2}$') {
    Add-ValidationError "Activity registry updatedAt must use YYYY-MM-DD."
  }

  foreach ($task in @($registry.tasks)) {
    if ($null -eq $task) {
      Add-ValidationError 'Activity registry contains a null task entry.'
      continue
    }

    $taskId = Get-RequiredString $task 'taskId' 'Task entry'
    $taskLabel = if ($taskId) { "Task '$taskId'" } else { 'Task entry' }
    $status = Get-RequiredString $task 'status' $taskLabel
    $owner = Get-RequiredString $task 'owner' $taskLabel
    $taskDirectory = Get-RequiredString $task 'taskDirectory' $taskLabel
    $worktree = Get-RequiredString $task 'worktree' $taskLabel
    $lastUpdated = Get-RequiredString $task 'lastUpdated' $taskLabel
    Get-RequiredString $task 'name' $taskLabel | Out-Null

    if ($taskId -and $taskId -notmatch '^[a-z0-9][a-z0-9-]*$') {
      Add-ValidationError "$taskLabel must use lowercase ASCII letters, digits and hyphens."
    }

    if ($taskId) {
      $taskKey = $taskId.ToLowerInvariant()
      if ($taskIds.ContainsKey($taskKey)) {
        Add-ValidationError "Duplicate taskId '$taskId' in activity registry."
      } else {
        $taskIds[$taskKey] = $true
      }
    }

    if ($status -and $status -notin $activeStatuses) {
      Add-ValidationError "$taskLabel has invalid active status '$status'."
    }

    if ($lastUpdated -and $lastUpdated -notmatch '^\d{4}-\d{2}-\d{2}$') {
      Add-ValidationError "$taskLabel lastUpdated must use YYYY-MM-DD."
    }

    if ($worktree) {
      $worktreeKey = $worktree.Replace('\', '/').TrimEnd('/').ToLowerInvariant()
      if ($worktrees.ContainsKey($worktreeKey)) {
        Add-ValidationError "$taskLabel and task '$($worktrees[$worktreeKey])' use the same worktree '$worktree'."
      } else {
        $worktrees[$worktreeKey] = $taskId
      }
    }

    $expectedTaskDirectory = if ($taskId) { "docs/changes/$taskId" } else { '' }
    $normalizedTaskDirectory = $taskDirectory.Replace('\', '/').TrimEnd('/')
    if ($expectedTaskDirectory -and -not $normalizedTaskDirectory.Equals($expectedTaskDirectory, [StringComparison]::OrdinalIgnoreCase)) {
      Add-ValidationError "$taskLabel taskDirectory must be '$expectedTaskDirectory'."
    }

    if ($expectedTaskDirectory) {
      $taskPath = Join-Path $repositoryPath ($expectedTaskDirectory.Replace('/', [IO.Path]::DirectorySeparatorChar))
      if (-not (Test-Path -LiteralPath $taskPath -PathType Container)) {
        Add-ValidationError "$taskLabel directory is missing: $expectedTaskDirectory"
      } else {
        foreach ($requiredFile in @('delivery.md', 'decisions.md', 'verification.md')) {
          if (-not (Test-Path -LiteralPath (Join-Path $taskPath $requiredFile) -PathType Leaf)) {
            Add-ValidationError "$taskLabel is missing $expectedTaskDirectory/$requiredFile"
          }
        }

        if (-not (Test-Path -LiteralPath (Join-Path $taskPath 'handoffs') -PathType Container)) {
          Add-ValidationError "$taskLabel is missing $expectedTaskDirectory/handoffs/"
        }

        $deliveryPath = Join-Path $taskPath 'delivery.md'
        if (Test-Path -LiteralPath $deliveryPath -PathType Leaf) {
          $delivery = [IO.File]::ReadAllText($deliveryPath)
          if ($delivery -notmatch "(?m)^- 任务编号：\s*$([regex]::Escape($taskId))\s*$") {
            Add-ValidationError "$taskLabel delivery.md does not declare the same task number."
          }
          if ($delivery -notmatch "(?m)^- 当前状态：\s*$([regex]::Escape($status))\s*$") {
            Add-ValidationError "$taskLabel delivery.md status does not match the activity registry."
          }
          foreach ($heading in @('## 验收标准', '## 工作包与文件所有权', '## 当前进度', '## 人工 Git 交付')) {
            if (-not $delivery.Contains($heading)) {
              Add-ValidationError "$taskLabel delivery.md is missing heading '$heading'."
            }
          }
        }
      }
    }

    $scopeProperty = $task.PSObject.Properties['fileScopes']
    $scopes = @()
    if ($null -ne $scopeProperty) {
      $scopes = @($scopeProperty.Value)
    }
    if ($scopes.Count -eq 0) {
      Add-ValidationError "$taskLabel must declare at least one file scope."
    }
    foreach ($scope in $scopes) {
      $normalized = Normalize-FileScope ([string]$scope) $taskId
      if ($normalized) {
        $normalizedScopes.Add([pscustomobject]@{ TaskId = $taskId; Scope = $normalized })
      }
    }

    $resourceProperty = $task.PSObject.Properties['sharedResources']
    $resources = @()
    if ($null -ne $resourceProperty) {
      $resources = @($resourceProperty.Value)
    }
    foreach ($resourceValue in $resources) {
      $resource = ([string]$resourceValue).Trim().ToLowerInvariant()
      if (-not $resource) {
        Add-ValidationError "$taskLabel contains an empty shared resource."
        continue
      }
      if ($sharedResources.ContainsKey($resource)) {
        Add-ValidationError "$taskLabel and task '$($sharedResources[$resource])' both reserve shared resource '$resource'."
      } else {
        $sharedResources[$resource] = $taskId
      }
    }

    if (-not $owner) {
      Add-ValidationError "$taskLabel must declare an owner."
    }
  }
}

for ($leftIndex = 0; $leftIndex -lt $normalizedScopes.Count; $leftIndex++) {
  for ($rightIndex = $leftIndex + 1; $rightIndex -lt $normalizedScopes.Count; $rightIndex++) {
    $left = $normalizedScopes[$leftIndex]
    $right = $normalizedScopes[$rightIndex]
    if ($left.TaskId -ne $right.TaskId -and (Test-ScopeOverlap $left.Scope $right.Scope)) {
      Add-ValidationError "Tasks '$($left.TaskId)' and '$($right.TaskId)' have overlapping file scopes '$($left.Scope)' and '$($right.Scope)'."
    }
  }
}

Test-FileContains 'docs/ai/multi-agent-development.md' @(
  '规范源',
  '.codex/agents/*.toml',
  'docs/changes/active-tasks.json',
  'scripts/validate-agent-governance.ps1'
)

$agentProfiles = [ordered]@{
  'code-explorer' = 'read-only'
  'architecture-reviewer' = 'read-only'
  'implementation-worker' = 'workspace-write'
  'validation-reviewer' = 'read-only'
}

foreach ($agentName in $agentProfiles.Keys) {
  $relativePath = ".codex/agents/$agentName.toml"
  $path = Join-Path $repositoryPath ($relativePath.Replace('/', [IO.Path]::DirectorySeparatorChar))
  if (-not (Test-Path -LiteralPath $path -PathType Leaf)) {
    Add-ValidationError "Required Agent profile is missing: $relativePath"
    continue
  }

  $content = [IO.File]::ReadAllText($path)
  $sandboxMatch = [regex]::Match($content, '(?m)^sandbox_mode\s*=\s*"([^"]+)"\s*$')
  if (-not $sandboxMatch.Success -or $sandboxMatch.Groups[1].Value -ne $agentProfiles[$agentName]) {
    Add-ValidationError "$relativePath must use sandbox_mode '$($agentProfiles[$agentName])'."
  }

  foreach ($marker in @(
    'AGENTS.md',
    'architecture-index.md',
    'project-architecture.md',
    'multi-agent-development.md',
    'docs/changes/active-tasks.json',
    '禁止执行任何 Git 写操作'
  )) {
    if (-not $content.Contains($marker)) {
      Add-ValidationError "$relativePath is missing required governance marker: $marker"
    }
  }
}

$codexConfigPath = Join-Path $repositoryPath '.codex/config.toml'
if (-not (Test-Path -LiteralPath $codexConfigPath -PathType Leaf)) {
  Add-ValidationError 'Required Codex configuration is missing: .codex/config.toml'
} else {
  $codexConfig = [IO.File]::ReadAllText($codexConfigPath)
  if ($codexConfig -notmatch '(?m)^enabled\s*=\s*true\s*$') {
    Add-ValidationError '.codex/config.toml must enable Agent support.'
  }
  if ($codexConfig -notmatch '(?m)^max_concurrent_threads_per_session\s*=\s*3\s*$') {
    Add-ValidationError '.codex/config.toml max_concurrent_threads_per_session must match the documented limit of 3.'
  }
}

if ($validationErrors.Count -gt 0) {
  Write-Host "Agent governance validation failed with $($validationErrors.Count) error(s):" -ForegroundColor Red
  foreach ($validationError in $validationErrors) {
    Write-Host "- $validationError" -ForegroundColor Red
  }
  exit 1
}

$activeTaskCount = if ($null -eq $registry) { 0 } else { @($registry.tasks).Count }
Write-Host "Agent governance validation passed. Active tasks: $activeTaskCount; checked Agent profiles: $($agentProfiles.Count)." -ForegroundColor Green
