@echo off
title Expose netPulse Dashboard to Internet (Cloudflare Tunnel)
echo ============================================================
echo   ONLINEKAN NETPULSE DASHBOARD VIA CLOUDFLARE QUICK TUNNEL
echo   Web URL Lokal: http://localhost:8000
echo ============================================================
echo.
echo Menghubungkan ke Cloudflare Edge...
echo Tunggu beberapa detik hingga URL publik (https://...trycloudflare.com) muncul di bawah.
echo.
cloudflared tunnel --url http://localhost:8000
pause
