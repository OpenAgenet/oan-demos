# Copyright (c) 2026 OpenAgenet contributors
#
# Initial author: JINLIANG XU
# Email: jlxufly@gmail.com

from __future__ import annotations

import base64
import copy
import hashlib
import json
import os
import sys
from datetime import UTC, datetime, timedelta
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from typing import Any

from cryptography.hazmat.primitives.asymmetric.ed25519 import Ed25519PrivateKey, Ed25519PublicKey


REPO_ROOT = Path(os.environ.get("OAN_DATA_ROOT", Path(__file__).resolve().parents[4].parent / "oan-reference-services")).resolve()
DEFAULT_DID_DOCUMENT = REPO_ROOT / "data" / "demo-service-agent" / "did-document.json"
SERVICE_KEYPAIR = REPO_ROOT / "data" / "demo-service-agent" / "keys" / "keypair.json"
SERVICE_REGISTRATION_CREDENTIAL = REPO_ROOT / "data" / "demo-service-agent" / "credentials" / "resource-registration-vc.json"
REGISTRAR_DID_DOCUMENT = REPO_ROOT / "data" / "registrar" / "did-document.json"
DISCOVERY_DID_DOCUMENT = REPO_ROOT / "data" / "discovery" / "did-document.json"
ROOT_BULLETIN = REPO_ROOT / "data" / "root" / "bulletin.json"
ROOT_AUTHORIZATION_STATE = REPO_ROOT / "data" / "root" / "authorization-state.json"

SEEN_NONCES: set[str] = set()
MAX_INVOCATION_AGE = timedelta(minutes=5)
MAX_DISCOVERY_RESPONSE_AGE = timedelta(minutes=5)
ED25519_MODERN_SUITES = {"Ed25519Sha256", "ed25519-sha256"}
ED25519_LEGACY_SUITES = {"Ed25519Sha256Legacy", "ed25519-sha256-legacy"}
ED25519_SUITES = ED25519_MODERN_SUITES | ED25519_LEGACY_SUITES

ORGANIZATION = {
    "deployer": "China Academy of Information and Communications Technology (CAICT)",
    "author": "JINLIANG XU",
    "email": ["xujinliang@caict.ac.cn", "jlxufly@gmail.com"],
}


def b64url_decode(value: str) -> bytes:
    return base64.urlsafe_b64decode(value + "=" * (-len(value) % 4))


def b64url_encode(value: bytes) -> str:
    return base64.urlsafe_b64encode(value).decode("ascii").rstrip("=")


def canonical_json(value: Any) -> str:
    return json.dumps(value, ensure_ascii=False, sort_keys=True, separators=(",", ":"))


def payload_hash(value: Any) -> bytes:
    return hashlib.sha256(canonical_json(value).encode("utf-8")).hexdigest().encode("utf-8")


def signature_input(value: Any, suite: str) -> bytes:
    canonical = canonical_json(value).encode("utf-8")
    if suite in ED25519_MODERN_SUITES:
        return canonical
    if suite in ED25519_LEGACY_SUITES:
        return hashlib.sha256(canonical).hexdigest().encode("utf-8")
    raise ValueError(f"unsupported_crypto_suite_for_python_agent: {suite}")


def crypto_suite_from_verification_method(method: dict[str, Any]) -> str:
    return str(method.get("cryptoSuite") or ("Sm2Sm3" if method.get("type") == "SM2VerificationKey2020" else "Ed25519Sha256Legacy"))


def crypto_suite_from_proof(proof: dict[str, Any]) -> str:
    return str(proof.get("cryptoSuite") or ("Sm2Sm3" if proof.get("type") == "SM2Signature2020" else "Ed25519Sha256Legacy"))


def load_json(path: Path) -> dict[str, Any]:
    return json.loads(path.read_text(encoding="utf-8"))


def load_optional_json(path: Path) -> dict[str, Any] | None:
    if not path.exists():
        return None
    return load_json(path)


def private_key_from_jwk(jwk: dict[str, str]) -> Ed25519PrivateKey:
    return Ed25519PrivateKey.from_private_bytes(b64url_decode(jwk["d"]))


