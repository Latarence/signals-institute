# Member login (TSI-DOGFOOD-LOGIN, 2026-10-30)

**Starting point.** The Institute site was a static Vercel site (plus `server.js` for Stripe donations) with no
sign-in of any kind. This directory adds the minimal member login, built as a dogfood of the lab's passkey
(WebAuthn) and member-card authentication.

## Pieces
| Path | Role |
|---|---|
| `member-auth/tsi_member_auth/service.py` | FastAPI service, same-origin under `/member/*` |
| `.../webauthn_core.py`, `.../webauthn_adapter.py` | Canonical passkey verifier (vendored) and the thin adapter this service calls |
| `.../card.py` | Card path policy: tenant CA chain, currency, CRL (fail closed), RSA-PSS signature |
| `.../store.py` | SQLite: members, credentials, cards, invites, challenges, sessions, lockout |
| `.../admin.py` | Operator CLI: add-member, invite, recover, add-card, revoke-card, revoke-member |
| `member-login.html`, `member.html`, `member.js`, `member.css` | Pages in the site's own style |
| `staged/member_auth_deploy_STAGED.sh` | Deploy plan, `DRY=1` by default |

## Behaviour
- **Enrollment.** Operator issues a single-use invitation (72 h, stored as a hash). The member creates a
  discoverable passkey with user verification required. There is no open sign-up.
- **Login.** Passkey: challenge single use, assertion verified, sign count must advance. Card: the Chief card
  bridge signs `challenge:card_id`; certificate must chain to the Institute's own tenant CA, be current, absent from
  the CRL (unknown status denies), and registered to an active member.
- **Session.** Random id in an HttpOnly, Secure, SameSite=Strict cookie; the server holds the record. Logout,
  member revocation, and card revocation (for card sessions) end sessions at once.
- **Lockout.** 5 unsuccessful attempts per address (and per card certificate) lock for 15 minutes.
- **Recovery.** Operator-issued only: a person confirms the member's identity directly, then runs
  `admin recover <member-id>`. The recovery invitation lasts 1 hour, is single use, and can only enroll a new
  user-verified passkey, so recovery is never weaker than enrollment. On success the earlier passkeys are retired
  and live sessions end. There is no email link, SMS code, or security question route. A lost card is handled by
  revoking its certificate at Chief (replace flow) and `admin revoke-card`.

## Interfaces coded against
- `webauthn_core.py` is the canonical Huntington core (branch `fix/huntington-webauthn-login-20261030`, commit 7be802c8) vendored
  verbatim and pinned by `WEBAUTHN_CORE_VENDORED.txt` (a test fails on drift). `webauthn_adapter.py` keeps the four-function surface
  this service uses (`registration_options`, `verify_registration`, `authentication_options`, `verify_authentication`).
- `window.chiefCardBridge.sign(challenge)` (Chief branch `fix/chief-card-bridge-20261030`; client vendored as `chief-card-bridge.js`): returns
  `{ card_id, certificate_pem, signature }`, the same contract the Ridgefield member login uses.
- CRL: Chief `GET /public/ca/crl` (branch `fix/chief-card-kit-gaps-20261030`), via `TSI_CRL_URL` or `TSI_CRL_PATH`.

## Run and test
`pip install -r requirements.txt` (httpx below 0.28 for the test client), `python -m pytest member-auth/tests`.
Service: `uvicorn tsi_member_auth.service:app_from_env --factory`. Environment: `TSI_MEMBER_DB`, `TSI_RP_ID`
(default thesignalsinstitute.com), `TSI_ORIGIN`, `TSI_CA_PEM`, `TSI_CRL_URL` or `TSI_CRL_PATH`.

## Deploy
The site is static on Vercel, so the service needs a host and `/member/*` must reach it on the same origin
(a Vercel rewrite to that host, or the site proxy). Deploying an auth backend needs the Principal's go.
