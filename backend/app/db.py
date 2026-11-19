import psycopg2
import logging
import threading
import time
from datetime import datetime, timedelta
from typing import Optional, Dict, Any
from .config import settings

logger = logging.getLogger("twodb_connection")

# (db, table) -> (fetched_at_epoch, latest_date)
_LATEST_DATE_CACHE: Dict[tuple, tuple] = {}
_LATEST_DATE_TTL_SEC = 600
_LATEST_DATE_FAILED_AT: Dict[tuple, float] = {}
_LATEST_DATE_RETRY_SEC = 60

def get_latest_data_date(db: str, table: str) -> datetime:
    """
    Latest "Begin Time" date (midnight) available in `table` on `db` ("twodb" or "onedb").
    Cached for 10 minutes. Falls back to the last cached value, then yesterday, when unreachable.
    """
    key = (db, table)
    cached = _LATEST_DATE_CACHE.get(key)
    if cached and time.time() - cached[0] < _LATEST_DATE_TTL_SEC:
        return cached[1]

    fallback = cached[1] if cached else (datetime.now() - timedelta(days=1)).replace(hour=0, minute=0, second=0, microsecond=0)
    # An unreachable DB is not retried for a minute, so /api/latest_dates stays fast while TwoDb is down
    failed_at = _LATEST_DATE_FAILED_AT.get(key)
    if failed_at and time.time() - failed_at < _LATEST_DATE_RETRY_SEC:
        return fallback
    conn = get_twodb_connection(timeout=5) if db == "twodb" else get_onedb_connection(timeout=5)
    if not conn:
        _LATEST_DATE_FAILED_AT[key] = time.time()
        return fallback
    _LATEST_DATE_FAILED_AT.pop(key, None)
    try:
        cur = conn.cursor()
        col = "date" if table == "measDailyTrafficPayload" else '"Begin Time"'
        cur.execute(f'SELECT MAX({col}) FROM "{table}";')
        latest = cur.fetchone()[0]
        cur.close()
    except Exception as e:
        logger.warning(f"Could not read latest date from {db}.{table}: {e}")
        latest = None
    finally:
        conn.close()

    if latest is None:
        return fallback
    latest_date = datetime(latest.year, latest.month, latest.day)
    _LATEST_DATE_CACHE[key] = (time.time(), latest_date)
    return latest_date

# Every connection gets a server-side statement timeout, so a heavy query that nobody waits for any
# more (page closed, filter changed) is cancelled by Postgres instead of holding the DB and a worker.
_PG_OPTIONS = f"-c statement_timeout={max(1, settings.DB_STATEMENT_TIMEOUT_SEC) * 1000}"


class _Pool:
    """Small idle pool: close() on a borrowed connection hands it back instead of closing it."""
    def __init__(self, name: str, max_idle: int = 8, max_idle_sec: int = 120):
        self.name = name
        self.max_idle = max_idle
        self.max_idle_sec = max_idle_sec  # drop connections idle longer than this (server/NAT may have cut them)
        self.idle: list = []  # [(connection, returned_at_epoch)]
        self.lock = threading.Lock()

    def take(self):
        now = time.time()
        with self.lock:
            while self.idle:
                conn, returned_at = self.idle.pop()
                if not conn.closed and now - returned_at < self.max_idle_sec:
                    return _PooledConnection(conn, self)
                conn.close()
        return None

    def give_back(self, conn):
        with self.lock:
            if len(self.idle) < self.max_idle:
                self.idle.append((conn, time.time()))
                return
        conn.close()


class _PooledConnection:
    """Wraps a psycopg2 connection; close() hands it back to its idle pool instead of closing it."""
    def __init__(self, conn, pool: "_Pool"):
        self._conn = conn
        self._pool = pool

    def __getattr__(self, name):
        return getattr(self._conn, name)

    def close(self):
        conn, self._conn = self._conn, None
        if conn is None or conn.closed:
            return
        try:
            conn.rollback()  # end the read transaction before reuse
        except Exception:
            conn.close()
            return
        self._pool.give_back(conn)


# Reusing connections saves ~0.3 s per request on the remote onedb link and the tunnel to twodb
_ONEDB_POOL = _Pool("onedb")
_TWODB_POOL = _Pool("twodb")

