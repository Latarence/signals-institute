"""SQLite state for member login. Every single-use item is consumed by a DELETE/UPDATE whose
row count is the gate, so two concurrent requests cannot both succeed."""
from __future__ import annotations

import hashlib
import secrets
import sqlite3
import time
from datetime import datetime, timezone
from typing import Optional

CHALLENGE_TTL = 300
SESSION_TTL = 8 * 3600
ENROLL_INVITE_TTL = 72 * 3600
RECOVERY_INVITE_TTL = 3600   # shorter on purpose: recovery is the sensitive door
MAX_FAILURES = 5
LOCKOUT_SECONDS = 900


def _h(s: str) -> str:
    return hashlib.sha256(s.encode()).hexdigest()


def _now() -> str:
    return datetime.now(timezone.utc).isoformat()


class Store:
    def __init__(self, path: str):
        self.db = sqlite3.connect(path, check_same_thread=False, isolation_level=None)
        self.db.executescript(
            """
            CREATE TABLE IF NOT EXISTS members(id TEXT PRIMARY KEY, name TEXT NOT NULL,
                status TEXT NOT NULL DEFAULT 'active', added_utc TEXT NOT NULL);
            CREATE TABLE IF NOT EXISTS credentials(cred_id TEXT PRIMARY KEY, member_id TEXT NOT NULL,
                pubkey BLOB NOT NULL, sign_count INTEGER NOT NULL, status TEXT NOT NULL DEFAULT 'active',
                added_utc TEXT NOT NULL);
            CREATE TABLE IF NOT EXISTS cards(fingerprint TEXT PRIMARY KEY, member_id TEXT NOT NULL,
                status TEXT NOT NULL DEFAULT 'active', added_utc TEXT NOT NULL);
            CREATE TABLE IF NOT EXISTS invites(h TEXT PRIMARY KEY, member_id TEXT NOT NULL, kind TEXT NOT NULL,
                exp REAL NOT NULL, used INTEGER NOT NULL DEFAULT 0);
            CREATE TABLE IF NOT EXISTS challenges(h TEXT PRIMARY KEY, purpose TEXT NOT NULL, ref TEXT NOT NULL,
                exp REAL NOT NULL);
            CREATE TABLE IF NOT EXISTS sessions(h TEXT PRIMARY KEY, member_id TEXT NOT NULL, method TEXT NOT NULL,
                exp REAL NOT NULL);
            CREATE TABLE IF NOT EXISTS failures(k TEXT PRIMARY KEY, n INTEGER NOT NULL, until REAL NOT NULL);
            """
        )

    # --- members
    def add_member(self, name: str) -> str:
        mid = secrets.token_hex(8)
        self.db.execute("INSERT INTO members VALUES (?,?,?,?)", (mid, name, "active", _now()))
        return mid

    def member(self, mid: str) -> Optional[dict]:
        r = self.db.execute("SELECT id, name, status FROM members WHERE id=?", (mid,)).fetchone()
        return dict(zip(("id", "name", "status"), r)) if r else None

    def revoke_member(self, mid: str) -> None:
        self.db.execute("UPDATE members SET status='revoked' WHERE id=?", (mid,))
        self.db.execute("DELETE FROM sessions WHERE member_id=?", (mid,))

    # --- invites (enrollment and recovery)
    def make_invite(self, mid: str, kind: str) -> str:
        code = secrets.token_urlsafe(24)
        ttl = RECOVERY_INVITE_TTL if kind == "recovery" else ENROLL_INVITE_TTL
        self.db.execute("INSERT INTO invites VALUES (?,?,?,?,0)", (_h(code), mid, kind, time.time() + ttl))
        return code

    def invite(self, code: str) -> Optional[dict]:
        r = self.db.execute("SELECT member_id, kind FROM invites WHERE h=? AND used=0 AND exp>=?",
                            (_h(code), time.time())).fetchone()
        return {"member_id": r[0], "kind": r[1]} if r else None

    def use_invite(self, code: str) -> bool:
        return self.db.execute("UPDATE invites SET used=1 WHERE h=? AND used=0 AND exp>=?",
                               (_h(code), time.time())).rowcount == 1

    # --- challenges
    def issue_challenge(self, purpose: str, ref: str = "") -> bytes:
        raw = secrets.token_bytes(32)
        self.db.execute("DELETE FROM challenges WHERE exp < ?", (time.time(),))
        self.db.execute("INSERT INTO challenges VALUES (?,?,?,?)", (_h(raw.hex()), purpose, ref, time.time() + CHALLENGE_TTL))
        return raw

    def consume_challenge(self, raw: bytes, purpose: str, ref: str = "") -> bool:
        return self.db.execute("DELETE FROM challenges WHERE h=? AND purpose=? AND ref=? AND exp>=?",
                               (_h(raw.hex()), purpose, ref, time.time())).rowcount == 1

    # --- credentials
    def add_credential(self, mid: str, cred_id: bytes, pubkey: bytes, sign_count: int) -> None:
        self.db.execute("INSERT INTO credentials VALUES (?,?,?,?,?,?)",
                        (cred_id.hex(), mid, pubkey, sign_count, "active", _now()))

    def credential(self, cred_id: bytes) -> Optional[dict]:
        r = self.db.execute("SELECT cred_id, member_id, pubkey, sign_count, status FROM credentials WHERE cred_id=?",
                            (cred_id.hex(),)).fetchone()
        return dict(zip(("cred_id", "member_id", "pubkey", "sign_count", "status"), r)) if r else None

    def credential_ids(self, mid: str) -> list[bytes]:
        return [bytes.fromhex(r[0]) for r in self.db.execute(
            "SELECT cred_id FROM credentials WHERE member_id=? AND status='active'", (mid,))]

    def set_sign_count(self, cred_id: bytes, new: int) -> None:
        self.db.execute("UPDATE credentials SET sign_count=? WHERE cred_id=?", (new, cred_id.hex()))

    def revoke_credentials(self, mid: str) -> None:
        self.db.execute("UPDATE credentials SET status='revoked' WHERE member_id=?", (mid,))
        self.db.execute("DELETE FROM sessions WHERE member_id=?", (mid,))

    # --- cards
    def add_card(self, mid: str, fingerprint: str) -> None:
        self.db.execute("INSERT OR REPLACE INTO cards VALUES (?,?,?,?)", (fingerprint.lower(), mid, "active", _now()))

    def card(self, fingerprint: str) -> Optional[dict]:
        r = self.db.execute("SELECT fingerprint, member_id, status FROM cards WHERE fingerprint=?",
                            (fingerprint.lower(),)).fetchone()
        return dict(zip(("fingerprint", "member_id", "status"), r)) if r else None

    def revoke_card(self, fingerprint: str) -> None:
        r = self.card(fingerprint)
        self.db.execute("UPDATE cards SET status='revoked' WHERE fingerprint=?", (fingerprint.lower(),))
        if r:  # sessions that began with a card end with the card
            self.db.execute("DELETE FROM sessions WHERE member_id=? AND method='card'", (r["member_id"],))

    # --- sessions
    def make_session(self, mid: str, method: str) -> str:
        sid = secrets.token_urlsafe(32)
        self.db.execute("DELETE FROM sessions WHERE exp < ?", (time.time(),))
        self.db.execute("INSERT INTO sessions VALUES (?,?,?,?)", (_h(sid), mid, method, time.time() + SESSION_TTL))
        return sid

    def session_member(self, sid: Optional[str]) -> Optional[dict]:
        if not sid:
            return None
        r = self.db.execute("SELECT member_id, method FROM sessions WHERE h=? AND exp>=?", (_h(sid), time.time())).fetchone()
        m = self.member(r[0]) if r else None
        return {**m, "method": r[1]} if m and m["status"] == "active" else None

    def end_session(self, sid: Optional[str]) -> None:
        if sid:
            self.db.execute("DELETE FROM sessions WHERE h=?", (_h(sid),))

    # --- lockout
    def locked(self, key: str) -> bool:
        r = self.db.execute("SELECT n, until FROM failures WHERE k=?", (key,)).fetchone()
        return bool(r) and r[0] >= MAX_FAILURES and r[1] > time.time()

    def fail(self, key: str) -> None:
        r = self.db.execute("SELECT n, until FROM failures WHERE k=?", (key,)).fetchone()
        n = 1 if (not r or r[1] <= time.time()) else r[0] + 1
        self.db.execute("INSERT OR REPLACE INTO failures VALUES (?,?,?)", (key, n, time.time() + LOCKOUT_SECONDS))

    def clear(self, key: str) -> None:
        self.db.execute("DELETE FROM failures WHERE k=?", (key,))
