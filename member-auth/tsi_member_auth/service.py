"""The Signals Institute member login: passkey (WebAuthn) and member card, one session.

Dogfood of the lab's card and WebAuthn authentication for the Institute's own member and team
space (Principal direction 2026-10-30). Same-origin service behind /member/*.

  Enrollment   an operator issues a single-use invite; the member creates a passkey (user
               verification required). There is no open sign-up.
  Login        passkey: discoverable credential, assertion verified, sign count must advance.
               card:    Chief card bridge signs "challenge:card_id"; chain, currency, CRL, registry.
  Session      random id in an HttpOnly, Secure, SameSite=Strict cookie; the server holds the record,
               so logout and revocation end a session immediately.
  Recovery     operator-issued, one hour, single use, and it can only enroll another user-verified
               passkey. It never opens a session by itself and no weaker factor exists (see README).
"""
from __future__ import annotations

import os
from typing import Optional

from cryptography import x509
from cryptography.hazmat.primitives import hashes
from fastapi import Cookie, FastAPI, HTTPException, Request, Response
from pydantic import BaseModel

from . import card as cardpolicy
from . import webauthn_core as wa
from .store import CHALLENGE_TTL, SESSION_TTL, Store, _h

COOKIE = "tsi_member"


class EnrollOptionsBody(BaseModel):
    invite: str


class EnrollVerifyBody(BaseModel):
    invite: str
    response: dict


class LoginVerifyBody(BaseModel):
    response: dict


class CardLoginBody(BaseModel):
    challenge: str
    card_id: str
    certificate_pem: str
    signature: str


