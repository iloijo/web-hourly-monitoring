@echo off
title NetKPI 4G Hourly Monitoring Dashboard
echo ============================================================
echo   Starting NetKPI 4G Hourly Monitoring Dashboard
echo   Architecture: FastAPI (Backend) + React / ECharts (Frontend)
echo ============================================================
echo.
echo Local URL: http://localhost:8000
echo.
start http://localhost:8000
python -m uvicorn backend.app.main:app --host 0.0.0.0 --port 8000
pause
