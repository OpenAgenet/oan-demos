<!-- Copyright (c) 2026 OpenAgenet contributors -->
<!--
Initial author: JINLIANG XU
Email: jlxufly@gmail.com
-->

# genesis-registrar-1

Role: registrar

DID: `did:oan:INRG:Edi352G96M7kgMB84enoEG2mj8AsDm3u`

Previous non-conformant DID: `did:oan:REG:genesis-registrar-1`

Endpoint: `https://registrar-1.genesis.openagenet.local`

This folder contains reusable private genesis material for local development, integration testing, pressure testing, and early community registration/discovery tests.

Files:

- `node.json`: canonical service-node metadata
- `private-key.jwk.json`: Ed25519 private key for this test service identity
- `public-key.jwk.json`: matching public JWK
- `did-document.json`: did:oan-conformant DID Document fixture for this infrastructure node
- `chain-governance-notice.json`: chain governance notice placeholder for the normalized DID
- `root-authorization-vc.json`: Root-signed infrastructure authorization VC

This infrastructure DID Document reuses did:oan syntax and DID Document verification semantics, but it is not an ordinary OAN resource. It should not enter Registrar registration, Root/CDN distribution, or Discovery indexing.

The VC is signed by `did:oan:INRT:VFU7ngZ2ug15GgUAPSA4ga8DBcNor2gk`. Full infrastructure authorization is effective only after the normalized DID is also active in the latest chain governance state.
