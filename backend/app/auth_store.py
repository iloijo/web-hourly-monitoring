"""
User management for the dashboard login: users, roles, per-menu privileges, sessions and an audit log.

Stored in a local SQLite file (backend/data/netpulse_auth.sqlite3, git-ignored) so logging in does not
depend on onedb/twodb being reachable. Passwords are hashed with scrypt; session tokens are random and
only their SHA-256 is stored.

Bootstrap: when the users table is empty and DASHBOARD_USER / DASHBOARD_PASS are set in backend/.env,
that account is created as SuperAdmin on startup. After that the .env values are no longer used to log in.
"""
import base64
import hashlib
import hmac
import secrets
import sqlite3
import threading
import time
from pathlib import Path
from typing import Optional

from .config import settings

DB_PATH = Path(settings.AUTH_DB_PATH) if settings.AUTH_DB_PATH else Path(__file__).resolve().parent.parent / "data" / "netpulse_auth.sqlite3"

# Every page a role can be granted. "admin" is the Administrasi page (user / role management).
MENUS = [
    {"id": "overview", "label": "Overview", "group": "Overview"},
    {"id": "2g", "label": "2G Monitoring", "group": "KPI Monitoring"},
    {"id": "4g-hourly", "label": "4G Hourly", "group": "KPI Monitoring"},
    {"id": "4g-daily", "label": "4G Daily", "group": "KPI Monitoring"},
    {"id": "5g", "label": "5G Monitoring", "group": "KPI Monitoring"},
    {"id": "cluster", "label": "Cluster Monitoring", "group": "Cluster Monitoring"},
    {"id": "cei", "label": "CEI", "group": "OKR"},
    {"id": "worst-cell", "label": "Worst Cell Top-N", "group": "Worst Cell & ZTZP"},
    {"id": "ztzp", "label": "ZTZP", "group": "Worst Cell & ZTZP"},
    {"id": "ta-4g", "label": "Timing Advance 4G", "group": "Timing Advance"},
    {"id": "ta-5g", "label": "Timing Advance 5G", "group": "Timing Advance"},
    {"id": "packet-loss", "label": "Packet Loss", "group": "Quality & Transport"},
    {"id": "admin", "label": "Administrasi", "group": "Administrasi"},
]
MENU_IDS = [m["id"] for m in MENUS]

SUPERADMIN_ROLE = "superadmin"
DEFAULT_ROLES = [
    # (id, name, description, is_super, permissions)
    (SUPERADMIN_ROLE, "SuperAdmin", "Semua menu, kelola user, role dan hak akses", 1, MENU_IDS),
    ("rno", "RNO", "Semua menu monitoring", 0, [m for m in MENU_IDS if m != "admin"]),
    ("oss", "OSS/Viewer", "Semua menu monitoring kecuali OKR", 0, [m for m in MENU_IDS if m not in ("admin", "cei")]),
]

SESSION_IDLE_SEC = 30 * 60          # matches the frontend idle logout
SESSION_MAX_SEC = 7 * 24 * 3600     # absolute lifetime of a token
SESSION_TOUCH_SEC = 60              # last_seen is written at most once a minute per session
MAX_FAILED_LOGINS = 5
LOCKOUT_SEC = 5 * 60
MIN_PASSWORD_LEN = 8

_LOCK = threading.RLock()
_CONN: Optional[sqlite3.Connection] = None


class AuthError(Exception):
    """Validation error that is safe to show to the user."""


def _conn() -> sqlite3.Connection:
    global _CONN
    if _CONN is None:
        DB_PATH.parent.mkdir(parents=True, exist_ok=True)
        c = sqlite3.connect(str(DB_PATH), check_same_thread=False, isolation_level=None)
        c.row_factory = sqlite3.Row
        c.execute("PRAGMA foreign_keys = ON")
        c.execute("PRAGMA journal_mode = WAL")
        _CONN = c
    return _CONN


def _now() -> int:
    return int(time.time())


# ---------------------------------------------------------------- passwords

