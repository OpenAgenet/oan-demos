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
import secrets
from datetime import UTC, datetime, timedelta
from pathlib import Path
from urllib.parse import urlsplit, urlunsplit
from typing import Any
from urllib.request import Request, urlopen

from cryptography.hazmat.primitives.asymmetric.ed25519 import Ed25519PrivateKey, Ed25519PublicKey


REPO_ROOT = Path(os.environ.get("OAN_DATA_ROOT", Path(__file__).resolve().parents[4].parent / "oan-reference-services")).resolve()
USER_DID_DOCUMENT = REPO_ROOT / "data" / "user-agent" / "did-document.json"
USER_KEYPAIR = REPO_ROOT / "data" / "user-agent" / "keys" / "keypair.json"
USER_CREDENTIAL = REPO_ROOT / "data" / "user-agent" / "credentials" / "user-agent-registration.json"
REGISTRAR_DID_DOCUMENT = REPO_ROOT / "data" / "registrar" / "did-document.json"
DISCOVERY_DID_DOCUMENT = REPO_ROOT / "data" / "discovery" / "did-document.json"
ROOT_DID_DOCUMENT = REPO_ROOT / "data" / "root" / "did-document.json"
ROOT_BULLETIN = REPO_ROOT / "data" / "root" / "bulletin.json"
ROOT_AUTHORIZATION_STATE = REPO_ROOT / "data" / "root" / "authorization-state.json"
DISCOVERY_ENDPOINT = "http://127.0.0.1:8002"
MAX_DISCOVERY_RESPONSE_AGE = timedelta(minutes=5)
AGENT_SERVICE_TYPES = {"AgentService", "OANAgentService"}
ED25519_MODERN_SUITES = {"Ed25519Sha256", "ed25519-sha256"}
ED25519_LEGACY_SUITES = {"Ed25519Sha256Legacy", "ed25519-sha256-legacy"}
ED25519_SUITES = ED25519_MODERN_SUITES | ED25519_LEGACY_SUITES


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
        "proofPurpose": "authentication",
        "proofValue": b64url_encode(private_key.sign(signature_input(unsigned, crypto_suite))),
        "cryptoSuite": crypto_suite,
        "hashAlgorithm": "SHA-256",
        "verificationMethod": keypair["keyId"],
    }
    return {**unsigned, "proof": proof}


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


def verify_root_binding(package: dict[str, Any], root_did_document: dict[str, Any], bulletin: dict[str, Any]) -> None:
    root_proof = package.get("rootProof") or {}
    package_claims = root_proof.get("packageClaims")
    if not isinstance(package_claims, dict) or not package_claims:
        raise ValueError("missing_root_package_claims")
    proof = root_proof.get("proof") or {}
    if not isinstance(proof, dict) or not proof:
        raise ValueError("missing_root_proof")
    package_did = package.get("resourceDid") or package.get("did")
    if package_claims.get("resourceDid") != package_did:
        raise ValueError("root_package_subject_mismatch")
    if package_claims.get("didDocumentHash") != package.get("didDocumentHash"):
        raise ValueError("root_package_did_document_hash_mismatch")
    if package_claims.get("metadataHash") != package.get("metadataHash"):
        raise ValueError("root_package_metadata_hash_mismatch")
    verify_proof_payload(package_claims, proof, root_did_document)


def value_without_sha256_prefix(value: Any) -> str:
    text = str(value or "")
    return text[len("sha256:"):] if text.startswith("sha256:") else text


def credential_type_set(credential: dict[str, Any]) -> set[str]:
    credential_type = credential.get("type")
    if isinstance(credential_type, list):
        return {str(item) for item in credential_type}
    if credential_type:
        return {str(credential_type)}
    return set()


