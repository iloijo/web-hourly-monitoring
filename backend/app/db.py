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
    conn = get_twodb_connection(timeout=5) if db == "twodb" else get_onedb_connection(timeout=5)
    if not conn:
        return fallback
    try:
        cur = conn.cursor()
        cur.execute(f'SELECT MAX("Begin Time") FROM "{table}";')
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

def get_twodb_connection(timeout: int = 12):
    """
    Connects to TwoDb.
    Priority 1: Direct LAN IP 192.168.1.231:5432 (blazing fast, ~0.08s when on local LAN)
    Priority 2: Cloudflare Tunnel 127.0.0.1:5434 (robust fallback, timeout=12s)
    """
    # Try 1: Local LAN IP (192.168.1.231:5432) with 1s timeout
    try:
        conn = psycopg2.connect(
            host=settings.TWODB_LAN_HOST,
            port=settings.TWODB_LAN_PORT,
            dbname=settings.TWODB_DB,
            user=settings.TWODB_USER,
            password=settings.TWODB_PASS,
            connect_timeout=1
        )
        return conn
    except Exception:
        pass

    # Try 2: Cloudflare Tunnel 127.0.0.1:5434
    try:
        conn = psycopg2.connect(
            host=settings.TWODB_TUNNEL_HOST,
            port=settings.TWODB_TUNNEL_PORT,
            dbname=settings.TWODB_DB,
            user=settings.TWODB_USER,
            password=settings.TWODB_PASS,
            sslmode="disable",
            connect_timeout=timeout
        )
        return conn
    except Exception as e:
        logger.warning(f"Could not connect to TwoDb via LAN ({settings.TWODB_LAN_HOST}) or Tunnel ({settings.TWODB_TUNNEL_PORT}): {e}")
        return None

class _PooledConnection:
    """Wraps a psycopg2 connection; close() hands it back to the idle pool instead of closing it."""
    def __init__(self, conn):
        self._conn = conn

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
        with _ONEDB_POOL_LOCK:
            if len(_ONEDB_IDLE) < _ONEDB_POOL_MAX_IDLE:
                _ONEDB_IDLE.append((conn, time.time()))
                return
        conn.close()

# Reusing connections saves ~0.3 s per request on the remote onedb link
_ONEDB_IDLE: list = []  # [(connection, returned_at_epoch)]
_ONEDB_POOL_LOCK = threading.Lock()
_ONEDB_POOL_MAX_IDLE = 8
_ONEDB_MAX_IDLE_SEC = 120  # drop connections idle longer than this (server/NAT may have cut them)

def get_onedb_connection(timeout: int = 10):
    """Connect to onedb (187.127.124.130:5432), reusing an idle pooled connection when possible."""
    now = time.time()
    with _ONEDB_POOL_LOCK:
        while _ONEDB_IDLE:
            conn, returned_at = _ONEDB_IDLE.pop()
            if not conn.closed and now - returned_at < _ONEDB_MAX_IDLE_SEC:
                return _PooledConnection(conn)
            conn.close()
    try:
        conn = psycopg2.connect(
            host=settings.ONEDB_HOST,
            port=settings.ONEDB_PORT,
            dbname=settings.ONEDB_DB,
            user=settings.ONEDB_USER,
            password=settings.ONEDB_PASS,
            connect_timeout=timeout
        )
        return _PooledConnection(conn)
    except Exception as e:
        logger.warning(f"OneDb unreachable on {settings.ONEDB_HOST}:{settings.ONEDB_PORT}: {e}")
        return None

def check_db_health() -> Dict[str, Any]:
    """Check connectivity to TwoDb and OneDb."""
    twodb_ok = False
    connected_target = None
    
    conn = get_twodb_connection(timeout=5)
    if conn:
        twodb_ok = True
        connected_target = conn.get_dsn_parameters()
        conn.close()

    onedb_ok = False
    conn_one = get_onedb_connection(timeout=5)
    if conn_one:
        onedb_ok = True
        conn_one.close()

    return {
        "twodb_connected": twodb_ok,
        "onedb_connected": onedb_ok,
        "target": connected_target,
        "status": f"TwoDb: {'Online' if twodb_ok else 'Offline'} | OneDb: {'Online' if onedb_ok else 'Offline'}"
    }
