@echo off
echo Starting trading every 3 minutes...
echo Press Ctrl+C to stop

cd /d "C:\Users\vison\open-nof1.ai"

:loop
echo [%time%] Executing trading...
curl -X POST http://localhost:3000/api/cron/3-minutes-run-interval -H "Authorization: Bearer cron_job_secret_key_change_in_production"
echo.
timeout /t 180 /nobreak >nul
goto loop