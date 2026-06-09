<!--
  Copyright (c) 2026 OpenAgenet contributors

  Initial author: JINLIANG XU
  Email: jlxufly@gmail.com
-->

# OAN Demos

Local visual demos for OpenAgenet / OAN. This repository is intentionally
independent from the implementation repositories. It reuses sibling repository
binaries, genesis fixtures, and benchmark helpers without changing OAN service
code.

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

## Required Local Layout

The demo expects this repository to sit beside the other OAN repositories under
one workspace root:

```text
D:\Works\VscodeProject\OAN
```

It uses the fixed local runtimes selected for this machine:

- NATS: `D:\ProgramFiles\nats\nats-server\nats-server.exe`
- PostgreSQL tools: `D:\ProgramFiles\postgresql\bin`

## Topology

Every scenario starts a real local OAN topology:

- 1 Root node on port `8500`
- 3 Registrar nodes on ports `8501`, `8502`, `8505`
- 1 CDN node on port `8503`
- 1 CDN publisher on port `8510`
- 2 Discovery nodes on ports `8506`, `8507`
- 1 NATS JetStream on port `4522`
- optional Python Service Agent on port `9001`

Node identities are copied from genesis fixtures. Discovery authorized domains
remain `genesis.openagenet.local` and `openagenet.local`.

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

The scenarios write transient OAN working data under the benchmark work
directory used by `oan-examples`; generated frontend assets and logs stay local
to this repo and are ignored by git.
