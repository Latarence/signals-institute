"""
webauthn_core: a small, dependency-light WebAuthn Level 2 relying-party verifier.

Standalone on purpose: the only third-party dependency is `cryptography`. No framework,
database, cache or logging imports, so Huntington, Ridgefield member-auth and The Signals
Institute can vendor this single file unchanged.

What it verifies (WebAuthn L2, sections 7.1 registration and 7.2 assertion):
  * clientDataJSON: type, challenge (constant time), origin (allow-list), crossOrigin
  * authenticatorData: rpIdHash == SHA-256(rp_id), UP flag, optional UV flag, AT flag
  * registration: attested credential data, COSE public key (ES256, RS256, EdDSA),
    attestation formats "none", "packed" (x5c and self) and "fido-u2f"; the attestation
    signature is checked against the attested credential, so a public certificate cannot
    be replayed with an attacker's own key
  * assertion: signature over authenticatorData || SHA-256(clientDataJSON) with the stored
    public key, and sign-count rollback detection (cloned authenticator signal)

What it does NOT do (caller's job): challenge storage and single-use consumption, mapping
a credential to a user, rate limiting, trust-anchor/chain validation of attestation
certificates (x5c is returned so the caller can apply its own CA policy), persistence.

Public API:
    verify_registration(...)  -> RegistrationResult
    verify_assertion(...)     -> AssertionResult
    parse_cose_key(cose)      -> public key object
    b64url_encode / b64url_decode
    WebAuthnError(code, message)
"""
from __future__ import annotations

import base64
import hashlib
import hmac
import json
import struct
from dataclasses import dataclass, field
from typing import Any, Iterable, List, Optional, Sequence, Tuple, Union

from cryptography import x509
from cryptography.exceptions import InvalidSignature
from cryptography.hazmat.primitives import hashes
from cryptography.hazmat.primitives.asymmetric import ec, ed25519, padding, rsa

__all__ = [
    "WebAuthnError", "RegistrationResult", "AssertionResult",
    "verify_registration", "verify_assertion", "parse_cose_key", "parse_authenticator_data",
    "b64url_encode", "b64url_decode", "ALG_ES256", "ALG_RS256", "ALG_EDDSA",
]

ALG_ES256 = -7
ALG_EDDSA = -8
ALG_RS256 = -257
DEFAULT_ALGS: Tuple[int, ...] = (ALG_ES256, ALG_RS256, ALG_EDDSA)

FLAG_UP = 0x01
FLAG_UV = 0x04
FLAG_BE = 0x08
FLAG_BS = 0x10
FLAG_AT = 0x40
FLAG_ED = 0x80


class WebAuthnError(Exception):
    """Verification failure. `code` is stable and machine-readable; never include secrets."""

    def __init__(self, code: str, message: str = ""):
        super().__init__(f"{code}: {message}" if message else code)
        self.code = code
        self.message = message or code


# --------------------------------------------------------------------------- base64url

def b64url_encode(data: bytes) -> str:
    return base64.urlsafe_b64encode(data).decode("ascii").rstrip("=")


def b64url_decode(value: Union[str, bytes]) -> bytes:
    if isinstance(value, bytes):
        value = value.decode("ascii", "strict")
    try:
        return base64.urlsafe_b64decode(value + "=" * (-len(value) % 4))
    except Exception as exc:  # binascii.Error, ValueError
        raise WebAuthnError("bad_encoding", "invalid base64url") from exc


# --------------------------------------------------------------------------- minimal CBOR

class _CBORError(WebAuthnError):
    def __init__(self, message: str):
        super().__init__("bad_cbor", message)


_MAX_DEPTH = 16


