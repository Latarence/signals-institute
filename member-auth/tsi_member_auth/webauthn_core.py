"""webauthn_core: relying-party WebAuthn verification (registration and assertion).

STATUS: INTERIM IMPLEMENTATION. The shared vendored copy is being built on the Huntington branch
fix/huntington-webauthn-login-20261030. This module defines the interface TSI codes against and is
complete enough to run and test. When the upstream module is pushed, replace this file with it
(keep the four public functions and the two result types), then re-run member-auth/tests.

Public interface (all binary values are raw bytes unless named *_b64u):
  registration_options(rp_id, rp_name, user_id, user_name, display_name, exclude_ids, challenge) -> dict
  verify_registration(response, expected_challenge, rp_id, origin, require_uv=True) -> RegisteredCredential
  authentication_options(rp_id, challenge, allow_ids=()) -> dict
  verify_authentication(response, expected_challenge, rp_id, origin, public_key_cose, stored_sign_count,
                        require_uv=True) -> int   (the new sign count)
Errors raise WebAuthnError. Attestation is accepted as "none" or any format with the credential
key taken from authenticator data; the Institute relies on user verification, not attestation.
"""
from __future__ import annotations

import base64
import hashlib
import json
import struct
from dataclasses import dataclass
from typing import Any, Sequence

from cryptography.exceptions import InvalidSignature
from cryptography.hazmat.primitives import hashes
from cryptography.hazmat.primitives.asymmetric import ec, padding, rsa


class WebAuthnError(Exception):
    pass


@dataclass(frozen=True)
class RegisteredCredential:
    credential_id: bytes
    public_key_cose: bytes
    sign_count: int


def b64u(b: bytes) -> str:
    return base64.urlsafe_b64encode(b).decode().rstrip("=")


def unb64u(s: str) -> bytes:
    try:
        return base64.urlsafe_b64decode(s + "=" * (-len(s) % 4))
    except Exception as exc:
        raise WebAuthnError("malformed base64url") from exc


# ------------------------------------------------------------------ minimal CBOR (decode only)

def _cbor(data: bytes, i: int = 0) -> tuple[Any, int]:
    if i >= len(data):
        raise WebAuthnError("truncated CBOR")
    ib = data[i]
    major, info = ib >> 5, ib & 31
    i += 1
    if info < 24:
        val = info
    elif info in (24, 25, 26, 27):
        n = {24: 1, 25: 2, 26: 4, 27: 8}[info]
        if i + n > len(data):
            raise WebAuthnError("truncated CBOR")
        val = int.from_bytes(data[i:i + n], "big")
        i += n
    else:
        raise WebAuthnError("unsupported CBOR")
    if major == 0:
        return val, i
    if major == 1:
        return -1 - val, i
    if major in (2, 3):
        if i + val > len(data):
            raise WebAuthnError("truncated CBOR")
        raw = data[i:i + val]
        return (raw if major == 2 else raw.decode()), i + val
    if major == 4:
        out = []
        for _ in range(val):
            item, i = _cbor(data, i)
            out.append(item)
        return out, i
    if major == 5:
        out = {}
        for _ in range(val):
            k, i = _cbor(data, i)
            v, i = _cbor(data, i)
            out[k] = v
        return out, i
    raise WebAuthnError("unsupported CBOR")


def cbor_loads(data: bytes) -> Any:
    val, end = _cbor(data)
    if end != len(data):
        raise WebAuthnError("trailing CBOR bytes")
    return val


# ------------------------------------------------------------------ options

