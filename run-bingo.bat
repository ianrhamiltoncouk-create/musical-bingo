@echo off
TITLE Musical Bingo Runner
echo Terminating any stale Bingo processes...
taskkill /f /im node.exe >nul 2>&1

echo Building latest frontend...
cmd /c "cd client && npm run build"

echo Starting Musical Bingo Server...
start /min cmd /c "cd server && node index.js"

echo Waiting for server to initialize...
timeout /t 3 /nobreak > nul

echo Opening Bingo in your browser...
start http://localhost:3001
start http://localhost:3001/admin

echo Bingo is running!
echo You can close this window. The server is running in the background (minimized) on port 3001.
pause