def _cbor_decode(data: bytes, pos: int = 0, depth: int = 0) -> Tuple[Any, int]:
    """Decode one CBOR item (RFC 8949) starting at pos. Returns (value, new_pos).
    Supports what WebAuthn uses: ints, byte/text strings, arrays, maps, bool/null, tags."""
    if depth > _MAX_DEPTH:
        raise _CBORError("nesting too deep")
    if pos >= len(data):
        raise _CBORError("truncated")
    ib = data[pos]
    major, info = ib >> 5, ib & 0x1F
    pos += 1
    if info < 24:
        arg = info
    elif info in (24, 25, 26, 27):
        n = 1 << (info - 24)
        if pos + n > len(data):
            raise _CBORError("truncated")
        arg = int.from_bytes(data[pos:pos + n], "big")
        pos += n
    else:
        raise _CBORError("indefinite length / reserved not supported")

    if major == 0:
        return arg, pos
    if major == 1:
        return -1 - arg, pos
    if major in (2, 3):
        if pos + arg > len(data):
            raise _CBORError("truncated string")
        raw = bytes(data[pos:pos + arg])
        pos += arg
        if major == 2:
            return raw, pos
        try:
            return raw.decode("utf-8"), pos
        except UnicodeDecodeError as exc:
            raise _CBORError("bad utf-8") from exc
    if major == 4:
        if arg > len(data):
            raise _CBORError("array too long")
        out: List[Any] = []
        for _ in range(arg):
            item, pos = _cbor_decode(data, pos, depth + 1)
            out.append(item)
        return out, pos
    if major == 5:
        if arg > len(data):
            raise _CBORError("map too long")
        m: dict = {}
        for _ in range(arg):
            k, pos = _cbor_decode(data, pos, depth + 1)
            v, pos = _cbor_decode(data, pos, depth + 1)
            try:
                if k in m:
                    raise _CBORError("duplicate map key")
                m[k] = v
            except TypeError as exc:
                raise _CBORError("unhashable map key") from exc
        return m, pos
    if major == 6:  # tag: ignore the tag, return the content
        return _cbor_decode(data, pos, depth + 1)
    # major 7
    if info == 20:
        return False, pos
    if info == 21:
        return True, pos
    if info == 22:
        return None, pos
    raise _CBORError("unsupported simple/float value")


def cbor_decode(data: bytes) -> Any:
    """Decode exactly one CBOR item that spans all of `data`."""
    value, end = _cbor_decode(data, 0)
    if end != len(data):
        raise _CBORError("trailing bytes")
    return value


# --------------------------------------------------------------------------- COSE keys

def parse_cose_key(cose: bytes, allowed_algs: Sequence[int] = DEFAULT_ALGS):
    """Return (alg, public_key_object) for a COSE_Key. Rejects anything not in allowed_algs."""
    key, end = _cbor_decode(cose, 0)
    if end != len(cose):
        raise WebAuthnError("bad_public_key", "trailing bytes after COSE key")
    return _cose_map_to_key(key, allowed_algs)


def _cose_map_to_key(key: Any, allowed_algs: Sequence[int]):
    if not isinstance(key, dict):
        raise WebAuthnError("bad_public_key", "COSE key is not a map")
    kty, alg = key.get(1), key.get(3)
    if alg not in allowed_algs:
        raise WebAuthnError("unsupported_alg", f"alg {alg} not allowed")
    try:
        if kty == 2 and alg == ALG_ES256:
            if key.get(-1) != 1:
                raise WebAuthnError("bad_public_key", "ES256 requires P-256")
            x, y = key[-2], key[-3]
            if len(x) != 32 or len(y) != 32:
                raise WebAuthnError("bad_public_key", "bad EC coordinate length")
            pub = ec.EllipticCurvePublicNumbers(
                int.from_bytes(x, "big"), int.from_bytes(y, "big"), ec.SECP256R1()
            ).public_key()
            return alg, pub
        if kty == 3 and alg == ALG_RS256:
            n, e = key[-1], key[-2]
            if len(n) < 256:  # >= 2048 bits
                raise WebAuthnError("bad_public_key", "RSA key shorter than 2048 bits")
            pub = rsa.RSAPublicNumbers(int.from_bytes(e, "big"), int.from_bytes(n, "big")).public_key()
            return alg, pub
        if kty == 1 and alg == ALG_EDDSA:
            if key.get(-1) != 6 or len(key[-2]) != 32:
                raise WebAuthnError("bad_public_key", "EdDSA requires Ed25519")
            return alg, ed25519.Ed25519PublicKey.from_public_bytes(key[-2])
    except WebAuthnError:
        raise
    except Exception as exc:  # KeyError, ValueError (point not on curve), TypeError
        raise WebAuthnError("bad_public_key", "malformed COSE key") from exc
    raise WebAuthnError("bad_public_key", "kty/alg combination not supported")


