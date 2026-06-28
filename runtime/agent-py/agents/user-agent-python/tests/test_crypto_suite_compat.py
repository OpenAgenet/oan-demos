# Copyright (c) 2026 OpenAgenet contributors
#
# Initial author: JINLIANG XU
# Email: jlxufly@gmail.com

from __future__ import annotations

import base64
import copy
import hashlib
import json
import sys
import unittest
from datetime import UTC, datetime
from pathlib import Path


PROJECT_ROOT = Path(__file__).resolve().parents[1]
SRC_ROOT = PROJECT_ROOT / "src"
if str(SRC_ROOT) not in sys.path:
    sys.path.insert(0, str(SRC_ROOT))

from cryptography.hazmat.primitives.asymmetric.ed25519 import Ed25519PrivateKey

from user_agent.main import (
    canonical_json,
    crypto_suite_from_proof,
    crypto_suite_from_verification_method,
    ensure_candidate_matches_verified_package,
    payload_hash,
    signature_input,
    sign_value,
    verify_proof_payload,
    verify_service_registration_credential,
    verify_signed_value,
)


def b64url_encode(value: bytes) -> str:
    return base64.urlsafe_b64encode(value).decode("ascii").rstrip("=")


class UserAgentCryptoSuiteCompatTests(unittest.TestCase):
    def setUp(self) -> None:
        private_key = Ed25519PrivateKey.generate()
        public_key = private_key.public_key()
        private_bytes = private_key.private_bytes_raw()
        public_bytes = public_key.public_bytes_raw()
        did = "did:oan:AGUS:7YpQm9Kx2VnRb6Ts3WfHa4Cd5Ej8LgNz"
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

    def test_sign_and_verify_current_self_describing_payload(self) -> None:
        payload = {"hello": "world"}
        signed = sign_value(payload, self.keypair)

        self.assertEqual(signed["proof"]["cryptoSuite"], "Ed25519Sha256Legacy")
        self.assertEqual(signed["proof"]["verificationMethod"], self.key_id)
        self.assertTrue(verify_signed_value(signed, self.did_document))

    def test_verify_historical_payload_without_crypto_metadata(self) -> None:
        payload = {"hello": "world"}
        signed = sign_value(payload, self.keypair)
        legacy = copy.deepcopy(signed)
        legacy["proof"].pop("cryptoSuite", None)
        legacy["proof"].pop("hashAlgorithm", None)
        legacy["proof"].pop("verificationMethod", None)

        self.assertEqual(crypto_suite_from_proof(legacy["proof"]), "Ed25519Sha256Legacy")
        self.assertTrue(verify_signed_value(legacy, self.did_document))

    def test_explicit_modern_suite_is_accepted(self) -> None:
        payload = {"hello": "world"}
        modern_keypair = {**self.keypair, "cryptoSuite": "Ed25519Sha256"}
        modern = sign_value(payload, modern_keypair)

        self.assertTrue(verify_signed_value(modern, self.did_document))

    def test_verification_method_prefers_explicit_suite(self) -> None:
        method = copy.deepcopy(self.did_document["verificationMethod"][0])
        method["cryptoSuite"] = "Ed25519Sha256"
        self.assertEqual(
            crypto_suite_from_verification_method(method),
            "Ed25519Sha256",
        )

    def test_payload_hash_matches_legacy_sha256_of_canonical_json(self) -> None:
        payload = {"b": 2, "a": 1}
        expected = __import__("hashlib").sha256(
            canonical_json(payload).encode("utf-8")
        ).hexdigest().encode("utf-8")
        self.assertEqual(payload_hash(payload), expected)

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

    def test_candidate_must_match_verified_package_endpoint(self) -> None:
        candidate = {
            "resourceDid": self.did_document["id"],
            "resourceType": "agent_service",
            "services": [
                {
                    "type": "AgentService",
                    "serviceEndpoint": "https://good.example/agent/invoke",
                }
            ],
        }
        package = {
            "resourceDid": self.did_document["id"],
            "resourceType": "agent_service",
            "didDocument": {
                "service": [
                    {
                        "type": "AgentService",
                        "serviceEndpoint": "https://good.example/agent/invoke",
                    }
                ]
            },
        }
        service = ensure_candidate_matches_verified_package(candidate, package)
        self.assertEqual(service["serviceEndpoint"], "https://good.example/agent/invoke")

        bad_candidate = copy.deepcopy(candidate)
        bad_candidate["services"][0]["serviceEndpoint"] = "https://evil.example/agent/invoke"
        with self.assertRaisesRegex(ValueError, "candidate_service_endpoint_mismatch"):
            ensure_candidate_matches_verified_package(bad_candidate, package)

    def test_candidate_accepts_oan_agent_service_type(self) -> None:
        candidate = {
            "resourceDid": self.did_document["id"],
            "resourceType": "agent_service",
            "services": [
                {
                    "type": "OANAgentService",
                    "serviceEndpoint": "https://good.example/agent/invoke",
                }
            ],
        }
        package = {
            "resourceDid": self.did_document["id"],
            "resourceType": "agent_service",
            "didDocument": {
                "service": [
                    {
                        "type": "OANAgentService",
                        "serviceEndpoint": "https://good.example/agent/invoke",
                    }
                ]
            },
        }
        service = ensure_candidate_matches_verified_package(candidate, package)
        self.assertEqual(service["type"], "OANAgentService")
        self.assertEqual(service["serviceEndpoint"], "https://good.example/agent/invoke")

    def test_service_registration_credential_binds_to_verified_package(self) -> None:
        package = {
            "resourceDid": self.did_document["id"],
            "resourceType": "agent_service",
            "didDocument": self.did_document,
            "didDocumentHash": hashlib.sha256(
                canonical_json(self.did_document).encode("utf-8")
            ).hexdigest(),
            "metadataHash": "sha256:abc123",
        }
        credential = {
            "@context": [
                "https://www.w3.org/2018/credentials/v1",
                "https://openagenet.org/credentials/v1",
            ],
            "id": "urn:oan:credential:resource-registration:test",
            "type": ["VerifiableCredential", "OANResourceRegistrationCredential"],
            "issuer": self.did_document["id"],
            "issuanceDate": datetime.now(UTC).isoformat().replace("+00:00", "Z"),
            "credentialSubject": {
                "id": self.did_document["id"],
                "resourceDid": self.did_document["id"],
                "resourceType": "agent_service",
                "didDocumentHash": package["didDocumentHash"],
                "metadataHash": package["metadataHash"],
            },
            "credentialStatus": {
                "type": "OANResourceRegistrationStatus",
                "status": "active",
            },
        }
        signed_credential = sign_value(credential, self.keypair)

        check = verify_service_registration_credential(
            signed_credential,
            package,
            self.did_document,
        )
        self.assertEqual(check["issuer"], self.did_document["id"])
        self.assertEqual(check["subject"], self.did_document["id"])

        tampered = copy.deepcopy(package)
        tampered["resourceDid"] = "did:oan:AGDM:wrong"
        with self.assertRaisesRegex(ValueError, "subject_mismatch"):
            verify_service_registration_credential(signed_credential, tampered, self.did_document)


if __name__ == "__main__":
    unittest.main()