# When the LAN host did not answer, skip it for a while instead of paying its 1 s timeout on every request
_TWODB_LAN_RETRY_SEC = 300
_twodb_lan_failed_at = 0.0


def get_twodb_connection(timeout: int = 12):
    """
    Connects to TwoDb, reusing an idle pooled connection when possible.
    Priority 1: Direct LAN host (fast when on the office LAN, 1 s timeout; skipped for 5 min after a miss)
    Priority 2: Cloudflare Tunnel 127.0.0.1:5434
    """
    global _twodb_lan_failed_at
    pooled = _TWODB_POOL.take()
    if pooled:
        return pooled

    common = dict(dbname=settings.TWODB_DB, user=settings.TWODB_USER, password=settings.TWODB_PASS, options=_PG_OPTIONS)
    if time.time() - _twodb_lan_failed_at >= _TWODB_LAN_RETRY_SEC:
        try:
            conn = psycopg2.connect(host=settings.TWODB_LAN_HOST, port=settings.TWODB_LAN_PORT, connect_timeout=1, **common)
            return _PooledConnection(conn, _TWODB_POOL)
        except Exception:
            _twodb_lan_failed_at = time.time()

    try:
        conn = psycopg2.connect(host=settings.TWODB_TUNNEL_HOST, port=settings.TWODB_TUNNEL_PORT, sslmode="disable",
                                connect_timeout=timeout, **common)
        return _PooledConnection(conn, _TWODB_POOL)
    except Exception as e:
        logger.warning(f"Could not connect to TwoDb via LAN ({settings.TWODB_LAN_HOST}) or Tunnel ({settings.TWODB_TUNNEL_PORT}): {e}")
        return None


def get_onedb_connection(timeout: int = 10):
    """Connect to onedb, reusing an idle pooled connection when possible."""
    pooled = _ONEDB_POOL.take()
    if pooled:
        return pooled
    try:
        conn = psycopg2.connect(
            host=settings.ONEDB_HOST,
            port=settings.ONEDB_PORT,
            dbname=settings.ONEDB_DB,
            user=settings.ONEDB_USER,
            password=settings.ONEDB_PASS,
            connect_timeout=timeout,
            options=_PG_OPTIONS,
        )
        return _PooledConnection(conn, _ONEDB_POOL)
    except Exception as e:
        logger.warning(f"OneDb unreachable on {settings.ONEDB_HOST}:{settings.ONEDB_PORT}: {e}")
        return None

def get_onedb_rw_connection(timeout: int = 10):
    """Connect to onedb with the write role (ONEDB_RW_USER) for the Cluster Monitoring tables. Not pooled."""
    if not settings.ONEDB_RW_USER:
        raise RuntimeError("ONEDB_RW_USER is not set in backend/.env, so clusters cannot be saved.")
    return psycopg2.connect(
        host=settings.ONEDB_HOST,
        port=settings.ONEDB_PORT,
        dbname=settings.ONEDB_DB,
        user=settings.ONEDB_RW_USER,
        password=settings.ONEDB_RW_PASS,
        connect_timeout=timeout,
        options=_PG_OPTIONS,
    )

def _ping(conn) -> bool:
    """A pooled connection may have been cut by the server or NAT: check it really answers."""
    try:
        cur = conn.cursor()
        cur.execute("SELECT 1")
        cur.close()
        return True
    except Exception:
        try:
            conn._conn.close() if isinstance(conn, _PooledConnection) else conn.close()
        except Exception:
            pass
        return False

def check_db_health() -> Dict[str, Any]:
    """Check connectivity to TwoDb and OneDb."""
    twodb_ok = False
    connected_target = None
    
    conn = get_twodb_connection(timeout=5)
    if conn:
        twodb_ok = _ping(conn)
        if twodb_ok:
            connected_target = {k: v for k, v in conn.get_dsn_parameters().items() if k in ("host", "port", "dbname")}
        conn.close()

    onedb_ok = False
    conn_one = get_onedb_connection(timeout=5)
    if conn_one:
        onedb_ok = _ping(conn_one)
        conn_one.close()

    return {
        "twodb_connected": twodb_ok,
        "onedb_connected": onedb_ok,
        "target": connected_target,
        "status": f"TwoDb: {'Online' if twodb_ok else 'Offline'} | OneDb: {'Online' if onedb_ok else 'Offline'}"
    }
