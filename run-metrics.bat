@echo off
echo Starting metrics collection every 20 seconds...
echo Press Ctrl+C to stop

cd /d "C:\Users\vison\open-nof1.ai"

:loop
echo [%time%] Collecting metrics...
curl -X POST http://localhost:3000/api/cron/20-seconds-metrics-interval -H "Authorization: Bearer cron_job_secret_key_change_in_production"
echo.
timeout /t 20 /nobreak >nul
goto loop