def public_key_from_did_document(did_document: dict[str, Any], key_id: str) -> Ed25519PublicKey:
    for method in did_document.get("verificationMethod", []):
        if method.get("id") == key_id:
            suite = crypto_suite_from_verification_method(method)
            if suite not in ED25519_SUITES:
                raise ValueError(f"unsupported_crypto_suite_for_python_agent: {suite}")
            return Ed25519PublicKey.from_public_bytes(b64url_decode(method["publicKeyJwk"]["x"]))
    if key_id == did_document.get("id"):
        assertion_methods = did_document.get("assertionMethod") or []
        if assertion_methods:
            return public_key_from_did_document(did_document, str(assertion_methods[0]))
    raise ValueError(f"verification method not found: {key_id}")


def verify_signed_value(value: dict[str, Any], did_document: dict[str, Any], proof_field: str = "proof") -> bool:
    proof = value.get(proof_field) or {}
    creator = proof.get("creator")
    signature = proof.get("proofValue")
    if not creator or not signature:
        return False
    suite = crypto_suite_from_proof(proof)
    if suite not in ED25519_SUITES:
        raise ValueError(f"unsupported_crypto_suite_for_python_agent: {suite}")

    unsigned = copy.deepcopy(value)
    unsigned.pop(proof_field, None)
    unsigned.pop("proofCreator", None)
    public_key = public_key_from_did_document(did_document, creator)
    public_key.verify(b64url_decode(signature), signature_input(unsigned, suite))
    return True


def verify_proof_payload(payload: Any, proof: dict[str, Any], did_document: dict[str, Any]) -> bool:
    creator = proof.get("creator")
    signature = proof.get("proofValue")
    if not creator or not signature:
        return False
    suite = crypto_suite_from_proof(proof)
    if suite not in ED25519_SUITES:
        raise ValueError(f"unsupported_crypto_suite_for_python_agent: {suite}")
    public_key = public_key_from_did_document(did_document, creator)
    public_key.verify(b64url_decode(signature), signature_input(payload, suite))
    return True


def parse_utc_timestamp(value: str, error_code: str) -> datetime:
    try:
        parsed = datetime.fromisoformat(value.replace("Z", "+00:00"))
    except ValueError as exc:
        raise ValueError(error_code) from exc
    if parsed.tzinfo is None:
        raise ValueError(error_code)
    return parsed.astimezone(UTC)


def discovery_is_authorized(discovery_did: str, bulletin: dict[str, Any], authorization_state: dict[str, Any] | None = None) -> bool:
    discovery_nodes = (authorization_state or {}).get("discovery_nodes")
    if isinstance(discovery_nodes, dict) and discovery_did in discovery_nodes:
        return discovery_nodes[discovery_did].get("status") == "active"

    authorized = False
    revoked = False
    for event in bulletin.get("events", []):
        if event.get("subjectDid") != discovery_did:
            continue
        event_type = event.get("eventType")
        if event_type == "DISCOVERY_NODE_AUTHORIZED":
            authorized = True
        if event_type == "NODE_AUTHORIZATION_REVOKED":
            revoked = True
    return authorized and not revoked


def verify_discovery_response_binding(discovery_response: dict[str, Any], service_did: str) -> None:
    discovery_did_document = load_json(DISCOVERY_DID_DOCUMENT)
    bulletin = load_json(ROOT_BULLETIN)
    authorization_state = load_json(ROOT_AUTHORIZATION_STATE) if ROOT_AUTHORIZATION_STATE.exists() else {}
    discovery_did = discovery_response.get("discoveryDid")
    if discovery_did != discovery_did_document.get("id"):
        raise ValueError("discovery_did_mismatch")
    if not discovery_is_authorized(discovery_did, bulletin, authorization_state):
        raise ValueError("discovery_not_authorized")
    proof = discovery_response.get("proof") or {}
    if isinstance(proof, dict) and proof:
        unsigned = {
            "discoveryDid": discovery_response.get("discoveryDid"),
            "candidates": discovery_response.get("candidates", []),
            "createdAt": discovery_response.get("createdAt"),
        }
        verify_proof_payload(unsigned, proof, discovery_did_document)
    created_at = parse_utc_timestamp(str(discovery_response.get("createdAt") or ""), "invalid_discovery_timestamp")
    now = datetime.now(UTC)
    if created_at > now + timedelta(seconds=30):
        raise ValueError("discovery_timestamp_in_future")
    if now - created_at > MAX_DISCOVERY_RESPONSE_AGE:
        raise ValueError("discovery_timestamp_expired")
    candidates = discovery_response.get("candidates")
    if not isinstance(candidates, list) or not any((item.get("resourceDid") or item.get("did")) == service_did for item in candidates if isinstance(item, dict)):
        raise ValueError("target_not_present_in_discovery_response")


