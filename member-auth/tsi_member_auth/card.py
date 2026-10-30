"""Card path: certificate policy for the Institute's member card (Chief card bridge).

The browser side is window.chiefCardBridge.sign(challenge) which returns
{ card_id, certificate_pem, signature }; the signature is RSA-PSS/SHA-256 over "challenge:card_id".
Every check fails closed: missing CA, missing CRL, unknown revocation state all deny.
"""
from __future__ import annotations

import base64
import os
import urllib.request
from datetime import datetime, timezone
from typing import Callable, Optional

from cryptography import x509
from cryptography.exceptions import InvalidSignature
from cryptography.hazmat.primitives import hashes
from cryptography.hazmat.primitives.asymmetric import ec, padding, rsa


def load_ca() -> Optional[x509.Certificate]:
    path = os.getenv("TSI_CA_PEM")
    if not path or not os.path.exists(path):
        return None
    return x509.load_pem_x509_certificate(open(path, "rb").read())


def chain_ok(cert: x509.Certificate, ca: Optional[x509.Certificate]) -> bool:
    if ca is None or cert.issuer != ca.subject:
        return False
    try:
        pub = ca.public_key()
        if isinstance(pub, rsa.RSAPublicKey):
            pub.verify(cert.signature, cert.tbs_certificate_bytes, padding.PKCS1v15(), cert.signature_hash_algorithm)
        elif isinstance(pub, ec.EllipticCurvePublicKey):
            pub.verify(cert.signature, cert.tbs_certificate_bytes, ec.ECDSA(cert.signature_hash_algorithm))
        else:
            return False
        return True
    except InvalidSignature:
        return False


def current(cert: x509.Certificate) -> bool:
    return cert.not_valid_before_utc <= datetime.now(timezone.utc) <= cert.not_valid_after_utc


def fetch_crl_bytes() -> Optional[bytes]:
    path = os.getenv("TSI_CRL_PATH")
    if path and os.path.exists(path):
        return open(path, "rb").read()
    url = os.getenv("TSI_CRL_URL")
    if url:
        try:
            with urllib.request.urlopen(url, timeout=10) as r:  # noqa: S310 (operator-configured URL)
                return r.read()
        except Exception:
            return None
    return None


def revocation_ok(cert: x509.Certificate, ca: x509.Certificate,
                  fetch: Callable[[], Optional[bytes]] = fetch_crl_bytes) -> bool:
    data = fetch()
    if not data:
        return False
    try:
        crl = x509.load_pem_x509_crl(data) if data.lstrip().startswith(b"-----BEGIN") else x509.load_der_x509_crl(data)
        if crl.issuer != ca.subject or not crl.is_signature_valid(ca.public_key()):
            return False
        return crl.get_revoked_certificate_by_serial_number(cert.serial_number) is None
    except Exception:
        return False


def signature_ok(cert: x509.Certificate, challenge: str, card_id: str, signature_b64: str) -> bool:
    pub = cert.public_key()
    if not isinstance(pub, rsa.RSAPublicKey) or pub.key_size < 2048:
        return False
    try:
        pub.verify(base64.b64decode(signature_b64), f"{challenge}:{card_id}".encode(),
                   padding.PSS(mgf=padding.MGF1(hashes.SHA256()), salt_length=padding.PSS.MAX_LENGTH), hashes.SHA256())
        return True
    except Exception:
        return False
