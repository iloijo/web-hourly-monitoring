@echo off
setlocal enabledelayedexpansion

:: Pastikan working directory selalu berada di folder project
cd /d "%~dp0"

title netPulse — Network KPI Monitoring Dashboard
echo ============================================================
echo   Starting netPulse Monitoring Dashboard
echo   Architecture: FastAPI Backend + React / ECharts Frontend
echo ============================================================
echo.

:: 1. Periksa koneksi Cloudflare tunnel ke TwoDb di port 5434
echo [1/3] Memeriksa koneksi Cloudflare tunnel TwoDb di localhost:5434...
powershell -NoProfile -ExecutionPolicy Bypass -Command "if (Get-NetTCPConnection -LocalPort 5434 -ErrorAction SilentlyContinue) { exit 0 } else { exit 1 }" >nul 2>&1
if %ERRORLEVEL% EQU 0 (
    echo       [OK] Tunnel TwoDb sudah aktif di localhost:5434.
    goto :tunnel_done
)

echo       [INFO] Menyalakan Cloudflare tunnel ke TwoDb port 5434...
start "TwoDb_Cloudflare_Tunnel_5434" /min cloudflared access tcp --hostname tinfra-svr-hy.hijr.win --url localhost:5434
powershell -NoProfile -Command "Start-Sleep -Seconds 3" >nul 2>&1
echo       [OK] Cloudflare tunnel TwoDb telah dijalankan di background.

:tunnel_done

:: 2. Buka browser otomatis
echo.
echo [2/3] Membuka browser: http://localhost:8000
start http://localhost:8000

:: 3. Jalankan FastAPI Backend
echo.
echo [3/3] Menjalankan Backend Server Uvicorn...
echo.
python -m uvicorn backend.app.main:app --host 0.0.0.0 --port 8000
if %ERRORLEVEL% NEQ 0 (
    echo.
    echo [INFO] Mencoba menjalankan langsung via uvicorn.exe...
    uvicorn backend.app.main:app --host 0.0.0.0 --port 8000
)

pause
