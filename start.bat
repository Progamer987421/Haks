@echo off
title AppleMC Bot Manager
echo Starting AppleMC Bot Manager...
echo.

:: Check Node is installed
node --version >nul 2>&1
if %errorlevel% neq 0 (
    echo ERROR: Node.js is not installed.
    echo Download it from https://nodejs.org ^(LTS version^)
    echo.
    pause
    exit /b
)

:: Install deps if missing
if not exist "node_modules\" (
    echo Installing dependencies...
    npm install
    if %errorlevel% neq 0 (
        echo.
        echo ERROR: npm install failed. See above.
        pause
        exit /b
    )
    echo.
)

echo Server starting... open http://localhost:3000 in your browser
echo.
node index.js 2>&1
echo.
echo Server stopped. See error above if unexpected.
pause
