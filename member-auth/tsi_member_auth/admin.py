"""Operator CLI. Every credential-granting step is a deliberate human act:
  python -m tsi_member_auth.admin add-member "Name"          -> member id, plus an enrollment invite
  python -m tsi_member_auth.admin invite <member-id>         -> new enrollment invite (72 h, single use)
  python -m tsi_member_auth.admin recover <member-id>        -> recovery invite (1 h, single use)
  python -m tsi_member_auth.admin add-card <member-id> <cert.pem>
  python -m tsi_member_auth.admin revoke-card <cert.pem>
  python -m tsi_member_auth.admin revoke-member <member-id>
Invites are printed once and stored only as hashes. Database: $TSI_MEMBER_DB.
"""
from __future__ import annotations

import os
import sys

from cryptography import x509
from cryptography.hazmat.primitives import hashes

from .store import Store


def _fp(path: str) -> str:
    return x509.load_pem_x509_certificate(open(path, "rb").read()).fingerprint(hashes.SHA256()).hex()


def main(argv: list[str], store: Store | None = None) -> int:
    st = store or Store(os.getenv("TSI_MEMBER_DB", "/var/lib/tsi/members.sqlite"))
    if not argv:
        print(__doc__)
        return 2
    cmd, args = argv[0], argv[1:]
    if cmd == "add-member" and len(args) == 1:
        mid = st.add_member(args[0])
        print(f"member {mid}\ninvite {st.make_invite(mid, 'enroll')}")
    elif cmd == "invite" and len(args) == 1 and st.member(args[0]):
        print(f"invite {st.make_invite(args[0], 'enroll')}")
    elif cmd == "recover" and len(args) == 1 and st.member(args[0]):
        print(f"recovery-invite {st.make_invite(args[0], 'recovery')}")
        print("Confirm the member's identity by a direct, out-of-band conversation before sharing it.")
    elif cmd == "add-card" and len(args) == 2 and st.member(args[0]):
        st.add_card(args[0], _fp(args[1]))
        print("card registered")
    elif cmd == "revoke-card" and len(args) == 1:
        st.revoke_card(_fp(args[0]))
        print("card revoked (also revoke the certificate at Chief so the CRL carries it)")
    elif cmd == "revoke-member" and len(args) == 1:
        st.revoke_member(args[0])
        print("member revoked, sessions ended")
    else:
        print(__doc__)
        return 2
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