def hash_password(password: str) -> str:
    salt = secrets.token_bytes(16)
    dk = hashlib.scrypt(password.encode("utf-8"), salt=salt, n=2 ** 14, r=8, p=1, dklen=64)
    return "scrypt$16384$8$1$%s$%s" % (base64.b64encode(salt).decode(), base64.b64encode(dk).decode())


def verify_password(password: str, stored: str) -> bool:
    try:
        algo, n, r, p, salt_b64, hash_b64 = stored.split("$")
        if algo != "scrypt":
            return False
        expected = base64.b64decode(hash_b64)
        dk = hashlib.scrypt(password.encode("utf-8"), salt=base64.b64decode(salt_b64),
                            n=int(n), r=int(r), p=int(p), dklen=len(expected))
        return hmac.compare_digest(dk, expected)
    except Exception:
        return False


def _check_password_policy(password: str):
    if not password or len(password) < MIN_PASSWORD_LEN:
        raise AuthError(f"Password minimal {MIN_PASSWORD_LEN} karakter.")


def _token_hash(token: str) -> str:
    return hashlib.sha256(token.encode("utf-8")).hexdigest()


# ---------------------------------------------------------------- schema / bootstrap

def init_db():
    with _LOCK:
        c = _conn()
        c.executescript("""
            CREATE TABLE IF NOT EXISTS roles (
                id TEXT PRIMARY KEY,
                name TEXT NOT NULL UNIQUE,
                description TEXT NOT NULL DEFAULT '',
                is_super INTEGER NOT NULL DEFAULT 0,
                created_at INTEGER NOT NULL
            );
            CREATE TABLE IF NOT EXISTS role_permissions (
                role_id TEXT NOT NULL REFERENCES roles(id) ON DELETE CASCADE,
                menu_id TEXT NOT NULL,
                PRIMARY KEY (role_id, menu_id)
            );
            CREATE TABLE IF NOT EXISTS users (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                username TEXT NOT NULL UNIQUE COLLATE NOCASE,
                full_name TEXT NOT NULL DEFAULT '',
                password_hash TEXT NOT NULL,
                role_id TEXT NOT NULL REFERENCES roles(id),
                is_active INTEGER NOT NULL DEFAULT 1,
                failed_logins INTEGER NOT NULL DEFAULT 0,
                locked_until INTEGER NOT NULL DEFAULT 0,
                created_at INTEGER NOT NULL,
                updated_at INTEGER NOT NULL,
                last_login_at INTEGER
            );
            CREATE TABLE IF NOT EXISTS sessions (
                token_hash TEXT PRIMARY KEY,
                user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
                created_at INTEGER NOT NULL,
                last_seen INTEGER NOT NULL,
                expires_at INTEGER NOT NULL
            );
            CREATE TABLE IF NOT EXISTS audit_log (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                ts INTEGER NOT NULL,
                actor TEXT NOT NULL,
                action TEXT NOT NULL,
                target TEXT NOT NULL DEFAULT '',
                detail TEXT NOT NULL DEFAULT '',
                ip TEXT NOT NULL DEFAULT ''
            );
            CREATE INDEX IF NOT EXISTS idx_sessions_user ON sessions(user_id);
            CREATE INDEX IF NOT EXISTS idx_audit_ts ON audit_log(ts);
        """)
        now = _now()
        for role_id, name, desc, is_super, perms in DEFAULT_ROLES:
            exists = c.execute("SELECT 1 FROM roles WHERE id = ?", (role_id,)).fetchone()
            if not exists:
                c.execute("INSERT INTO roles (id, name, description, is_super, created_at) VALUES (?, ?, ?, ?, ?)",
                          (role_id, name, desc, is_super, now))
                c.executemany("INSERT INTO role_permissions (role_id, menu_id) VALUES (?, ?)",
                              [(role_id, m) for m in perms])

        user_count = c.execute("SELECT COUNT(*) FROM users").fetchone()[0]
        if user_count == 0 and settings.DASHBOARD_USER and settings.DASHBOARD_PASS:
            c.execute(
                "INSERT INTO users (username, full_name, password_hash, role_id, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)",
                (settings.DASHBOARD_USER, settings.DASHBOARD_USER, hash_password(settings.DASHBOARD_PASS), SUPERADMIN_ROLE, now, now),
            )
            log("system", "bootstrap_superadmin", settings.DASHBOARD_USER, "dibuat dari backend/.env")
        c.execute("DELETE FROM sessions WHERE expires_at < ?", (now,))


