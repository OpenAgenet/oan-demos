<!-- Copyright (c) 2026 OpenAgenet contributors -->
<!--
Initial author: JINLIANG XU
Email: jlxufly@gmail.com
-->

# OAN Agent Python

Python Agent adapter SDK and reference Agent implementations for OpenAgenet.

## Scope

- Service Agent adapter helpers
- User Agent adapter helpers
- DID Document loading
- credential loading and selection
- trusted invocation signing
- inbound request verification
- nonce and timestamp checks
- signed response helpers
- MCP and A2A endpoint metadata helpers
- runnable Python examples managed with `uv`

## Role

This repository should make it easy for Python Agent developers to join OpenAgenet without manually implementing every DID, VC, signature, and Discovery verification detail.

## did:oan Resource Model

The current examples use `did:oan` resource discovery. The Service Agent is an `agent_service` resource, while the User Agent consumes Discovery responses that may contain Agent Service, Skill, MCP Server, or Tool/API resources. The Python examples currently demonstrate trusted Agent Service invocation; other resource forms should be consumed according to their DID Document, `oanMetadata`, protocol bindings, package references, and credential requirements.

## License

This Agent SDK and example repository is licensed under `Apache-2.0` to keep
developer adoption and ecosystem integration low-friction. Brand and official
OpenAgenet / OAN identity rights are reserved separately.
