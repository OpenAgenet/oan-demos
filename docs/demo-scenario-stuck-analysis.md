# OAN Demos Scenario Stuck Analysis

## Symptom

For non-`authorization-history` scenarios such as `service-agent`, `mixed-four`, and `mixed-1000`, the UI may remain on:

- `Preparing local OAN topology`

At the same time:

- the left-side topology may continue showing the previous `authorization-history` graph
- the timeline may not advance beyond the initial event
- the server process may appear alive, but the scenario does not complete through the normal UI path

## What Was Verified

The current behavior is not primarily caused by an OAN protocol semantic mismatch introduced by recent Root / Registrar / Discovery / CDN refactors.

This was verified by directly invoking the demo scenario runner from code:

- `runScenario("service-agent", ...)` can complete successfully when called outside the long-running demo server path
- the scenario can still drive registration, Root publication, CDN publication, Discovery indexing, and trusted invocation end to end

That means the core OAN service path is still compatible with the demo scenario logic.

## Root Cause Analysis

### 1. The stale topology is a demo event-ordering problem

In `src/server/scenarios.ts`, non-authorization scenarios originally emitted:

- `scenario-started`

before they emitted the normal runtime topology via `bus.setTopology(...)`.

If scenario preparation failed early, the snapshot still contained the previous topology, which explains why the UI could keep showing the `authorization-history` graph.

### 2. The deeper failure is in shared benchmark environment preparation

`oan-demos` reuses benchmark helper code from:

- `oan-examples/scripts/bench/shared.ts`

The helper `createBenchmarkEnvironment(...)` calls a Windows cleanup function:

- `cleanupResidualBenchmarkProcesses()`

That cleanup logic was intended to kill leftover benchmark-related Node processes, but it also matched `oan-demos` runtime processes such as:

- `tsx`
- `vite`

As a result, starting a non-authorization demo scenario could interrupt or destabilize the very demo runtime that launched it.

This explains why the UI could stop after the first event even though the scenario code itself was still valid.

## Changes Made In `oan-demos`

The demo topology emission was moved earlier in `src/server/scenarios.ts`.

Effect:

- even if a later preparation step fails
- the UI is less likely to keep showing the previous scenario topology
- the failure mode becomes easier to understand from the page state

## Related Change Outside `oan-demos`

There is a companion fix in:

- `oan-examples/scripts/bench/shared.ts`

That shared helper should not treat `oan-demos` runtime processes as disposable benchmark residue.

Without that companion fix, `oan-demos` can still be affected by the cleanup path because the long-running demo server imports and executes the shared benchmark helpers.

## Current Status

The following conclusion is already solid:

- the visible stuck behavior is not enough to conclude that the OAN node refactor broke demo protocol compatibility
- the first confirmed issue is the interaction between `oan-demos` and shared benchmark-process cleanup logic
- the second confirmed issue is that topology was emitted too late for good failure visibility

## Recommended Next Steps

1. Keep the early topology emission in `oan-demos`.
2. Finalize and retain the shared cleanup fix in `oan-examples/scripts/bench/shared.ts`.
3. Re-run at least:
   - `service-agent`
   - `mixed-four`
   - `mixed-1000`
4. If a scenario still stalls, add step-level logging around:
   - `createBenchmarkEnvironment(...)`
   - identity copy
   - PostgreSQL database initialization
   - node startup phases
5. Preserve a clear boundary in future maintenance:
   - demo presentation logic should stay in `oan-demos`
   - benchmark lifecycle cleanup should not accidentally control or terminate the demo runtime itself

## Files To Revisit

- `D:\\WorkFiles\\VscodeProject\\OAN-new\\oan-demos\\src\\server\\scenarios.ts`
- `D:\\WorkFiles\\VscodeProject\\OAN-new\\oan-examples\\scripts\\bench\\shared.ts`
- `D:\\WorkFiles\\VscodeProject\\OAN-new\\oan-demos\\src\\server\\index.ts`
- `D:\\WorkFiles\\VscodeProject\\OAN-new\\oan-demos\\src\\server\\event-bus.ts`
