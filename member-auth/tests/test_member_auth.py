import base64
import hashlib
import json
import struct
from datetime import datetime, timedelta, timezone

import pytest
from cryptography import x509
from cryptography.hazmat.primitives import hashes, serialization
from cryptography.hazmat.primitives.asymmetric import ec, padding, rsa
from cryptography.x509.oid import NameOID
from fastapi.testclient import TestClient

from tsi_member_auth import admin, webauthn_core as wa
from tsi_member_auth.service import create_app
from tsi_member_auth.store import Store

RP, ORIGIN = "thesignalsinstitute.com", "https://thesignalsinstitute.com"


# ---------------------------------------------------------------- software authenticator
def cbor(o):
    def head(major, n):
        if n < 24: return bytes([major << 5 | n])
        if n < 256: return bytes([major << 5 | 24, n])
        if n < 65536: return bytes([major << 5 | 25]) + n.to_bytes(2, "big")
        return bytes([major << 5 | 26]) + n.to_bytes(4, "big")
    if isinstance(o, bool): raise TypeError
    if isinstance(o, int): return head(0, o) if o >= 0 else head(1, -1 - o)
    if isinstance(o, bytes): return head(2, len(o)) + o
    if isinstance(o, str): return head(3, len(o.encode())) + o.encode()
    if isinstance(o, dict): return head(5, len(o)) + b"".join(cbor(k) + cbor(v) for k, v in o.items())
    raise TypeError(o)


class Authn:
    def __init__(self, uv=True):
        self.key = ec.generate_private_key(ec.SECP256R1())
        self.cid = hashlib.sha256(str(id(self)).encode() + struct.pack(">d", datetime.now().timestamp())).digest()
        self.count, self.uv = 0, uv

    def cose(self):
        n = self.key.public_key().public_numbers()
        return cbor({1: 2, 3: -7, -1: 1, -2: n.x.to_bytes(32, "big"), -3: n.y.to_bytes(32, "big")})

    def _flags(self, at=False):
        return 0x01 | (0x04 if self.uv else 0) | (0x40 if at else 0)

    def create(self, challenge_b64u, origin=ORIGIN):
        cd = json.dumps({"type": "webauthn.create", "challenge": challenge_b64u, "origin": origin}).encode()
        ad = hashlib.sha256(RP.encode()).digest() + bytes([self._flags(True)]) + struct.pack(">I", 0) \
            + b"\0" * 16 + struct.pack(">H", len(self.cid)) + self.cid + self.cose()
        att = cbor({"fmt": "none", "attStmt": {}, "authData": ad})
        return {"id": wa.b64u(self.cid), "clientDataJSON": wa.b64u(cd), "attestationObject": wa.b64u(att)}

    def get(self, challenge_b64u, origin=ORIGIN, bump=True):
        if bump: self.count += 1
        cd = json.dumps({"type": "webauthn.get", "challenge": challenge_b64u, "origin": origin}).encode()
        ad = hashlib.sha256(RP.encode()).digest() + bytes([self._flags()]) + struct.pack(">I", self.count)
        sig = self.key.sign(ad + hashlib.sha256(cd).digest(), ec.ECDSA(hashes.SHA256()))
        return {"id": wa.b64u(self.cid), "clientDataJSON": wa.b64u(cd), "authenticatorData": wa.b64u(ad),
                "signature": wa.b64u(sig)}


# ---------------------------------------------------------------- card PKI
def name(cn): return x509.Name([x509.NameAttribute(NameOID.COMMON_NAME, cn)])


class Pki:
    def __init__(self):
        self.ca_key = rsa.generate_private_key(65537, 2048)
        now = datetime.now(timezone.utc)
        self.ca = (x509.CertificateBuilder().subject_name(name("TSI test CA")).issuer_name(name("TSI test CA"))
                   .public_key(self.ca_key.public_key()).serial_number(1).not_valid_before(now - timedelta(days=1))
                   .not_valid_after(now + timedelta(days=30)).sign(self.ca_key, hashes.SHA256()))

    def card(self, serial=100, expired=False, issuer_key=None):
        key = rsa.generate_private_key(65537, 2048)
        now = datetime.now(timezone.utc)
        nb, na = (now - timedelta(days=10), now - timedelta(days=1)) if expired else (now - timedelta(days=1), now + timedelta(days=10))
        cert = (x509.CertificateBuilder().subject_name(name("member card")).issuer_name(self.ca.subject)
                .public_key(key.public_key()).serial_number(serial).not_valid_before(nb).not_valid_after(na)
                .sign(issuer_key or self.ca_key, hashes.SHA256()))
        return key, cert

    def crl(self, revoked=()):
        now = datetime.now(timezone.utc)
        b = x509.CertificateRevocationListBuilder().issuer_name(self.ca.subject).last_update(now).next_update(now + timedelta(days=1))
        for s in revoked:
            b = b.add_revoked_certificate(x509.RevokedCertificateBuilder().serial_number(s).revocation_date(now).build())
        return b.sign(self.ca_key, hashes.SHA256()).public_bytes(serialization.Encoding.PEM)


