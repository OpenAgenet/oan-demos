<!-- Copyright (c) 2026 OpenAgenet contributors -->
<!--
Initial author: JINLIANG XU
Email: jlxufly@gmail.com
-->

# Genesis Service Nodes

This directory contains private genesis infrastructure-node material.

The node DID Documents intentionally reuse the did:oan syntax and DID Document verification model, but these infrastructure nodes are not ordinary OAN resources. They should not enter Registrar registration, Root/CDN distribution, or Discovery indexing.

Use `index.json` to enumerate reusable Root, Registrar, and Discovery fixtures for development, integration tests, pressure tests, and early community registration/discovery acceptance tests.

Each service-node folder contains node metadata, a DID Document fixture, an Ed25519 key pair, a chain governance notice, and a Root-signed infrastructure authorization VC.

Real infrastructure authorization requires both a valid Root-issued VC and the latest chain governance state to be active. The normalized did:oan DIDs in this directory are now authorized on chain; the earlier non-conformant REG/DISC DIDs were revoked and remain only as audit history.

This directory is private operator/test material.