def auth_required() -> bool:
    """Login is required as soon as at least one user exists."""
    with _LOCK:
        return _conn().execute("SELECT 1 FROM users LIMIT 1").fetchone() is not None


def log(actor: str, action: str, target: str = "", detail: str = "", ip: str = ""):
    with _LOCK:
        _conn().execute("INSERT INTO audit_log (ts, actor, action, target, detail, ip) VALUES (?, ?, ?, ?, ?, ?)",
                        (_now(), actor or "", action, target or "", detail or "", ip or ""))


# ---------------------------------------------------------------- roles

def _role_permissions(role_id: str, is_super: bool) -> list:
    if is_super:
        return list(MENU_IDS)
    rows = _conn().execute("SELECT menu_id FROM role_permissions WHERE role_id = ?", (role_id,)).fetchall()
    allowed = {r["menu_id"] for r in rows}
    return [m for m in MENU_IDS if m in allowed]


def list_roles() -> list:
    with _LOCK:
        c = _conn()
        rows = c.execute("""
            SELECT r.*, (SELECT COUNT(*) FROM users u WHERE u.role_id = r.id) AS user_count
            FROM roles r ORDER BY r.is_super DESC, r.created_at, r.rowid
        """).fetchall()
        return [{
            "id": r["id"], "name": r["name"], "description": r["description"],
            "is_super": bool(r["is_super"]), "user_count": r["user_count"],
            "builtin": r["id"] in {d[0] for d in DEFAULT_ROLES},
            "permissions": _role_permissions(r["id"], bool(r["is_super"])),
        } for r in rows]


def _clean_perms(perms) -> list:
    perms = [str(p) for p in (perms or [])]
    unknown = [p for p in perms if p not in MENU_IDS]
    if unknown:
        raise AuthError(f"Menu tidak dikenal: {', '.join(unknown)}")
    return [m for m in MENU_IDS if m in set(perms)]


def create_role(name: str, description: str, permissions) -> str:
    name = (name or "").strip()
    if not name:
        raise AuthError("Nama role wajib diisi.")
    perms = _clean_perms(permissions)
    base = "".join(ch if ch.isalnum() else "-" for ch in name.lower()).strip("-") or "role"
    with _LOCK:
        c = _conn()
        if c.execute("SELECT 1 FROM roles WHERE name = ? COLLATE NOCASE", (name,)).fetchone():
            raise AuthError("Nama role sudah dipakai.")
        role_id, i = base, 2
        while c.execute("SELECT 1 FROM roles WHERE id = ?", (role_id,)).fetchone():
            role_id, i = f"{base}-{i}", i + 1
        c.execute("INSERT INTO roles (id, name, description, is_super, created_at) VALUES (?, ?, ?, 0, ?)",
                  (role_id, name, (description or "").strip(), _now()))
        c.executemany("INSERT INTO role_permissions (role_id, menu_id) VALUES (?, ?)", [(role_id, m) for m in perms])
    return role_id


