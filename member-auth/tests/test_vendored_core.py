"""The canonical webauthn_core must stay byte-identical to upstream (hash pinned in WEBAUTHN_CORE_VENDORED.txt),
and the adapter must expose the failure modes the services depend on."""
import hashlib
import pathlib
import re

import pytest

from tsi_member_auth import webauthn_adapter as wa, webauthn_core as core

PKG = pathlib.Path(__file__).resolve().parent.parent / "tsi_member_auth"


def test_vendored_core_is_byte_identical_to_pinned_upstream():
    pinned = re.search(r"sha256: ([0-9a-f]{64})", (PKG / "WEBAUTHN_CORE_VENDORED.txt").read_text()).group(1)
    assert hashlib.sha256((PKG / "webauthn_core.py").read_bytes()).hexdigest() == pinned


def test_canonical_core_rejects_garbage_attestation_and_assertion():
    with pytest.raises(wa.WebAuthnError):
        core.verify_registration(client_data_json=b"{}", attestation_object=b"\xa0", expected_challenge="x",
                                    origins=["https://e.test"], rp_id="e.test")
    with pytest.raises(wa.WebAuthnError):
        core.verify_assertion(client_data_json=b"{}", authenticator_data=b"", signature=b"", public_key_cose=b"",
                                 expected_challenge="x", origins=["https://e.test"], rp_id="e.test", stored_sign_count=0)