def verify_service_registration_credential(
    credential: dict[str, Any],
    package: dict[str, Any],
    registrar_did_document: dict[str, Any],
) -> dict[str, Any]:
    if "OANResourceRegistrationCredential" not in credential_type_set(credential):
        raise ValueError("service_registration_credential_type_invalid")
    if credential.get("issuer") != registrar_did_document.get("id"):
        raise ValueError("service_registration_credential_issuer_mismatch")
    if not verify_signed_value(credential, registrar_did_document):
        raise ValueError("service_registration_credential_signature_invalid")

    status = credential.get("credentialStatus") or {}
    if isinstance(status, dict) and status.get("status") != "active":
        raise ValueError("service_registration_credential_not_active")

    subject = credential.get("credentialSubject")
    if not isinstance(subject, dict):
        raise ValueError("service_registration_credential_subject_missing")
    package_did = package.get("resourceDid") or package.get("did")
    if subject.get("id") != package_did or subject.get("resourceDid") != package_did:
        raise ValueError("service_registration_credential_subject_mismatch")
    if subject.get("resourceType") != package.get("resourceType"):
        raise ValueError("service_registration_credential_resource_type_mismatch")

    package_did_document_hash = value_without_sha256_prefix(
        package.get("didDocumentHash")
        or hashlib.sha256(canonical_json(package.get("didDocument", {})).encode("utf-8")).hexdigest()
    )
    if value_without_sha256_prefix(subject.get("didDocumentHash")) != package_did_document_hash:
        raise ValueError("service_registration_credential_did_document_hash_mismatch")
    package_metadata_hash = package.get("metadataHash")
    if package_metadata_hash and value_without_sha256_prefix(subject.get("metadataHash")) != value_without_sha256_prefix(package_metadata_hash):
        raise ValueError("service_registration_credential_metadata_hash_mismatch")

    return {
        "type": sorted(credential_type_set(credential)),
        "issuer": credential.get("issuer"),
        "subject": package_did,
    }


def verify_discovery_response(discovery_response: dict[str, Any]) -> dict[str, Any]:
    discovery_did_document = load_json(DISCOVERY_DID_DOCUMENT)
    root_did_document = load_json(ROOT_DID_DOCUMENT)
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
    return {
        "discoveryDidDocument": discovery_did_document,
        "rootDidDocument": root_did_document,
        "bulletin": bulletin,
    }


def fetch_verified_candidate_package(target_did: str) -> dict[str, Any]:
    detail = get_json(f"{DISCOVERY_ENDPOINT}/discovery/index/resources/{target_did}")
    package = detail.get("package")
    if not isinstance(package, dict):
        raise ValueError("candidate_package_missing")
    return package


def ensure_candidate_matches_verified_package(candidate: dict[str, Any], package: dict[str, Any]) -> dict[str, Any]:
    candidate_did = candidate.get("resourceDid") or candidate.get("did")
    package_did = package.get("resourceDid") or package.get("did")
    if candidate_did != package_did:
        raise ValueError("candidate_did_mismatch")
    services = package.get("didDocument", {}).get("service", [])
    if not isinstance(services, list):
        raise ValueError("candidate_service_material_missing")
    agent_service = next((item for item in services if item.get("type") in AGENT_SERVICE_TYPES), None)
    if not isinstance(agent_service, dict):
        raise ValueError("candidate_agent_service_missing")
    candidate_endpoints = {
        str(item.get("serviceEndpoint"))
        for item in (candidate.get("services") or [])
        if isinstance(item, dict)
    }
    if agent_service.get("serviceEndpoint") not in candidate_endpoints:
        raise ValueError("candidate_service_endpoint_mismatch")
    return agent_service


def post_json(url: str, payload: dict[str, Any]) -> dict[str, Any]:
    request = Request(
        url,
        data=json.dumps(payload).encode("utf-8"),
        headers={"content-type": "application/json"},
        method="POST",
    )
    with urlopen(request, timeout=10) as response:
        return json.loads(response.read().decode("utf-8"))


def get_json(url: str) -> dict[str, Any]:
    with urlopen(url, timeout=10) as response:
        return json.loads(response.read().decode("utf-8"))