def update_role(role_id: str, name: Optional[str], description: Optional[str], permissions):
    with _LOCK:
        c = _conn()
        row = c.execute("SELECT * FROM roles WHERE id = ?", (role_id,)).fetchone()
        if not row:
            raise AuthError("Role tidak ditemukan.")
        if name is not None:
            name = name.strip()
            if not name:
                raise AuthError("Nama role wajib diisi.")
            if c.execute("SELECT 1 FROM roles WHERE name = ? COLLATE NOCASE AND id <> ?", (name, role_id)).fetchone():
                raise AuthError("Nama role sudah dipakai.")
            c.execute("UPDATE roles SET name = ? WHERE id = ?", (name, role_id))
        if description is not None:
            c.execute("UPDATE roles SET description = ? WHERE id = ?", (description.strip(), role_id))
        if permissions is not None:
            if row["is_super"]:
                raise AuthError("Hak akses SuperAdmin selalu penuh dan tidak bisa diubah.")
            perms = _clean_perms(permissions)
            c.execute("DELETE FROM role_permissions WHERE role_id = ?", (role_id,))
            c.executemany("INSERT INTO role_permissions (role_id, menu_id) VALUES (?, ?)", [(role_id, m) for m in perms])


def delete_role(role_id: str):
    with _LOCK:
        c = _conn()
        row = c.execute("SELECT * FROM roles WHERE id = ?", (role_id,)).fetchone()
        if not row:
            raise AuthError("Role tidak ditemukan.")
        if role_id in {d[0] for d in DEFAULT_ROLES}:
            raise AuthError("Role bawaan tidak bisa dihapus.")
        if c.execute("SELECT 1 FROM users WHERE role_id = ?", (role_id,)).fetchone():
            raise AuthError("Role masih dipakai user. Pindahkan user ke role lain dulu.")
        c.execute("DELETE FROM roles WHERE id = ?", (role_id,))


# ---------------------------------------------------------------- users

def _user_dict(r) -> dict:
    return {
        "id": r["id"], "username": r["username"], "full_name": r["full_name"],
        "role_id": r["role_id"], "role_name": r["role_name"], "is_super": bool(r["is_super"]),
        "is_active": bool(r["is_active"]),
        "locked": bool(r["locked_until"] and r["locked_until"] > _now()),
        "created_at": r["created_at"], "last_login_at": r["last_login_at"],
    }


_USER_SELECT = """
    SELECT u.*, r.name AS role_name, r.is_super AS is_super
    FROM users u JOIN roles r ON r.id = u.role_id
"""


def list_users() -> list:
    with _LOCK:
        rows = _conn().execute(_USER_SELECT + " ORDER BY r.is_super DESC, u.username").fetchall()
        return [_user_dict(r) for r in rows]


def get_user(user_id: int) -> Optional[dict]:
    with _LOCK:
        r = _conn().execute(_USER_SELECT + " WHERE u.id = ?", (user_id,)).fetchone()
        return _user_dict(r) if r else None


def _active_super_count(c, exclude_user_id: Optional[int] = None) -> int:
    q = "SELECT COUNT(*) FROM users u JOIN roles r ON r.id = u.role_id WHERE r.is_super = 1 AND u.is_active = 1"
    args = ()
    if exclude_user_id is not None:
        q += " AND u.id <> ?"
        args = (exclude_user_id,)
    return c.execute(q, args).fetchone()[0]


def _clean_username(username: str) -> str:
    username = (username or "").strip()
    if not (3 <= len(username) <= 64) or not all(ch.isalnum() or ch in "._-" for ch in username):
        raise AuthError("Username 3-64 karakter: huruf, angka, titik, garis bawah atau strip.")
    return username


def create_user(username: str, full_name: str, password: str, role_id: str, is_active: bool = True) -> int:
    username = _clean_username(username)
    _check_password_policy(password)
    with _LOCK:
        c = _conn()
        if not c.execute("SELECT 1 FROM roles WHERE id = ?", (role_id,)).fetchone():
            raise AuthError("Role tidak ditemukan.")
        if c.execute("SELECT 1 FROM users WHERE username = ?", (username,)).fetchone():
            raise AuthError("Username sudah dipakai.")
        now = _now()
        cur = c.execute(
            "INSERT INTO users (username, full_name, password_hash, role_id, is_active, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)",
            (username, (full_name or "").strip(), hash_password(password), role_id, 1 if is_active else 0, now, now),
        )
        return cur.lastrowid


