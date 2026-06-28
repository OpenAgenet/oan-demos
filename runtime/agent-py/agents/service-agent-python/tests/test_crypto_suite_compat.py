# Copyright (c) 2026 OpenAgenet contributors
#
# Initial author: JINLIANG XU
# Email: jlxufly@gmail.com

from __future__ import annotations

import base64
import copy
import json
import tempfile
import sys
import unittest
from datetime import UTC, datetime
from pathlib import Path


PROJECT_ROOT = Path(__file__).resolve().parents[1]
SRC_ROOT = PROJECT_ROOT / "src"
if str(SRC_ROOT) not in sys.path:
    sys.path.insert(0, str(SRC_ROOT))

from cryptography.hazmat.primitives.asymmetric.ed25519 import Ed25519PrivateKey

from service_agent.main import (
    crypto_suite_from_proof,
    crypto_suite_from_verification_method,
    sign_value,
    signature_input,
    verify_discovery_response_binding,
    verify_proof_payload,
    verify_signed_value,
)


def b64url_encode(value: bytes) -> str:
    return base64.urlsafe_b64encode(value).decode("ascii").rstrip("=")


class ServiceAgentCryptoSuiteCompatTests(unittest.TestCase):
    def setUp(self) -> None:
        private_key = Ed25519PrivateKey.generate()
        public_key = private_key.public_key()
        private_bytes = private_key.private_bytes_raw()
        public_bytes = public_key.public_bytes_raw()
        did = "did:oan:AGDM:7YpQm9Kx2VnRb6Ts3WfHa4Cd5Ej8LgNz"
        self.key_id = f"{did}#key-1"
        self.keypair = {
            "did": did,
            "keyId": self.key_id,
            "cryptoSuite": "Ed25519Sha256Legacy",
            "privateKeyJwk": {
                "kty": "OKP",
                "crv": "Ed25519",
                "x": b64url_encode(public_bytes),
                "d": b64url_encode(private_bytes),
            },
        }
        self.did_document = {
            "@context": ["https://www.w3.org/ns/did/v1"],
            "id": did,
            "verificationMethod": [
                {
                    "id": self.key_id,
                    "type": "Ed25519VerificationKey2020",
                    "controller": did,
                    "cryptoSuite": "Ed25519Sha256Legacy",
                    "publicKeyJwk": {
                        "kty": "OKP",
                        "crv": "Ed25519",
                        "x": b64url_encode(public_bytes),
                    },
                }
            ],
        }
    def test_verify_current_and_historical_response_shapes(self) -> None:
        payload = {"reply": "ok", "verified": True}
        signed = sign_value(payload, self.keypair)
        self.assertTrue(verify_signed_value(signed, self.did_document))

        legacy = copy.deepcopy(signed)
        legacy["proof"].pop("cryptoSuite", None)
        legacy["proof"].pop("hashAlgorithm", None)
        legacy["proof"].pop("verificationMethod", None)
        self.assertEqual(crypto_suite_from_proof(legacy["proof"]), "Ed25519Sha256Legacy")
        self.assertTrue(verify_signed_value(legacy, self.did_document))

    def test_explicit_modern_suite_is_accepted(self) -> None:
        payload = {"reply": "ok", "verified": True}
        modern_keypair = {**self.keypair, "cryptoSuite": "Ed25519Sha256"}
        modern = sign_value(payload, modern_keypair)

        self.assertTrue(verify_signed_value(modern, self.did_document))

    def test_verification_method_explicit_suite_takes_precedence(self) -> None:
        method = copy.deepcopy(self.did_document["verificationMethod"][0])
        method["cryptoSuite"] = "Ed25519Sha256"

        self.assertEqual(
            crypto_suite_from_verification_method(method),
            "Ed25519Sha256",
        )

    def test_verify_proof_payload_accepts_legacy_signature_input(self) -> None:
        payload = {"eventHash": "abc123"}
        private_key = Ed25519PrivateKey.from_private_bytes(
            __import__("base64").urlsafe_b64decode(self.keypair["privateKeyJwk"]["d"] + "==")
        )
        proof = {
            "type": "Ed25519Signature2020",
            "creator": self.key_id,
            "created": datetime.now(UTC).isoformat().replace("+00:00", "Z"),
            "proofPurpose": "assertionMethod",
            "proofValue": b64url_encode(
                private_key.sign(signature_input(payload, "Ed25519Sha256Legacy"))
            ),
            "cryptoSuite": "Ed25519Sha256Legacy",
            "hashAlgorithm": "SHA-256",
            "verificationMethod": self.key_id,
        }
        self.assertTrue(verify_proof_payload(payload, proof, self.did_document))

    def test_verify_discovery_response_binding_accepts_authorized_target(self) -> None:
        service_did_document = {
            "id": "did:oan:AGDM:7YpQm9Kx2VnRb6Ts3WfHa4Cd5Ej8LgNz",
            "verificationMethod": self.did_document["verificationMethod"],
        }
        discovery_did = "did:oan:AGDS:8YpQm9Kx2VnRb6Ts3WfHa4Cd5Ej8LgNz"
        discovery_key_id = f"{discovery_did}#key-1"
        discovery_did_document = {
            "id": discovery_did,
            "verificationMethod": [
                {
                    "id": discovery_key_id,
                    "type": "Ed25519VerificationKey2020",
                    "controller": discovery_did,
                    "cryptoSuite": "Ed25519Sha256Legacy",
                    "publicKeyJwk": self.did_document["verificationMethod"][0]["publicKeyJwk"],
                }
            ],
        }
        private_key = Ed25519PrivateKey.from_private_bytes(
            __import__("base64").urlsafe_b64decode(self.keypair["privateKeyJwk"]["d"] + "==")
        )
        discovery_response = {
            "discoveryDid": discovery_did,
            "candidates": [{"resourceDid": service_did_document["id"], "resourceType": "agent_service"}],
            "createdAt": datetime.now(UTC).isoformat().replace("+00:00", "Z"),
        }
        discovery_response["proof"] = {
            "type": "Ed25519Signature2020",
            "creator": discovery_key_id,
            "created": discovery_response["createdAt"],
            "proofPurpose": "assertionMethod",
            "proofValue": b64url_encode(
                private_key.sign(
                    signature_input(
                        {
                            "discoveryDid": discovery_response["discoveryDid"],
                            "candidates": discovery_response["candidates"],
                            "createdAt": discovery_response["createdAt"],
                        },
                        "Ed25519Sha256Legacy",
                    )
                )
            ),
            "cryptoSuite": "Ed25519Sha256Legacy",
            "hashAlgorithm": "SHA-256",
            "verificationMethod": discovery_key_id,
        }
        bulletin = {
            "events": [
                {
                    "subjectDid": discovery_did,
                    "eventType": "DISCOVERY_NODE_AUTHORIZED",
                }
            ]
        }

        with tempfile.TemporaryDirectory() as temp_dir:
            temp_path = Path(temp_dir)
            (temp_path / "service-did-document.json").write_text(
                json.dumps(service_did_document), encoding="utf-8"
            )
            (temp_path / "discovery-did-document.json").write_text(
                json.dumps(discovery_did_document), encoding="utf-8"
            )
            (temp_path / "root-bulletin.json").write_text(
                json.dumps(bulletin), encoding="utf-8"
            )
            from unittest.mock import patch

            with (
                patch("service_agent.main.DISCOVERY_DID_DOCUMENT", temp_path / "discovery-did-document.json"),
                patch("service_agent.main.ROOT_BULLETIN", temp_path / "root-bulletin.json"),
            ):
                verify_discovery_response_binding(discovery_response, service_did_document["id"])

                wrong_response = copy.deepcopy(discovery_response)
                wrong_response["candidates"][0]["resourceDid"] = "did:oan:AGDM:9YpQm9Kx2VnRb6Ts3WfHa4Cd5Ej8LgNz"
                with self.assertRaises(Exception):
                    verify_discovery_response_binding(wrong_response, service_did_document["id"])


if __name__ == "__main__":
    unittest.main()