def sign_card(key, challenge, card_id="card-1"):
    return base64.b64encode(key.sign(f"{challenge}:{card_id}".encode(),
                                     padding.PSS(mgf=padding.MGF1(hashes.SHA256()), salt_length=padding.PSS.MAX_LENGTH),
                                     hashes.SHA256())).decode()


# ---------------------------------------------------------------- fixtures
@pytest.fixture
def env(tmp_path):
    st = Store(str(tmp_path / "m.sqlite"))
    pki = Pki()
    crl = {"data": pki.crl()}
    app = create_app(st, RP, ORIGIN, ca=pki.ca, crl_fetch=lambda: crl["data"])
    return st, pki, crl, TestClient(app, base_url="https://thesignalsinstitute.com")


def enroll(c, st, mid, kind="enroll", authn=None):
    code = st.make_invite(mid, kind)
    authn = authn or Authn()
    o = c.post("/member/passkey/enroll/options", json={"invite": code}).json()
    r = c.post("/member/passkey/enroll/verify", json={"invite": code, "response": authn.create(o["challenge"])})
    return code, authn, r


def login(c, authn, **kw):
    o = c.post("/member/passkey/login/options").json()
    return c.post("/member/passkey/login/verify", json={"response": authn.get(o["challenge"], **kw)})


# ---------------------------------------------------------------- enrollment
def test_enroll_creates_session_and_options_require_uv(env):
    st, _, _, c = env
    mid = st.add_member("A. Member")
    code = st.make_invite(mid, "enroll")
    o = c.post("/member/passkey/enroll/options", json={"invite": code}).json()
    assert o["authenticatorSelection"]["userVerification"] == "required"
    r = c.post("/member/passkey/enroll/verify", json={"invite": code, "response": Authn().create(o["challenge"])})
    assert r.status_code == 200 and r.json()["member"] == "A. Member"
    assert c.get("/member/session").json()["method"] == "passkey"
    cookie = r.headers["set-cookie"].lower()
    assert "httponly" in cookie and "secure" in cookie and "samesite=strict" in cookie


def test_invite_is_single_use_and_unknown_invite_refused(env):
    st, _, _, c = env
    mid = st.add_member("A")
    code, _, r = enroll(c, st, mid)
    assert r.status_code == 200
    assert c.post("/member/passkey/enroll/options", json={"invite": code}).status_code == 400
    assert c.post("/member/passkey/enroll/options", json={"invite": "nope"}).status_code == 400


def test_enroll_without_user_verification_refused(env):
    st, _, _, c = env
    mid = st.add_member("A")
    _, _, r = enroll(c, st, mid, authn=Authn(uv=False))
    assert r.status_code == 400


def test_enroll_wrong_origin_refused(env):
    st, _, _, c = env
    mid = st.add_member("A")
    code = st.make_invite(mid, "enroll")
    o = c.post("/member/passkey/enroll/options", json={"invite": code}).json()
    r = c.post("/member/passkey/enroll/verify", json={"invite": code, "response": Authn().create(o["challenge"], origin="https://evil.example")})
    assert r.status_code == 400


# ---------------------------------------------------------------- login, session, logout
def test_passkey_login_session_logout(env):
    st, _, _, c = env
    mid = st.add_member("A")
    _, authn, _ = enroll(c, st, mid)
    c.post("/member/logout")
    assert c.get("/member/session").status_code == 401
    assert login(c, authn).status_code == 200
    assert c.get("/member/session").status_code == 200
    sid = c.cookies.get("tsi_member")
    c.post("/member/logout")
    c.cookies.set("tsi_member", sid)  # a stolen copy of the old cookie is dead server-side
    assert c.get("/member/session").status_code == 401


def test_replayed_assertion_and_cloned_counter_refused(env):
    st, _, _, c = env
    mid = st.add_member("A")
    _, authn, _ = enroll(c, st, mid)
    o = c.post("/member/passkey/login/options").json()
    resp = authn.get(o["challenge"])
    assert c.post("/member/passkey/login/verify", json={"response": resp}).status_code == 200
    assert c.post("/member/passkey/login/verify", json={"response": resp}).status_code == 401  # challenge consumed
    assert login(c, authn, bump=False).status_code == 401  # counter did not advance


def test_unknown_credential_refused_and_lockout(env):
    st, _, _, c = env
    ghost = Authn()
    for _ in range(5):
        assert login(c, ghost).status_code == 401
    assert c.post("/member/passkey/login/options").status_code == 429