def update_user(user_id: int, actor_id: Optional[int], full_name=None, role_id=None, is_active=None, password=None, unlock=False) -> list:
    """Applies the given changes; returns a list of human-readable changes for the audit log."""
    changes = []
    with _LOCK:
        c = _conn()
        row = c.execute(_USER_SELECT + " WHERE u.id = ?", (user_id,)).fetchone()
        if not row:
            raise AuthError("User tidak ditemukan.")
        is_self = actor_id is not None and actor_id == user_id
        losing_super = False

        if role_id is not None and role_id != row["role_id"]:
            new_role = c.execute("SELECT * FROM roles WHERE id = ?", (role_id,)).fetchone()
            if not new_role:
                raise AuthError("Role tidak ditemukan.")
            if row["is_super"] and not new_role["is_super"]:
                if is_self:
                    raise AuthError("Anda tidak bisa menurunkan role akun Anda sendiri.")
                losing_super = True
        if is_active is not None and not is_active and row["is_active"]:
            if is_self:
                raise AuthError("Anda tidak bisa menonaktifkan akun Anda sendiri.")
            if row["is_super"]:
                losing_super = True
        if losing_super and _active_super_count(c, exclude_user_id=user_id) == 0:
            raise AuthError("Minimal harus ada satu SuperAdmin aktif.")
        if password is not None:
            _check_password_policy(password)

        now = _now()
        if full_name is not None and full_name.strip() != row["full_name"]:
            c.execute("UPDATE users SET full_name = ?, updated_at = ? WHERE id = ?", (full_name.strip(), now, user_id))
            changes.append("nama")
        if role_id is not None and role_id != row["role_id"]:
            c.execute("UPDATE users SET role_id = ?, updated_at = ? WHERE id = ?", (role_id, now, user_id))
            changes.append(f"role {row['role_id']} -> {role_id}")
        if is_active is not None and bool(is_active) != bool(row["is_active"]):
            c.execute("UPDATE users SET is_active = ?, updated_at = ? WHERE id = ?", (1 if is_active else 0, now, user_id))
            changes.append("diaktifkan" if is_active else "dinonaktifkan")
            if not is_active:
                c.execute("DELETE FROM sessions WHERE user_id = ?", (user_id,))
        if password is not None:
            c.execute("UPDATE users SET password_hash = ?, failed_logins = 0, locked_until = 0, updated_at = ? WHERE id = ?",
                      (hash_password(password), now, user_id))
            changes.append("password direset")
            if not is_self:
                c.execute("DELETE FROM sessions WHERE user_id = ?", (user_id,))
        if unlock and row["locked_until"]:
            c.execute("UPDATE users SET failed_logins = 0, locked_until = 0 WHERE id = ?", (user_id,))
            changes.append("dibuka kuncinya")
    return changes


def delete_user(user_id: int, actor_id: Optional[int]) -> str:
    with _LOCK:
        c = _conn()
        row = c.execute(_USER_SELECT + " WHERE u.id = ?", (user_id,)).fetchone()
        if not row:
            raise AuthError("User tidak ditemukan.")
        if actor_id is not None and actor_id == user_id:
            raise AuthError("Anda tidak bisa menghapus akun Anda sendiri.")
        if row["is_super"] and row["is_active"] and _active_super_count(c, exclude_user_id=user_id) == 0:
            raise AuthError("Minimal harus ada satu SuperAdmin aktif.")
        c.execute("DELETE FROM users WHERE id = ?", (user_id,))
        return row["username"]


def change_own_password(user_id: int, old_password: str, new_password: str):
    with _LOCK:
        c = _conn()
        row = c.execute("SELECT password_hash FROM users WHERE id = ?", (user_id,)).fetchone()
        if not row or not verify_password(old_password or "", row["password_hash"]):
            raise AuthError("Password lama salah.")
    _check_password_policy(new_password)
    with _LOCK:
        _conn().execute("UPDATE users SET password_hash = ?, updated_at = ? WHERE id = ?",
                        (hash_password(new_password), _now(), user_id))


# ---------------------------------------------------------------- login / sessions

