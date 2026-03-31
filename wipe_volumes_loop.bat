@echo off
TITLE Docker Auto-Wipe (30 mins)
echo ==================================================
echo DesignDC Docker Volume Auto-Wiper
echo Will destroy and recreate all volumes every 30 min.
echo ==================================================

:loop
echo [%time%] Wiping all project volumes...
cd /d "%~dp0"

:: Drop all containers and volumes
docker compose down -v

:: Restart the stack in the background
docker compose up -d

echo.
echo [%time%] Stack refreshed. Waiting 30 minutes...
echo (Press CTRL+C to stop this loop)
:: 1800 seconds = 30 minutes
timeout /t 1800 /nobreak
echo.
goto loop