def sign_value(value: dict[str, Any], keypair: dict[str, Any]) -> dict[str, Any]:
    unsigned = copy.deepcopy(value)
    unsigned.pop("proof", None)
    private_key = private_key_from_jwk(keypair["privateKeyJwk"])
    crypto_suite = str(keypair.get("cryptoSuite") or "Ed25519Sha256")
    if crypto_suite not in ED25519_SUITES:
        raise ValueError(f"unsupported_crypto_suite_for_python_agent: {crypto_suite}")
    proof = {
        "type": "Ed25519Signature2020",
        "creator": keypair["keyId"],
        "created": datetime.now(UTC).isoformat().replace("+00:00", "Z"),
        "proofPurpose": "assertionMethod",
        "proofValue": b64url_encode(private_key.sign(signature_input(unsigned, crypto_suite))),
        "cryptoSuite": crypto_suite,
        "hashAlgorithm": "SHA-256",
        "verificationMethod": keypair["keyId"],
    }
    return {**unsigned, "proof": proof}


def service_profile() -> dict[str, Any]:
    did_document = load_json(DEFAULT_DID_DOCUMENT)
    metadata = did_document.get("oanMetadata", {})
    description = metadata.get("resourceDescription", {})
    return {
        "name": "Demo Service Agent",
        "role": "service-agent",
        "did": did_document["id"],
        "deployment": ORGANIZATION,
        "capabilityDescription": description.get("description"),
        "capabilityTags": description.get("capabilityTags", metadata.get("capabilityTags", [])),
        "serviceEndpoints": did_document.get("service", []),
        "supportedProtocols": ["OAN trusted invocation", "MCP", "A2A"],
    }


def service_credentials() -> list[dict[str, Any]]:
    registration_credential = load_optional_json(SERVICE_REGISTRATION_CREDENTIAL)
    return [registration_credential] if isinstance(registration_credential, dict) else []


def verify_invocation(payload: dict[str, Any]) -> dict[str, Any]:
    service_did = load_json(DEFAULT_DID_DOCUMENT)["id"]
    caller_did = payload.get("callerDid")
    target_did = payload.get("targetDid")
    nonce = payload.get("nonce")
    timestamp = payload.get("timestamp")
    body = payload.get("body")
    body_hash = payload.get("bodyHash")
    caller_did_document = payload.get("callerDidDocument")
    credentials = payload.get("credentials", [])
    discovery_response = payload.get("discoveryResponse")

    if payload.get("type") != "OANTrustedInvocation":
        raise ValueError("invalid_invocation_type")
    if not caller_did or not target_did or not nonce or not timestamp:
        raise ValueError("missing_invocation_fields")
    if target_did != service_did:
        raise ValueError("target_did_mismatch")
    if not isinstance(body, dict) or not isinstance(body_hash, str):
        raise ValueError("missing_or_invalid_body_hash")
    expected_body_hash = hashlib.sha256(canonical_json(body).encode("utf-8")).hexdigest()
    if body_hash != expected_body_hash:
        raise ValueError("body_hash_mismatch")
    try:
        request_time = datetime.fromisoformat(timestamp.replace("Z", "+00:00"))
    except ValueError as exc:
        raise ValueError("invalid_timestamp") from exc
    if request_time.tzinfo is None:
        raise ValueError("timestamp_must_include_timezone")
    now = datetime.now(UTC)
    if request_time > now + timedelta(seconds=30):
        raise ValueError("timestamp_in_future")
    if now - request_time > MAX_INVOCATION_AGE:
        raise ValueError("timestamp_expired")
    if not isinstance(caller_did_document, dict) or caller_did_document.get("id") != caller_did:
        raise ValueError("caller_did_document_mismatch")
    if not isinstance(credentials, list):
        raise ValueError("credentials_must_be_array")
    if nonce in SEEN_NONCES:
        raise ValueError("replayed_nonce")
    if not isinstance(discovery_response, dict):
        raise ValueError("missing_discovery_response")

    try:
        request_signature_verified = verify_signed_value(payload, caller_did_document)
    except Exception as exc:
        raise ValueError("request_signature_invalid") from exc
    if not request_signature_verified:
        raise ValueError("request_signature_invalid")
    registrar_did_document = load_json(REGISTRAR_DID_DOCUMENT)
    user_credentials = [
        credential for credential in credentials
        if credential.get("subject") == caller_did
        and credential.get("status") == "active"
        and credential.get("type") in {"UserAgentRegistrationCredential", "AgentRegistrationCredential"}
    ]
    if not user_credentials:
        raise ValueError("missing_user_agent_credential")

    user_credential = user_credentials[0]
    try:
        credential_verified = verify_signed_value(user_credential, registrar_did_document)
    except Exception as exc:
        raise ValueError("user_credential_signature_invalid") from exc
    if not credential_verified:
        raise ValueError("user_credential_signature_invalid")
    try:
        verify_discovery_response_binding(discovery_response, service_did)
    except Exception as exc:
        raise ValueError(f"discovery_response_invalid:{exc}") from exc

    SEEN_NONCES.add(nonce)
    return {
        "callerDid": caller_did,
        "targetDid": target_did,
        "nonce": nonce,
        "timestamp": timestamp,
        "discoveryResponseVerified": True,
        "requestSignatureVerified": request_signature_verified,
        "userCredentialVerified": credential_verified,
        "userCredentialType": user_credential.get("type"),
        "userCredentialIssuer": user_credential.get("issuer"),
    }


