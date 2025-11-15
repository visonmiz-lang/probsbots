@echo off
echo Starting ALL cron jobs...
echo - Metrics: every 20 seconds
echo - Trading: every 3 minutes
echo Press Ctrl+C to stop all

cd /d "C:\Users\vison\open-nof1.ai"

start "Metrics Collector" cmd /c "run-metrics.bat"
timeout /t 5 /nobreak >nul
start "Trading Bot" cmd /c "run-trading.bat"

echo Both services started in separate windows
echo Main window can be closed
pause