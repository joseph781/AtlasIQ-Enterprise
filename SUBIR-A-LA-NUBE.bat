@echo off
title WINDOWSTELECOM - Subir AtlasIQ v4.0 a GitHub y Cloudflare
cd /d "%~dp0"
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0deploy-cloud.ps1"
echo.
pause