def _verify_sig(alg: int, public_key, signature: bytes, message: bytes) -> bool:
    try:
        if alg == ALG_ES256:
            public_key.verify(signature, message, ec.ECDSA(hashes.SHA256()))
        elif alg == ALG_RS256:
            public_key.verify(signature, message, padding.PKCS1v15(), hashes.SHA256())
        elif alg == ALG_EDDSA:
            public_key.verify(signature, message)
        else:
            return False
        return True
    except (InvalidSignature, ValueError, TypeError):
        return False


# --------------------------------------------------------------------------- authenticatorData

@dataclass
class AuthenticatorData:
    rp_id_hash: bytes
    flags: int
    sign_count: int
    aaguid: Optional[bytes] = None
    credential_id: Optional[bytes] = None
    cose_key_raw: Optional[bytes] = None
    cose_key: Any = None

    @property
    def user_present(self) -> bool:
        return bool(self.flags & FLAG_UP)

    @property
    def user_verified(self) -> bool:
        return bool(self.flags & FLAG_UV)

    @property
    def backup_eligible(self) -> bool:
        return bool(self.flags & FLAG_BE)

    @property
    def backup_state(self) -> bool:
        return bool(self.flags & FLAG_BS)


def parse_authenticator_data(auth_data: bytes, expect_attested: bool = False) -> AuthenticatorData:
    if len(auth_data) < 37:
        raise WebAuthnError("bad_authenticator_data", "shorter than 37 bytes")
    rp_hash = bytes(auth_data[:32])
    flags = auth_data[32]
    (counter,) = struct.unpack(">I", auth_data[33:37])
    ad = AuthenticatorData(rp_id_hash=rp_hash, flags=flags, sign_count=counter)
    pos = 37
    if flags & FLAG_AT:
        if len(auth_data) < pos + 18:
            raise WebAuthnError("bad_authenticator_data", "truncated attested credential data")
        ad.aaguid = bytes(auth_data[pos:pos + 16])
        (cred_len,) = struct.unpack(">H", auth_data[pos + 16:pos + 18])
        pos += 18
        if cred_len == 0 or cred_len > 1023 or len(auth_data) < pos + cred_len:
            raise WebAuthnError("bad_authenticator_data", "bad credential id length")
        ad.credential_id = bytes(auth_data[pos:pos + cred_len])
        pos += cred_len
        key, end = _cbor_decode(auth_data, pos)
        ad.cose_key = key
        ad.cose_key_raw = bytes(auth_data[pos:end])
        pos = end
    elif expect_attested:
        raise WebAuthnError("no_attested_credential", "AT flag not set")
    if flags & FLAG_ED:
        _, pos = _cbor_decode(auth_data, pos)  # extensions map: parsed for structure only
    if pos != len(auth_data):
        raise WebAuthnError("bad_authenticator_data", "trailing bytes")
    return ad


# --------------------------------------------------------------------------- shared checks

def _norm_origins(origins: Union[str, Iterable[str]]) -> List[str]:
    return [origins] if isinstance(origins, str) else list(origins)


