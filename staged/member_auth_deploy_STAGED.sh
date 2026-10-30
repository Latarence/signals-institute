#!/usr/bin/env bash
# STAGED. Needs the Principal's go (auth backend deploy). DRY=1 by default: prints the plan only.
# The Signals Institute member login: its own Chief tenant CA and its own member registry.
set -euo pipefail
DRY="${DRY:-1}"
run() { echo "+ $*"; [ "$DRY" = "1" ] || "$@"; }
: "${TSI_HOST:?set TSI_HOST (the host that will run the service)}"
echo "Preconditions (operator steps, not this script):"
echo "  1. Chief tenant for the Institute exists; its intermediate CA PEM is at \$TSI_CA_PEM on the host."
echo "  2. Service env file sets TSI_MEMBER_DB, TSI_RP_ID, TSI_ORIGIN, TSI_CA_PEM, TSI_CRL_URL (or TSI_CRL_PATH)."
echo "  3. Chief GET /public/ca/crl is live (branch fix/chief-card-kit-gaps-20261030 merged and deployed)."
echo "  4. Canonical webauthn_core vendored (hash pinned in WEBAUTHN_CORE_VENDORED.txt); tests green on xps."
run rsync -a member-auth/ "$TSI_HOST":/opt/tsi/member-auth/
run ssh "$TSI_HOST" 'cd /opt/tsi/member-auth && pip install -r requirements.txt && systemctl restart tsi-member-auth'
echo "Route /member/* to the service on the same origin (Vercel rewrite to the host, or the site proxy)."
echo "Static pages (member-login.html, member.html, member.js, member.css) ship with the normal Vercel deploy."
echo "First member: python -m tsi_member_auth.admin add-member \"Name\"   (prints a one-time invitation)"
echo "Rollback: systemctl stop tsi-member-auth; remove the /member/* rewrite. The public site is unaffected."