def registration_options(rp_id: str, rp_name: str, user_id: bytes, user_name: str, display_name: str,
                         exclude_ids: Sequence[bytes], challenge: bytes) -> dict:
    return {
        "challenge": b64u(challenge),
        "rp": {"id": rp_id, "name": rp_name},
        "user": {"id": b64u(user_id), "name": user_name, "displayName": display_name},
        "pubKeyCredParams": [{"type": "public-key", "alg": -7}, {"type": "public-key", "alg": -257}],
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


# ------------------------------------------------------------------ verification

def _client_data(response: dict, kind: str, expected_challenge: bytes, origin: str) -> bytes:
    raw = unb64u(response.get("clientDataJSON", ""))
    try:
        cd = json.loads(raw)
    except Exception as exc:
        raise WebAuthnError("malformed clientDataJSON") from exc
    if cd.get("type") != kind:
        raise WebAuthnError("wrong ceremony type")
    if unb64u(cd.get("challenge", "")) != expected_challenge:
        raise WebAuthnError("challenge mismatch")
    if cd.get("origin") != origin:
        raise WebAuthnError("origin mismatch")
    if cd.get("crossOrigin") is True:
        raise WebAuthnError("cross-origin ceremony refused")
    return raw


def client_challenge(response: dict) -> bytes:
    """The challenge the browser signed over, so the server can look it up and consume it."""
    try:
        return unb64u(json.loads(unb64u(response.get("clientDataJSON", ""))).get("challenge", ""))
    except Exception as exc:
        raise WebAuthnError("malformed clientDataJSON") from exc


def _auth_data(ad: bytes, rp_id: str, require_uv: bool) -> tuple[int, int]:
    if len(ad) < 37:
        raise WebAuthnError("authenticator data too short")
    if ad[:32] != hashlib.sha256(rp_id.encode()).digest():
        raise WebAuthnError("rpId hash mismatch")
    flags = ad[32]
    if not flags & 0x01:
        raise WebAuthnError("user presence missing")
    if require_uv and not flags & 0x04:
        raise WebAuthnError("user verification missing")
    return flags, struct.unpack(">I", ad[33:37])[0]


def verify_registration(response: dict, expected_challenge: bytes, rp_id: str, origin: str,
                        require_uv: bool = True) -> RegisteredCredential:
    _client_data(response, "webauthn.create", expected_challenge, origin)
    att = cbor_loads(unb64u(response.get("attestationObject", "")))
    if not isinstance(att, dict) or not isinstance(att.get("authData"), bytes):
        raise WebAuthnError("malformed attestation object")
    ad = att["authData"]
    flags, count = _auth_data(ad, rp_id, require_uv)
    if not flags & 0x40 or len(ad) < 55:
        raise WebAuthnError("no attested credential data")
    cid_len = struct.unpack(">H", ad[53:55])[0]
    cid = ad[55:55 + cid_len]
    if len(cid) != cid_len or cid_len == 0:
        raise WebAuthnError("malformed credential id")
    key, end = _cbor(ad, 55 + cid_len)
    cose = ad[55 + cid_len:end]
    _load_cose(cose)  # must be a supported, well-formed public key
    return RegisteredCredential(cid, cose, count)


def _load_cose(cose: bytes):
    key = cbor_loads(cose)
    if not isinstance(key, dict):
        raise WebAuthnError("malformed COSE key")
    kty, alg = key.get(1), key.get(3)
    try:
        if kty == 2 and alg == -7 and key.get(-1) == 1:
            nums = ec.EllipticCurvePublicNumbers(int.from_bytes(key[-2], "big"), int.from_bytes(key[-3], "big"), ec.SECP256R1())
            return nums.public_key(), "es256"
        if kty == 3 and alg == -257:
            pub = rsa.RSAPublicNumbers(int.from_bytes(key[-2], "big"), int.from_bytes(key[-1], "big")).public_key()
            if pub.key_size < 2048:
                raise WebAuthnError("RSA key too small")
            return pub, "rs256"
    except WebAuthnError:
        raise
    except Exception as exc:
        raise WebAuthnError("malformed COSE key") from exc
    raise WebAuthnError("unsupported credential algorithm")


def verify_authentication(response: dict, expected_challenge: bytes, rp_id: str, origin: str,
                          public_key_cose: bytes, stored_sign_count: int, require_uv: bool = True) -> int:
    raw_cd = _client_data(response, "webauthn.get", expected_challenge, origin)
    ad = unb64u(response.get("authenticatorData", ""))
    _, count = _auth_data(ad, rp_id, require_uv)
    pub, kind = _load_cose(public_key_cose)
    signed = ad + hashlib.sha256(raw_cd).digest()
    sig = unb64u(response.get("signature", ""))
    try:
        if kind == "es256":
            pub.verify(sig, signed, ec.ECDSA(hashes.SHA256()))
        else:
            pub.verify(sig, signed, padding.PKCS1v15(), hashes.SHA256())
    except InvalidSignature as exc:
        raise WebAuthnError("invalid assertion signature") from exc
    if (count or stored_sign_count) and count <= stored_sign_count:
        raise WebAuthnError("sign count did not advance (possible cloned authenticator)")
    return count