def test_revoked_member_session_and_login_end(env):
    st, _, _, c = env
    mid = st.add_member("A")
    _, authn, _ = enroll(c, st, mid)
    st.revoke_member(mid)
    assert c.get("/member/session").status_code == 401
    assert login(c, authn).status_code == 401


# ---------------------------------------------------------------- recovery
def test_recovery_replaces_passkeys_and_ends_sessions(env):
    st, _, _, c = env
    mid = st.add_member("A")
    _, old, _ = enroll(c, st, mid)
    assert admin.main(["recover", mid], store=st) == 0
    _, new, r = enroll(c, st, mid, kind="recovery")
    assert r.status_code == 200
    c.post("/member/logout")
    assert login(c, old).status_code == 401  # lost device no longer works
    assert login(c, new).status_code == 200


def test_recovery_invite_needs_uv_and_is_short_lived(env):
    st, _, _, c = env
    mid = st.add_member("A")
    _, _, r = enroll(c, st, mid, kind="recovery", authn=Authn(uv=False))
    assert r.status_code == 400  # recovery is never weaker than enrollment
    code = st.make_invite(mid, "recovery")
    st.db.execute("UPDATE invites SET exp=0")
    assert c.post("/member/passkey/enroll/options", json={"invite": code}).status_code == 400
    from tsi_member_auth import store
    assert store.RECOVERY_INVITE_TTL < store.ENROLL_INVITE_TTL


def test_no_self_service_recovery_route(env):
    _, _, _, c = env
    for p in ("/member/recover", "/member/reset", "/member/passkey/recover"):
        assert c.post(p, json={}).status_code in (404, 405)


# ---------------------------------------------------------------- card path
def card_login(c, st, pki, key, cert, challenge=None):
    ch = challenge or c.post("/member/card/challenge").json()["challenge"]
    return c.post("/member/card/login", json={"challenge": ch, "card_id": "card-1",
                  "certificate_pem": cert.public_bytes(serialization.Encoding.PEM).decode(),
                  "signature": sign_card(key, ch)})


def registered(st, cert, name_="A"):
    mid = st.add_member(name_)
    st.add_card(mid, cert.fingerprint(hashes.SHA256()).hex())
    return mid


def test_card_login_ok_and_cookie(env):
    st, pki, _, c = env
    key, cert = pki.card()
    registered(st, cert)
    r = card_login(c, st, pki, key, cert)
    assert r.status_code == 200 and c.get("/member/session").json()["method"] == "card"


def test_card_challenge_single_use(env):
    st, pki, _, c = env
    key, cert = pki.card()
    registered(st, cert)
    ch = c.post("/member/card/challenge").json()["challenge"]
    assert card_login(c, st, pki, key, cert, ch).status_code == 200
    assert card_login(c, st, pki, key, cert, ch).status_code == 400


@pytest.mark.parametrize("why", ["revoked", "expired", "foreign_ca", "unregistered", "no_crl"])
def test_card_refusals_fail_closed(env, why):
    st, pki, crl, c = env
    if why == "foreign_ca":
        key, cert = pki.card(issuer_key=rsa.generate_private_key(65537, 2048))
    else:
        key, cert = pki.card(serial=200, expired=(why == "expired"))
    if why != "unregistered":
        registered(st, cert)
    if why == "revoked":
        crl["data"] = pki.crl([200])
    if why == "no_crl":
        crl["data"] = None
    assert card_login(c, st, pki, key, cert).status_code == 401


def test_card_revoked_in_registry_ends_card_session(env):
    st, pki, _, c = env
    key, cert = pki.card()
    registered(st, cert)
    card_login(c, st, pki, key, cert)
    assert c.get("/member/session").status_code == 200
    st.revoke_card(cert.fingerprint(hashes.SHA256()).hex())
    assert c.get("/member/session").status_code == 401


def test_card_wrong_signature_refused(env):
    st, pki, _, c = env
    key, cert = pki.card()
    registered(st, cert)
    other = rsa.generate_private_key(65537, 2048)
    assert card_login(c, st, pki, other, cert).status_code == 401


def test_card_missing_ca_fails_closed(tmp_path):
    st = Store(str(tmp_path / "x.sqlite"))
    pki = Pki()
    key, cert = pki.card()
    registered(st, cert)
    c = TestClient(create_app(st, RP, ORIGIN, ca=None, crl_fetch=lambda: pki.crl()), base_url="https://thesignalsinstitute.com")
    assert card_login(c, st, pki, key, cert).status_code == 401


# ---------------------------------------------------------------- core
def test_core_rejects_garbage():
    with pytest.raises(wa.WebAuthnError):
        wa.verify_registration({"clientDataJSON": "", "attestationObject": ""}, b"x", RP, ORIGIN)
    with pytest.raises(wa.WebAuthnError):
        wa.cbor_loads(b"\xff")
