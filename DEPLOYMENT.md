<!--
  Copyright (c) 2026 OpenAgenet contributors

  Initial author: JINLIANG XU
  Email: jlxufly@gmail.com
-->

# OAN Demos Deployment Guide

This guide explains how to deploy and start `oan-demos` after cloning it into a
local OpenAgenet workspace. The demo is a local visual console for real OAN
Root, Registrar, CDN, Discovery, NATS, and Agent flows.

## 1. Repository Layout

`oan-demos` is designed to live beside the OAN implementation repositories under
one workspace root. The default workspace layout is:

```text
D:\Works\VscodeProject\OAN
  oan-demos\
  oan-examples\
  oan-design-docs\
  oan-protocol-common\
  oan-root-services\
  oan-registrar-node\
  oan-discovery-node\
  oan-agent-py\
```

The demo server resolves sibling repositories from its parent directory. If the
workspace root is different, keep the same sibling layout or set the environment
variables listed below.

## 2. Required Dependencies

Install these tools before starting the demo:

- Node.js and npm.
- Rust toolchain with Cargo, required to build and run the Rust OAN services.
- Python and `uv`, required by the Service Agent scenario.
- PostgreSQL server listening on `127.0.0.1:5432`.
- PostgreSQL CLI tools, especially `psql.exe`.
- NATS Server with JetStream support.

The current Windows test environment uses these fixed runtime locations:

```text
NATS server:
D:\ProgramFiles\nats\nats-server\nats-server.exe

PostgreSQL tools:
D:\ProgramFiles\postgresql\bin
```

The benchmark helper searches `D:\ProgramFiles\postgresql\bin` for PostgreSQL
CLI tools. The demo server also sets `OAN_NATS_SERVER_PATH` to the fixed NATS
path when the variable is not already defined.

## 3. Environment Variables

In the default sibling layout, no manual environment variables are required for
the demo itself. The server sets these defaults automatically:

```text
OAN_WORKSPACE_ROOT=<parent directory of oan-demos>
OAN_PROTOCOL_COMMON_ROOT=<workspace>\oan-protocol-common
OAN_ROOT_SERVICES_ROOT=<workspace>\oan-root-services
OAN_REGISTRAR_NODE_ROOT=<workspace>\oan-registrar-node
OAN_DISCOVERY_NODE_ROOT=<workspace>\oan-discovery-node
OAN_EXAMPLES_ROOT=<workspace>\oan-examples
OAN_DESIGN_DOCS_ROOT=<workspace>\oan-design-docs
OAN_GENESIS_NODES_ROOT=<workspace>\oan-design-docs\genesis\nodes
OAN_AGENT_PY_ROOT=<workspace>\oan-agent-py
OAN_BENCH_DB_BACKEND=postgres
OAN_NATS_SERVER_PATH=D:\ProgramFiles\nats\nats-server\nats-server.exe
OAN_DEMO_SERVER_PORT=8787
OAN_DEMO_NATS_PORT=4522
```

Override them only if your repository or runtime paths are different.

## 4. Install Node Dependencies

From the `oan-demos` directory:

```powershell
cd D:\Works\VscodeProject\OAN\oan-demos
npm install
```

## 5. Preflight Checks

Check PostgreSQL and NATS:

```powershell
& D:\ProgramFiles\postgresql\bin\psql.exe -h 127.0.0.1 -U postgres -d postgres -c "select 1;"
Test-Path D:\ProgramFiles\nats\nats-server\nats-server.exe
```

If PostgreSQL requires a password, configure it in the same shell before running
the demo, for example:

```powershell
$env:PGPASSWORD = "<your-postgres-password>"
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

Each scenario starts a real local topology:

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

The UI currently exposes three scenarios:

- `Service Agent`: registers and publishes one Service Agent, indexes it through
  both Discovery nodes, then performs User Agent discovery and trusted VC-based
  invocation.
- `Four Resources`: registers one `agent_service`, one `skill`, one
  `mcp_server`, and one `tool_api`; all are published and indexed by both
  Discovery nodes.
- `1000 Mixed`: high-concurrency registration, Root publication, CDN sync, and
  Discovery indexing for 1000 mixed resources.

Genesis infrastructure node identities are copied from
`oan-design-docs\genesis\nodes`. Discovery authorized domains remain:

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
```

Transient OAN scenario working data is created under the benchmark work
directory managed by `oan-examples`, usually:

```text
oan-examples\.oan-benchmark-work
```

These paths are local runtime artifacts and should not be committed.

## 13. Cleanup

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

## 14. Troubleshooting

If the web UI opens but Run does nothing, check the backend:

```powershell
Invoke-RestMethod -Uri 'http://127.0.0.1:8787/api/snapshot'
```

If NATS fails to start, verify:

```powershell
Test-Path D:\ProgramFiles\nats\nats-server\nats-server.exe
```

If PostgreSQL setup fails, verify:

```powershell
& D:\ProgramFiles\postgresql\bin\psql.exe -h 127.0.0.1 -U postgres -d postgres -c "select version();"
```

If ports are already occupied, stop the previous demo scenario processes with
the cleanup commands above, then restart `npm run demo`.