class ServiceAgentHandler(BaseHTTPRequestHandler):
    server_version = "OANServiceAgent/0.1"

    def do_GET(self) -> None:
        if self.path == "/health":
            self.write_json({"status": "ok", "nodeType": "service-agent"})
            return
        if self.path == "/agent/did":
            self.write_json(load_json(DEFAULT_DID_DOCUMENT))
            return
        if self.path == "/agent/profile":
            self.write_json(service_profile())
            return
        if self.path in {"/mcp", "/a2a"}:
            self.write_json({
                "status": "ok",
                "protocol": self.path.strip("/").upper(),
                "profile": service_profile(),
            })
            return
        self.write_json({"error": "not_found"}, status=404)

    def do_POST(self) -> None:
        payload = self.read_json_body()
        if self.path in {"/agent/hello", "/agent/invoke"}:
            try:
                verification = verify_invocation(payload)
                response = {
                    "type": "OANTrustedInvocationResponse",
                    "reply": "hello, verified OAN caller",
                    "verified": True,
                    "callerDid": verification["callerDid"],
                    "serviceDid": service_profile()["did"],
                    "requestNonce": verification["nonce"],
                    "timestamp": datetime.now(UTC).isoformat().replace("+00:00", "Z"),
                    "verification": verification,
                    "serviceAgent": service_profile(),
                    "credentials": service_credentials(),
                    "demoPurpose": "Show signed Agent-to-Agent invocation, VC verification, deployment organization, author, and callable endpoint in one trusted collaboration response.",
                }
                self.write_json(sign_value(response, load_json(SERVICE_KEYPAIR)))
            except Exception as exc:
                self.write_json({"error": "trusted_invocation_rejected", "reason": str(exc)}, status=401)
            return
        self.write_json({"error": "not_found"}, status=404)

    def read_json_body(self) -> dict[str, Any]:
        length = int(self.headers.get("content-length", "0"))
        if length == 0:
            return {}
        return json.loads(self.rfile.read(length).decode("utf-8"))

    def write_json(self, value: dict[str, Any], status: int = 200) -> None:
        body = json.dumps(value, ensure_ascii=False, indent=2).encode("utf-8")
        self.send_response(status)
        self.send_header("content-type", "application/json; charset=utf-8")
        self.send_header("content-length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def log_message(self, fmt: str, *args: Any) -> None:
        sys.stderr.write("[service-agent] " + fmt % args + "\n")


def main() -> None:
    host = "127.0.0.1"
    port = 9001
    server = ThreadingHTTPServer((host, port), ServiceAgentHandler)
    print(f"service-agent-python listening on http://{host}:{port}")
    server.serve_forever()


if __name__ == "__main__":
    main()


