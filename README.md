<!--
  Copyright (c) 2026 OpenAgenet contributors

  Initial author: JINLIANG XU
  Email: jlxufly@gmail.com
-->

# OAN Demos

Local visual demos for OpenAgenet (OAN), an open infrastructure project for the
Internet of Agents (IoA). The repository is self-contained for normal
demonstration use: it includes the demo UI, demo server, OAN node executables,
NATS, genesis identities, fixtures, and the Python agent code under `runtime/`.

The demos are for showing the complete resource lifecycle locally: registration,
Root verification, CDN publication, Discovery indexing, semantic discovery, and
mutual verification before a trusted Service Agent invocation.

For a full setup guide, see [DEPLOYMENT.md](DEPLOYMENT.md).

## Run

```powershell
cd D:\Works\VscodeProject\OAN\oan-demos
npm install
npm run demo
```

Open `http://127.0.0.1:5177`.

The demo API listens on `http://127.0.0.1:8787` and the browser connects by SSE
to `/events`.

## Local Requirements

- Node.js and npm.
- Python and `uv`, required by the Service Agent scenario.
- PostgreSQL server listening on `127.0.0.1:5432`.
- PostgreSQL CLI tools, especially `psql.exe`.

The OAN service executables and NATS server are bundled in this repository for
Windows x64 under `runtime/bin/win32-x64/`.

## Topology

Every scenario starts a real local OAN topology:

- 1 Root node on port `8500`
- 3 Registrar nodes on ports `8501`, `8502`, `8505`
- 1 CDN node on port `8503`
- 1 CDN publisher on port `8510`
- 2 Discovery nodes on ports `8506`, `8507`
- 1 NATS JetStream on port `4522`
- optional Python Service Agent on port `9001`

Node identities are copied from bundled genesis fixtures. Genesis Registrar and
Discovery nodes use explicit all-domain authorization: `["*"]`.

## Scenarios

- `service-agent`: registers and publishes one Service Agent, both Discovery
  nodes index it, a User Agent discovers it, exchanges VC material, and performs
  a trusted invocation.
- `mixed-four`: registers one instance each of `agent_service`, `skill`,
  `mcp_server`, and `tool_api`; both Discovery nodes return all four resources.
- `mixed-1000`: high-concurrency registration and publication of 1000 mixed
  resources, showing pipeline progress from Registrars to Root, CDN, and both
  Discovery nodes.

## Verification

```powershell
npm run typecheck
npm run build
```

API smoke example:

```powershell
Invoke-RestMethod -Uri 'http://127.0.0.1:8787/api/scenarios/run' `
  -Method Post -ContentType 'application/json' `
  -Body '{"scenarioId":"mixed-four"}'

Invoke-RestMethod -Uri 'http://127.0.0.1:8787/api/snapshot'
```

## Runtime Refresh

When upstream OAN nodes or fixtures are intentionally upgraded, refresh the
bundled runtime from a sibling OAN workspace:

```powershell
npm run sync:runtime
```

Set `OAN_DEMOS_USE_BUNDLED_RUNTIME=false` only for development sessions where
the demo should build and run services from sibling implementation repositories.