def _check_client_data(
    client_data_json: bytes, expected_type: str, expected_challenge: Union[str, bytes],
    origins: Union[str, Iterable[str]],
) -> dict:
    try:
        cd = json.loads(client_data_json.decode("utf-8"))
    except Exception as exc:
        raise WebAuthnError("bad_client_data", "not valid JSON") from exc
    if not isinstance(cd, dict):
        raise WebAuthnError("bad_client_data", "not an object")
    if cd.get("type") != expected_type:
        raise WebAuthnError("bad_type", f"expected {expected_type}")
    got = cd.get("challenge")
    if isinstance(expected_challenge, bytes):
        expected_challenge = b64url_encode(expected_challenge)
    if not isinstance(got, str) or not hmac.compare_digest(got.encode(), expected_challenge.encode()):
        raise WebAuthnError("challenge_mismatch", "challenge does not match")
    if cd.get("origin") not in _norm_origins(origins):
        raise WebAuthnError("origin_mismatch", "origin not allowed")
    if cd.get("crossOrigin") is True:
        raise WebAuthnError("cross_origin", "cross-origin ceremony refused")
    return cd


def _check_auth_data_common(ad: AuthenticatorData, rp_id: str, require_uv: bool) -> None:
    if not hmac.compare_digest(ad.rp_id_hash, hashlib.sha256(rp_id.encode("utf-8")).digest()):
        raise WebAuthnError("rp_id_mismatch", "rpIdHash does not match")
    if not ad.user_present:
        raise WebAuthnError("user_not_present", "UP flag not set")
    if require_uv and not ad.user_verified:
        raise WebAuthnError("user_not_verified", "UV flag not set")


# --------------------------------------------------------------------------- registration

@dataclass
class RegistrationResult:
    credential_id: bytes
    public_key_cose: bytes          # store this as credential_public_key
    alg: int
    sign_count: int
    aaguid: str                     # hex
    fmt: str
    attestation_type: str           # "none" | "self" | "basic"
    x5c: List[bytes] = field(default_factory=list)  # DER certs, leaf first; caller applies CA policy
    user_verified: bool = False
    backup_eligible: bool = False
    backup_state: bool = False

    @property
    def credential_id_b64(self) -> str:
        return b64url_encode(self.credential_id)


def verify_registration(
    *,
    client_data_json: bytes,
    attestation_object: bytes,
    expected_challenge: Union[str, bytes],
    origins: Union[str, Iterable[str]],
    rp_id: str,
    require_user_verification: bool = False,
    allowed_algs: Sequence[int] = DEFAULT_ALGS,
    allowed_formats: Sequence[str] = ("none", "packed", "fido-u2f"),
    expected_credential_id: Optional[bytes] = None,
) -> RegistrationResult:
    _check_client_data(client_data_json, "webauthn.create", expected_challenge, origins)
    att = cbor_decode(attestation_object)
    if not isinstance(att, dict):
        raise WebAuthnError("bad_attestation", "attestation object is not a map")
    fmt, stmt, auth_data = att.get("fmt"), att.get("attStmt"), att.get("authData")
    if not isinstance(fmt, str) or not isinstance(stmt, dict) or not isinstance(auth_data, bytes):
        raise WebAuthnError("bad_attestation", "missing fmt/attStmt/authData")
    if fmt not in allowed_formats:
        raise WebAuthnError("unsupported_attestation", f"format {fmt!r} not allowed")

    ad = parse_authenticator_data(auth_data, expect_attested=True)
    _check_auth_data_common(ad, rp_id, require_user_verification)
    if expected_credential_id is not None and not hmac.compare_digest(ad.credential_id, expected_credential_id):
        raise WebAuthnError("credential_id_mismatch", "credential id differs from attested id")
    alg, cred_pub = _cose_map_to_key(ad.cose_key, allowed_algs)
    cd_hash = hashlib.sha256(client_data_json).digest()
    signed = auth_data + cd_hash

    x5c: List[bytes] = []
    if fmt == "none":
        if stmt:
            raise WebAuthnError("bad_attestation", "none attestation must have empty attStmt")
        att_type = "none"
    elif fmt == "packed":
        sig = stmt.get("sig")
        stmt_alg = stmt.get("alg")
        if not isinstance(sig, bytes) or stmt_alg not in allowed_algs:
            raise WebAuthnError("bad_attestation", "packed attStmt needs sig and allowed alg")
        if "x5c" in stmt:
            x5c = _load_x5c(stmt["x5c"])
            leaf = x509.load_der_x509_certificate(x5c[0])
            if not _verify_sig(stmt_alg, leaf.public_key(), sig, signed):
                raise WebAuthnError("attestation_signature_invalid", "packed x5c signature invalid")
            att_type = "basic"
        else:
            if stmt_alg != alg:
                raise WebAuthnError("bad_attestation", "self attestation alg must match credential alg")
            if not _verify_sig(alg, cred_pub, sig, signed):
                raise WebAuthnError("attestation_signature_invalid", "packed self signature invalid")
            att_type = "self"
    else:  # fido-u2f
        sig = stmt.get("sig")
        if not isinstance(sig, bytes) or alg != ALG_ES256:
            raise WebAuthnError("bad_attestation", "fido-u2f needs ES256 credential and sig")
        x5c = _load_x5c(stmt.get("x5c"))
        if len(x5c) != 1:
            raise WebAuthnError("bad_attestation", "fido-u2f requires exactly one certificate")
        leaf = x509.load_der_x509_certificate(x5c[0])
        c = ad.cose_key
        raw_point = b"\x04" + c[-2] + c[-3]
        u2f_signed = b"\x00" + ad.rp_id_hash + cd_hash + ad.credential_id + raw_point
        if not _verify_sig(ALG_ES256, leaf.public_key(), sig, u2f_signed):
            raise WebAuthnError("attestation_signature_invalid", "fido-u2f signature invalid")
        att_type = "basic"

    return RegistrationResult(
        credential_id=ad.credential_id, public_key_cose=ad.cose_key_raw, alg=alg,
        sign_count=ad.sign_count, aaguid=ad.aaguid.hex(), fmt=fmt, attestation_type=att_type,
        x5c=x5c, user_verified=ad.user_verified, backup_eligible=ad.backup_eligible,
        backup_state=ad.backup_state,
    )


