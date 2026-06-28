param(
  [string]$WorkspaceRoot = (Resolve-Path (Join-Path $PSScriptRoot '..\..')).Path,
  [string]$NatsServerPath = 'D:\ProgramFiles\nats\nats-server\nats-server.exe'
)

$ErrorActionPreference = 'Stop'

$RepoRoot = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path
$RuntimeRoot = Join-Path $RepoRoot 'runtime'
$BinRoot = Join-Path $RuntimeRoot 'bin\win32-x64'

function Copy-RequiredFile {
  param([string]$Source, [string]$Destination)
  if (-not (Test-Path -LiteralPath $Source)) {
    throw "Missing source file: $Source"
  }
  New-Item -ItemType Directory -Force -Path (Split-Path -Parent $Destination) | Out-Null
  Copy-Item -LiteralPath $Source -Destination $Destination -Force
}

function Copy-RequiredDirectory {
  param([string]$Source, [string]$Destination)
  if (-not (Test-Path -LiteralPath $Source)) {
    throw "Missing source directory: $Source"
  }
  if (Test-Path -LiteralPath $Destination) {
    Remove-Item -LiteralPath $Destination -Recurse -Force
  }
  New-Item -ItemType Directory -Force -Path (Split-Path -Parent $Destination) | Out-Null
  Copy-Item -LiteralPath $Source -Destination $Destination -Recurse -Force
}

New-Item -ItemType Directory -Force -Path $BinRoot | Out-Null

Copy-RequiredFile (Join-Path $WorkspaceRoot 'oan-root-services\target\release\root-node.exe') (Join-Path $BinRoot 'root-node.exe')
Copy-RequiredFile (Join-Path $WorkspaceRoot 'oan-root-services\target\release\cdn-node.exe') (Join-Path $BinRoot 'cdn-node.exe')
Copy-RequiredFile (Join-Path $WorkspaceRoot 'oan-root-services\target\release\cdn-publisher.exe') (Join-Path $BinRoot 'cdn-publisher.exe')
Copy-RequiredFile (Join-Path $WorkspaceRoot 'oan-registrar-node\target\release\registrar-node.exe') (Join-Path $BinRoot 'registrar-node.exe')
Copy-RequiredFile (Join-Path $WorkspaceRoot 'oan-discovery-node\target\release\discovery-node.exe') (Join-Path $BinRoot 'discovery-node.exe')
Copy-RequiredFile $NatsServerPath (Join-Path $BinRoot 'nats-server.exe')

Copy-RequiredDirectory (Join-Path $WorkspaceRoot 'oan-examples\fixtures\root') (Join-Path $RuntimeRoot 'fixtures\root')
Copy-RequiredDirectory (Join-Path $WorkspaceRoot 'oan-examples\fixtures\user-agent') (Join-Path $RuntimeRoot 'fixtures\user-agent')
Copy-RequiredDirectory (Join-Path $WorkspaceRoot 'oan-examples\fixtures\demo-service-agent') (Join-Path $RuntimeRoot 'fixtures\demo-service-agent')
Copy-RequiredDirectory (Join-Path $WorkspaceRoot 'oan-examples\fixtures\docs') (Join-Path $RuntimeRoot 'fixtures\docs')
Copy-RequiredDirectory (Join-Path $WorkspaceRoot 'oan-design-docs\genesis\nodes') (Join-Path $RuntimeRoot 'genesis\nodes')
Copy-RequiredDirectory (Join-Path $WorkspaceRoot 'oan-agent-py') (Join-Path $RuntimeRoot 'agent-py')

$NestedGit = Join-Path $RuntimeRoot 'agent-py\.git'
if (Test-Path -LiteralPath $NestedGit) {
  Remove-Item -LiteralPath $NestedGit -Recurse -Force
}

Write-Host "Bundled runtime refreshed under $RuntimeRoot"
