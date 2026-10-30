"""Thin adapter: the call surface tsi_member_auth/service.py was written against, backed by the canonical
`webauthn_core.py` (vendored verbatim from Huntington branch fix/huntington-webauthn-login-20261030, commit
7be802c8, file backend/huntington/auth/webauthn_core.py). Do NOT edit webauthn_core.py here; fix it upstream
and re-vendor (its sha256 must match upstream).

What changes versus the interim core: attestation statements are verified (none, packed, fido-u2f), EdDSA keys are
accepted, sign-count rollback is enforced inside the core, challenge compare is constant time. Options builders
stay here because the core intentionally has none.
"""
from __future__ import annotations

import json
from dataclasses import dataclass
from typing import Sequence

from . import webauthn_core as core
from .webauthn_core import WebAuthnError

b64u = core.b64url_encode
unb64u = core.b64url_decode


@dataclass(frozen=True)
class RegisteredCredential:
    credential_id: bytes
    public_key_cose: bytes
    sign_count: int


def cbor_loads(data: bytes):
    return core.cbor_decode(data)


def registration_options(rp_id: str, rp_name: str, user_id: bytes, user_name: str, display_name: str,
                         exclude_ids: Sequence[bytes], challenge: bytes) -> dict:
    return {
        "challenge": b64u(challenge),
        "rp": {"id": rp_id, "name": rp_name},
        "user": {"id": b64u(user_id), "name": user_name, "displayName": display_name},
        "pubKeyCredParams": [{"type": "public-key", "alg": core.ALG_ES256}, {"type": "public-key", "alg": core.ALG_RS256}],
        "excludeCredentials": [{"type": "public-key", "id": b64u(c)} for c in exclude_ids],
        "authenticatorSelection": {"residentKey": "required", "requireResidentKey": True, "userVerification": "required"},
        "attestation": "none",
        "timeout": 120000,
    }


def authentication_options(rp_id: str, challenge: bytes, allow_ids: Sequence[bytes] = ()) -> dict:
    return {
        "challenge": b64u(challenge),
        "rpId": rp_id,
        "allowCredentials": [{"type": "public-key", "id": b64u(c)} for c in allow_ids],
        "userVerification": "required",
        "timeout": 120000,
    }


def client_challenge(response: dict) -> bytes:
    """The challenge the browser signed over, so the server can look it up and consume it."""
    try:
        return unb64u(json.loads(unb64u(response.get("clientDataJSON", ""))).get("challenge", ""))
    except WebAuthnError:
        raise
    except Exception as exc:
        raise WebAuthnError("bad_client_data", "malformed clientDataJSON") from exc


def verify_registration(response: dict, expected_challenge: bytes, rp_id: str, origin: str,
                        require_uv: bool = True) -> RegisteredCredential:
    res = core.verify_registration(
        client_data_json=unb64u(response.get("clientDataJSON", "")),
        attestation_object=unb64u(response.get("attestationObject", "")),
        expected_challenge=expected_challenge, origins=origin, rp_id=rp_id, require_user_verification=require_uv)
    return RegisteredCredential(res.credential_id, res.public_key_cose, res.sign_count)


def verify_authentication(response: dict, expected_challenge: bytes, rp_id: str, origin: str,
                          public_key_cose: bytes, stored_sign_count: int, require_uv: bool = True) -> int:
    res = core.verify_assertion(
        client_data_json=unb64u(response.get("clientDataJSON", "")),
        authenticator_data=unb64u(response.get("authenticatorData", "")),
        signature=unb64u(response.get("signature", "")),
        public_key_cose=public_key_cose, expected_challenge=expected_challenge, origins=origin, rp_id=rp_id,
        stored_sign_count=stored_sign_count, require_user_verification=require_uv)
    return res.new_sign_count