def authenticate(username: str, password: str) -> dict:
    """Returns {"user": ..., "token": ...} or raises AuthError with a message safe to show."""
    username = (username or "").strip()
    with _LOCK:
        c = _conn()
        row = c.execute(_USER_SELECT + " WHERE u.username = ?", (username,)).fetchone()
        now = _now()
        if row and row["locked_until"] and row["locked_until"] > now:
            mins = max(1, (row["locked_until"] - now + 59) // 60)
            raise AuthError(f"Akun terkunci karena terlalu banyak percobaan gagal. Coba lagi dalam {mins} menit.")

    # Verify outside the lock: scrypt takes ~50 ms. Unknown users still pay the cost (no timing hint).
    ok = verify_password(password or "", row["password_hash"] if row else hash_password("dummy-password"))

    with _LOCK:
        c = _conn()
        if not row or not ok:
            if row:
                failed = row["failed_logins"] + 1
                locked = now + LOCKOUT_SEC if failed >= MAX_FAILED_LOGINS else 0
                c.execute("UPDATE users SET failed_logins = ?, locked_until = ? WHERE id = ?",
                          (0 if locked else failed, locked, row["id"]))
            raise AuthError("Username dan password tidak cocok.")
        if not row["is_active"]:
            raise AuthError("Akun ini dinonaktifkan. Hubungi SuperAdmin.")

        token = secrets.token_urlsafe(32)
        c.execute("INSERT INTO sessions (token_hash, user_id, created_at, last_seen, expires_at) VALUES (?, ?, ?, ?, ?)",
                  (_token_hash(token), row["id"], now, now, now + SESSION_MAX_SEC))
        c.execute("UPDATE users SET failed_logins = 0, locked_until = 0, last_login_at = ? WHERE id = ?", (now, row["id"]))
        c.execute("DELETE FROM sessions WHERE expires_at < ? OR last_seen < ?", (now, now - SESSION_IDLE_SEC))
    return {"user": session_user(row["id"]), "token": token}


def session_user(user_id: int) -> Optional[dict]:
    """Public view of a logged-in user, including the menus they may open."""
    with _LOCK:
        r = _conn().execute(_USER_SELECT + " WHERE u.id = ?", (user_id,)).fetchone()
        if not r:
            return None
        return {
            "id": r["id"], "username": r["username"], "full_name": r["full_name"] or r["username"],
            "role_id": r["role_id"], "role_name": r["role_name"], "is_super": bool(r["is_super"]),
            "permissions": _role_permissions(r["role_id"], bool(r["is_super"])),
        }


def resolve_token(token: str) -> Optional[dict]:
    """User for a bearer token, or None when the token is unknown, expired, idle too long or the user is inactive."""
    if not token:
        return None
    th = _token_hash(token)
    now = _now()
    with _LOCK:
        c = _conn()
        s = c.execute("""
            SELECT s.user_id, s.last_seen, s.expires_at, u.is_active
            FROM sessions s JOIN users u ON u.id = s.user_id WHERE s.token_hash = ?
        """, (th,)).fetchone()
        if not s:
            return None
        if s["expires_at"] < now or s["last_seen"] < now - SESSION_IDLE_SEC or not s["is_active"]:
            c.execute("DELETE FROM sessions WHERE token_hash = ?", (th,))
            return None
        if now - s["last_seen"] >= SESSION_TOUCH_SEC:
            c.execute("UPDATE sessions SET last_seen = ? WHERE token_hash = ?", (now, th))
        return session_user(s["user_id"])


def revoke_token(token: str):
    if token:
        with _LOCK:
            _conn().execute("DELETE FROM sessions WHERE token_hash = ?", (_token_hash(token),))


def list_audit(limit: int = 200) -> list:
    limit = max(1, min(int(limit or 200), 1000))
    with _LOCK:
        rows = _conn().execute("SELECT * FROM audit_log ORDER BY id DESC LIMIT ?", (limit,)).fetchall()
        return [dict(r) for r in rows]
