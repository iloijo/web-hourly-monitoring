import psycopg2
import logging
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

def get_onedb_connection(timeout: int = 10):
    """Connect to onedb (187.127.124.130:5432)."""
    try:
        conn = psycopg2.connect(
            host=settings.ONEDB_HOST,
            port=settings.ONEDB_PORT,
            dbname=settings.ONEDB_DB,
            user=settings.ONEDB_USER,
            password=settings.ONEDB_PASS,
            connect_timeout=timeout
        )
        return conn
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