def _load_x5c(raw: Any) -> List[bytes]:
    if not isinstance(raw, list) or not raw or not all(isinstance(c, bytes) for c in raw):
        raise WebAuthnError("bad_attestation", "x5c must be a non-empty list of certificates")
    try:
        x509.load_der_x509_certificate(raw[0])
    except Exception as exc:
        raise WebAuthnError("bad_attestation", "x5c leaf is not a certificate") from exc
    return [bytes(c) for c in raw]


# --------------------------------------------------------------------------- assertion

@dataclass
class AssertionResult:
    new_sign_count: int
    user_verified: bool
    backup_state: bool
    counter_supported: bool         # False when both stored and new counters are 0


def verify_assertion(
    *,
    client_data_json: bytes,
    authenticator_data: bytes,
    signature: bytes,
    public_key_cose: bytes,
    expected_challenge: Union[str, bytes],
    origins: Union[str, Iterable[str]],
    rp_id: str,
    stored_sign_count: int,
    require_user_verification: bool = False,
    allowed_algs: Sequence[int] = DEFAULT_ALGS,
) -> AssertionResult:
    if not public_key_cose:
        raise WebAuthnError("no_public_key", "credential has no stored public key; re-enroll")
    _check_client_data(client_data_json, "webauthn.get", expected_challenge, origins)
    ad = parse_authenticator_data(authenticator_data)
    _check_auth_data_common(ad, rp_id, require_user_verification)
    alg, pub = parse_cose_key(public_key_cose, allowed_algs)
    signed = authenticator_data + hashlib.sha256(client_data_json).digest()
    if not _verify_sig(alg, pub, signature, signed):
        raise WebAuthnError("signature_invalid", "assertion signature invalid")
    # Counter check only after the signature is proven authentic.
    if ad.sign_count != 0 or stored_sign_count != 0:
        if ad.sign_count <= stored_sign_count:
            raise WebAuthnError("counter_rollback",
                                "sign count did not increase (possible cloned authenticator)")
    return AssertionResult(
        new_sign_count=ad.sign_count, user_verified=ad.user_verified, backup_state=ad.backup_state,
        counter_supported=bool(ad.sign_count or stored_sign_count),
    )
