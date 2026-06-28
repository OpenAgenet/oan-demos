<!-- Copyright (c) 2026 OpenAgenet contributors -->
<!--
Initial author: JINLIANG XU
Email: jlxufly@gmail.com
-->

# User Agent Python

Python reference implementation of a User Agent compatible with OpenAgenet, MCP, and A2A.

## Runtime

This agent uses `uv` for a reproducible cross-platform Python environment.

```powershell
uv run --project agents/user-agent-python python -m user_agent.main
```

By default the demo reads DID Documents, keys, and credentials from the sibling
`oan-reference-services/data` directory. Set `OAN_DATA_ROOT` to use another
fixture or deployment data directory.

The demo User Agent queries Discovery for a Service Agent, fetches the selected
Service Agent profile, calls `/agent/hello`, and prints the Discovery proof plus
the Service Agent deployment and author metadata.