def create_app(store: Store, rp_id: str, origin: str, ca: Optional[x509.Certificate] = None,
               crl_fetch=cardpolicy.fetch_crl_bytes) -> FastAPI:
    app = FastAPI(title="The Signals Institute member login", docs_url=None, redoc_url=None)
    ca_cert = ca if ca is not None else cardpolicy.load_ca()

    def start_session(response: Response, mid: str, method: str) -> None:
        response.set_cookie(COOKIE, store.make_session(mid, method), max_age=SESSION_TTL, httponly=True,
                            secure=True, samesite="strict", path="/")

    def ip_of(request: Request) -> str:
        return request.client.host if request.client else "unknown"

    def guard(request: Request) -> str:
        ip = f"ip:{ip_of(request)}"
        if store.locked(ip):
            raise HTTPException(429, "Too many unsuccessful attempts. Please try again later.")
        return ip

    # ----------------------------------------------------------- enrollment (passkey)
    @app.post("/member/passkey/enroll/options")
    def enroll_options(body: EnrollOptionsBody, request: Request):
        ip = guard(request)
        inv = store.invite(body.invite)
        m = store.member(inv["member_id"]) if inv else None
        if not inv or not m or m["status"] != "active":
            store.fail(ip)
            raise HTTPException(400, "This invitation is not valid or has expired.")
        ch = store.issue_challenge("enroll", _h(body.invite))
        return wa.registration_options(rp_id, "The Signals Institute", bytes.fromhex(m["id"]), m["name"], m["name"],
                                       store.credential_ids(m["id"]), ch)

    @app.post("/member/passkey/enroll/verify")
    def enroll_verify(body: EnrollVerifyBody, request: Request, response: Response):
        ip = guard(request)
        try:
            ch = wa.client_challenge(body.response)
            if not store.consume_challenge(ch, "enroll", _h(body.invite)):
                raise wa.WebAuthnError("challenge not found or expired")
            inv = store.invite(body.invite)
            if not inv:
                raise wa.WebAuthnError("invitation not valid")
            cred = wa.verify_registration(body.response, ch, rp_id, origin, require_uv=True)
            if store.credential(cred.credential_id):
                raise wa.WebAuthnError("credential already registered")
        except wa.WebAuthnError:
            store.fail(ip)
            raise HTTPException(400, "Enrollment could not be completed.")
        if not store.use_invite(body.invite):  # single use, atomic
            store.fail(ip)
            raise HTTPException(400, "This invitation is not valid or has expired.")
        if inv["kind"] == "recovery":
            store.revoke_credentials(inv["member_id"])  # earlier passkeys are presumed lost
        store.add_credential(inv["member_id"], cred.credential_id, cred.public_key_cose, cred.sign_count)
        store.clear(ip)
        start_session(response, inv["member_id"], "passkey")
        return {"authenticated": True, "member": store.member(inv["member_id"])["name"]}

    # ----------------------------------------------------------- login (passkey)
    @app.post("/member/passkey/login/options")
    def login_options(request: Request):
        guard(request)
        return wa.authentication_options(rp_id, store.issue_challenge("login"))

    @app.post("/member/passkey/login/verify")
    def login_verify(body: LoginVerifyBody, request: Request, response: Response):
        ip = guard(request)
        try:
            ch = wa.client_challenge(body.response)
            if not store.consume_challenge(ch, "login"):  # single use, atomic
                raise wa.WebAuthnError("challenge not found or expired")
            cred = store.credential(wa.unb64u(body.response.get("id", "")))
            m = store.member(cred["member_id"]) if cred else None
            if not cred or cred["status"] != "active" or not m or m["status"] != "active":
                raise wa.WebAuthnError("unknown credential")
            new = wa.verify_authentication(body.response, ch, rp_id, origin, cred["pubkey"], cred["sign_count"], True)
        except wa.WebAuthnError:
            store.fail(ip)
            raise HTTPException(401, "Sign-in could not be completed.")
        store.set_sign_count(bytes.fromhex(cred["cred_id"]), new)
        store.clear(ip)
        start_session(response, m["id"], "passkey")
        return {"authenticated": True, "member": m["name"]}

    # ----------------------------------------------------------- login (member card)
    @app.post("/member/card/challenge")
    def card_challenge(request: Request):
        guard(request)
        return {"challenge": wa.b64u(store.issue_challenge("card")), "expires_in": CHALLENGE_TTL}

    @app.post("/member/card/login")
    def card_login(body: CardLoginBody, request: Request, response: Response):
        ip = guard(request)
        try:
            cert = x509.load_pem_x509_certificate(body.certificate_pem.encode())
        except Exception:
            raise HTTPException(400, "The card certificate could not be read.")
        fp = cert.fingerprint(hashes.SHA256()).hex()
        keys = (ip, f"fp:{fp}")
        if store.locked(keys[1]):
            raise HTTPException(429, "Too many unsuccessful attempts. Please try again later.")
        try:
            raw = wa.unb64u(body.challenge)
        except wa.WebAuthnError:
            raw = b""
        if not store.consume_challenge(raw, "card"):
            raise HTTPException(400, "The challenge has expired. Please begin again.")

        def deny(msg: str):
            for k in keys:
                store.fail(k)
            raise HTTPException(401, msg)

        if not cardpolicy.chain_ok(cert, ca_cert) or not cardpolicy.current(cert):
            deny("This card certificate is not accepted.")
        if not cardpolicy.revocation_ok(cert, ca_cert, crl_fetch):
            deny("This card certificate is revoked, or its status could not be confirmed.")
        c = store.card(fp)
        m = store.member(c["member_id"]) if c and c["status"] == "active" else None
        if not m or m["status"] != "active":
            deny("This card is not registered to a member.")
        if not cardpolicy.signature_ok(cert, body.challenge, body.card_id, body.signature):
            deny("The card signature could not be verified.")
        for k in keys:
            store.clear(k)
        start_session(response, m["id"], "card")
        return {"authenticated": True, "member": m["name"]}

    # ----------------------------------------------------------- session and logout
    @app.get("/member/session")
    def session(tsi_member: Optional[str] = Cookie(default=None)):
        m = store.session_member(tsi_member)
        if not m:
            raise HTTPException(401, "No session")
        return {"authenticated": True, "member": m["name"], "method": m["method"]}

    @app.post("/member/logout")
    def logout(response: Response, tsi_member: Optional[str] = Cookie(default=None)):
        store.end_session(tsi_member)
        response.delete_cookie(COOKIE, path="/")
        return {"authenticated": False}

    return app


def app_from_env() -> FastAPI:  # uvicorn tsi_member_auth.service:app_from_env --factory
    return create_app(Store(os.getenv("TSI_MEMBER_DB", "/var/lib/tsi/members.sqlite")),
                      os.getenv("TSI_RP_ID", "thesignalsinstitute.com"),
                      os.getenv("TSI_ORIGIN", "https://thesignalsinstitute.com"))