def build_invocation(target_did: str, discovery_response: dict[str, Any]) -> dict[str, Any]:
    user_did_document = load_json(USER_DID_DOCUMENT)
    body = {
        "message": "hello from OAN User Agent",
        "purpose": "trusted-agent-hello",
    }
    invocation = {
        "type": "OANTrustedInvocation",
        "callerDid": user_did_document["id"],
        "targetDid": target_did,
        "nonce": secrets.token_urlsafe(24),
        "timestamp": datetime.now(UTC).isoformat().replace("+00:00", "Z"),
        "body": body,
        "bodyHash": hashlib.sha256(canonical_json(body).encode("utf-8")).hexdigest(),
        "callerDidDocument": user_did_document,
        "credentials": [load_json(USER_CREDENTIAL)],
        "discoveryResponse": discovery_response,
    }
    return sign_value(invocation, load_json(USER_KEYPAIR))


def endpoint_base(service_endpoint: str) -> str:
    parsed = urlsplit(service_endpoint)
    path = parsed.path.rstrip("/")
    if path.endswith("/invoke"):
        path = path[: -len("/invoke")]
    return urlunsplit((parsed.scheme, parsed.netloc, path, "", "")).rstrip("/")


def main() -> None:
    user_did_document = load_json(USER_DID_DOCUMENT)
    query = {
        "capabilityTags": ["gbt4754-2017.01"],
        "resourceType": "agent_service",
        "protocol": "http",
        "limit": 1,
    }
    discovery_response = post_json(f"{DISCOVERY_ENDPOINT}/discovery/resources/query", query)
    verification_material = verify_discovery_response(discovery_response)
    candidates = discovery_response.get("candidates", [])
    if not candidates:
        raise SystemExit("No Service Agent candidate returned by Discovery.")

    candidate = candidates[0]
    target_did = candidate.get("resourceDid") or candidate.get("did")
    package = fetch_verified_candidate_package(target_did)
    verify_root_binding(package, verification_material["rootDidDocument"], verification_material["bulletin"])
    service = ensure_candidate_matches_verified_package(candidate, package)
    service_base = endpoint_base(service["serviceEndpoint"])
    profile = get_json(f"{service_base}/profile")
    invocation = build_invocation(target_did, discovery_response)
    hello = post_json(f"{service_base}/hello", invocation)
    response_signature_verified = verify_signed_value(hello, package["didDocument"])
    verification = hello.get("verification", {})
    service_credentials = [
        credential for credential in hello.get("credentials", [])
        if isinstance(credential, dict)
        and "OANResourceRegistrationCredential" in credential_type_set(credential)
    ]
    if not service_credentials:
        raise ValueError("missing_service_registration_credential")
    service_registration_credential_check = verify_service_registration_credential(
        service_credentials[0],
        package,
        load_json(REGISTRAR_DID_DOCUMENT),
    )
    deployment = hello.get("serviceAgent", {}).get("deployment", {})
    provenance_verified = (
        deployment.get("deployer")
        == "China Academy of Information and Communications Technology (CAICT)"
        and deployment.get("author") == "JINLIANG XU"
        and "xujinliang@caict.ac.cn" in deployment.get("email", [])
        and "jlxufly@gmail.com" in deployment.get("email", [])
    )

    print(json.dumps({
        "demo": "trusted-agent-hello",
        "userAgentDid": user_did_document["id"],
        "discoveryDid": discovery_response.get("discoveryDid"),
        "discoveryProof": discovery_response.get("proof"),
        "selectedServiceAgent": profile,
        "invocation": {
            "type": invocation["type"],
            "callerDid": invocation["callerDid"],
            "targetDid": invocation["targetDid"],
            "nonce": invocation["nonce"],
            "timestamp": invocation["timestamp"],
            "credentialTypes": [credential.get("type") for credential in invocation["credentials"]],
            "requestSignature": invocation["proof"],
            "discoveryResponseProof": (invocation.get("discoveryResponse") or {}).get("proof"),
        },
        "helloResponse": hello,
        "checks": {
            "requestSignatureVerifiedByServiceAgent": verification.get("requestSignatureVerified") is True,
            "userCredentialVerifiedByServiceAgent": verification.get("userCredentialVerified") is True,
            "responseSignatureVerifiedByUserAgent": response_signature_verified,
            "serviceRegistrationCredentialVerifiedByUserAgent": True,
            "provenanceVerified": provenance_verified,
        },
        "serviceRegistrationCredential": service_registration_credential_check,
        "provenance": deployment,
    }, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()


