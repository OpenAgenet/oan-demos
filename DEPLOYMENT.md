<!--
  Copyright (c) 2026 OpenAgenet contributors

  Initial author: JINLIANG XU
  Email: jlxufly@gmail.com
-->

# OAN Demos Deployment Guide

This guide explains how to start `oan-demos` as a local visual console for real
OAN Root, Registrar, CDN, Discovery, NATS, and Agent flows.

## 1. Repository Layout

For normal demo use, `oan-demos` can run from its own repository directory. The
runtime payload is bundled inside:

```text
oan-demos\
  runtime\
    bin\win32-x64\
    fixtures\
    genesis\nodes\
    agent-py\
```

The bundled Windows x64 executables are:

- `root-node.exe`
- `registrar-node.exe`
- `discovery-node.exe`
- `cdn-node.exe`
- `cdn-publisher.exe`
- `nats-server.exe`

## 2. Required Dependencies

Install these tools before starting the demo:

- Node.js and npm.
- Python and `uv`, required by the Service Agent scenario.
- PostgreSQL server listening on `127.0.0.1:5432`.
- PostgreSQL CLI tools, especially `psql.exe`.

Rust, Cargo, sibling OAN implementation repositories, and an external NATS
install are not required for normal bundled-runtime demo use.

The current Windows test environment keeps PostgreSQL CLI tools at:

```text
D:\ProgramFiles\postgresql\bin
```

If your `psql.exe` is elsewhere, add it to `PATH` before starting the demo.

## 3. Environment Variables

No manual variables are required in the default bundled mode. The demo server
sets these defaults automatically:

```text
OAN_DEMOS_USE_BUNDLED_RUNTIME=true
OAN_EXAMPLES_ROOT=<oan-demos>
OAN_EXAMPLES_FIXTURES_ROOT=<oan-demos>\runtime\fixtures
OAN_GENESIS_NODES_ROOT=<oan-demos>\runtime\genesis\nodes
OAN_AGENT_PY_ROOT=<oan-demos>\runtime\agent-py
OAN_NATS_SERVER_PATH=<oan-demos>\runtime\bin\win32-x64\nats-server.exe
OAN_BENCH_DB_BACKEND=postgres
OAN_DEMO_SERVER_PORT=8787
OAN_DEMO_NATS_PORT=4522
```

PostgreSQL still runs outside the repository. If PostgreSQL requires a password,
configure it in the same shell:

```powershell
$env:PGPASSWORD = "<your-postgres-password>"
```

## 4. Install Node Dependencies

From the `oan-demos` directory:

```powershell
cd D:\Works\VscodeProject\OAN\oan-demos
npm install
```

## 5. Preflight Checks

Check PostgreSQL:

```powershell
& D:\ProgramFiles\postgresql\bin\psql.exe -h 127.0.0.1 -U postgres -d postgres -c "select 1;"
```

Check bundled runtime files:

```powershell
Test-Path .\runtime\bin\win32-x64\root-node.exe
Test-Path .\runtime\bin\win32-x64\nats-server.exe
Test-Path .\runtime\genesis\nodes\genesis-root
```

## 6. Start the Demo

The easiest command starts both the API server and the Vite web UI:

```powershell
cd D:\Works\VscodeProject\OAN\oan-demos
npm run demo
```

Open:

```text
http://127.0.0.1:5177
```

The web UI proxies API and SSE traffic to:

```text
http://127.0.0.1:8787
```

## 7. Start Services Separately

For debugging, run the backend and frontend in separate terminals.

Terminal 1:

```powershell
cd D:\Works\VscodeProject\OAN\oan-demos
npm run server
```

Terminal 2:

```powershell
cd D:\Works\VscodeProject\OAN\oan-demos
npm run dev
```

## 8. Ports Used by the Demo

| Component | Port |
|---|---:|
| Demo web UI | 5177 |
| Demo API/SSE server | 8787 |
| Root node | 8500 |
| Registrar 1 | 8501 |
| Registrar 2 | 8502 |
| Registrar 3 | 8505 |
| CDN node | 8503 |
| CDN publisher | 8510 |
| Discovery 1 | 8506 |
| Discovery 2 | 8507 |
| NATS JetStream | 4522 |
| Python Service Agent | 9001 |

## 9. Scenarios

The UI currently exposes these main scenarios:

- `Service Agent`: registers and publishes one Service Agent, indexes it through
  both Discovery nodes, then performs User Agent discovery and trusted VC-based
  invocation.
- `Four Resources`: registers one `agent_service`, one `skill`, one
  `mcp_server`, and one `tool_api`; all are published and indexed by both
  Discovery nodes.
- `1000 Mixed`: high-concurrency registration, Root publication, CDN sync, and
  Discovery indexing for 1000 mixed resources.

Genesis infrastructure node identities are copied from
`runtime\genesis\nodes`. Discovery authorized domains remain:

```text
genesis.openagenet.local
openagenet.local
```

## 10. Smoke Test

After starting the backend, run:

```powershell
Invoke-RestMethod -Uri 'http://127.0.0.1:8787/api/snapshot'
```

Start a scenario through the API:

```powershell
Invoke-RestMethod -Uri 'http://127.0.0.1:8787/api/scenarios/run' `
  -Method Post `
  -ContentType 'application/json' `
  -Body '{"scenarioId":"mixed-four"}'
```

Poll the snapshot:

```powershell
Invoke-RestMethod -Uri 'http://127.0.0.1:8787/api/snapshot'
```

## 11. Build and Type Check

Use these commands before committing changes:

```powershell
npm run typecheck
npm run build
```

## 12. Runtime Data and Logs

Generated frontend build output:

```text
oan-demos\dist
```

Demo logs:

```text
oan-demos\.demo-logs
oan-demos\.run-logs
```

Transient OAN scenario working data is created under:

```text
oan-demos\.oan-benchmark-work
```

These paths are local runtime artifacts and should not be committed.

## 13. Refresh Bundled Runtime

When upstream OAN node binaries, fixtures, genesis identities, or Python agent
code should be promoted into the standalone demo repository, build the upstream
services in release mode first, then run:

```powershell
npm run sync:runtime
```

The default source workspace is the parent directory of `oan-demos`. Override it
when needed:

```powershell
powershell -ExecutionPolicy Bypass -File scripts/sync-runtime.ps1 `
  -WorkspaceRoot D:\Works\VscodeProject\OAN `
  -NatsServerPath D:\ProgramFiles\nats\nats-server\nats-server.exe
```

The refresh script copies:

- release OAN node executables
- NATS server executable
- demo fixtures
- genesis node identities
- Python agent code, excluding nested `.git`

## 14. Source-Repo Development Mode

For local OAN service development, the demo can still build and run from sibling
implementation repositories:

```powershell
$env:OAN_DEMOS_USE_BUNDLED_RUNTIME = "false"
npm run demo
```

In this mode, keep the sibling repositories under one workspace root and ensure
Rust/Cargo are installed:

```text
<workspace>\
  oan-demos\
  oan-examples\
  oan-design-docs\
  oan-root-services\
  oan-registrar-node\
  oan-discovery-node\
  oan-agent-py\
```

## 15. Cleanup

If a scenario is interrupted, stop leftover demo processes from PowerShell:

```powershell
$names = @(
  'root-node.exe',
  'registrar-node.exe',
  'discovery-node.exe',
  'cdn-node.exe',
  'cdn-publisher.exe',
  'nats-server.exe',
  'python.exe',
  'uv.exe'
)

Get-CimInstance Win32_Process |
  Where-Object { $_.Name -in $names -and $_.CommandLine -like '*oan-demo-*' } |
  ForEach-Object { Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue }
```

To stop only the demo API server:

```powershell
Get-CimInstance Win32_Process |
  Where-Object { $_.Name -eq 'node.exe' -and $_.CommandLine -like '*src/server/index.ts*' } |
  ForEach-Object { Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue }
```

## 16. Troubleshooting

If the web UI opens but Run does nothing, check the backend:

```powershell
Invoke-RestMethod -Uri 'http://127.0.0.1:8787/api/snapshot'
```

If NATS fails to start, verify:

```powershell
Test-Path .\runtime\bin\win32-x64\nats-server.exe
```

If PostgreSQL setup fails, verify:

```powershell
& D:\ProgramFiles\postgresql\bin\psql.exe -h 127.0.0.1 -U postgres -d postgres -c "select version();"
```

If ports are already occupied, stop the previous demo scenario processes with
the cleanup commands above, then restart `npm run demo`.
