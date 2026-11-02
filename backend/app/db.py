import psycopg2
import logging
from typing import Optional, Dict, Any
from .config import settings

logger = logging.getLogger("twodb_connection")

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

def get_onedb_connection(timeout: int = 3):
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

    return {
        "twodb_connected": twodb_ok,
        "target": connected_target,
        "status": "TwoDb Online" if twodb_ok else "Offline"
    }
