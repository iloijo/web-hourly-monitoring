import os
from pathlib import Path
from dotenv import load_dotenv
from pydantic import BaseModel

# Credentials live in backend/.env (git-ignored). See backend/.env.example.
load_dotenv(Path(__file__).resolve().parent.parent / ".env")

class Settings(BaseModel):
    # TwoDb connection candidates:
    # 1. Local LAN IP (192.168.1.231:5432) - ultra fast direct LAN when on-site
    # 2. Local tunnel port (127.0.0.1:5434) - Cloudflare tunnel (always IPv4 127.0.0.1)
    TWODB_LAN_HOST: str = os.getenv("TWODB_LAN_HOST", "192.168.1.231")
    TWODB_LAN_PORT: int = int(os.getenv("TWODB_LAN_PORT", "5432"))

    TWODB_TUNNEL_HOST: str = os.getenv("TWODB_TUNNEL_HOST", "127.0.0.1")
    TWODB_TUNNEL_PORT: int = int(os.getenv("TWODB_TUNNEL_PORT", "5434"))

    TWODB_DB: str = os.getenv("TWODB_DB", "twodb")
    TWODB_USER: str = os.getenv("TWODB_USER", "")
    TWODB_PASS: str = os.getenv("TWODB_PASS", "")

    # OneDb (187.127.124.130:5432)
    ONEDB_HOST: str = os.getenv("ONEDB_HOST", "187.127.124.130")
    ONEDB_PORT: int = int(os.getenv("ONEDB_PORT", "5432"))
    ONEDB_DB: str = os.getenv("ONEDB_DB", "onedb")
    ONEDB_USER: str = os.getenv("ONEDB_USER", "")
    ONEDB_PASS: str = os.getenv("ONEDB_PASS", "")

    # Dashboard login (HTTP Basic). Login is required when both are set.
    DASHBOARD_USER: str = os.getenv("DASHBOARD_USER", "")
    DASHBOARD_PASS: str = os.getenv("DASHBOARD_PASS", "")

settings = Settings()
