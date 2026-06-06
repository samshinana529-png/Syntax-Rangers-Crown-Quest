@echo off
REM Crown Quest Multiplayer Server Startup Script
REM Run this file to start the server on Windows

echo ========================================
echo Crown Quest - Multiplayer Server
echo ========================================
echo.
echo Starting server on port 3000...
echo.
echo Share your IP address with friends:
ipconfig | findstr "IPv4"
echo.
echo Press Ctrl+C to stop the server
echo.

node server.js
