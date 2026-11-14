@echo off
chcp 65001 >nul
title WINDOWSTELECOM - Subir AtlasIQ v4.0 a GitHub y Cloudflare
cd /d "%~dp0"
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0deploy-cloud.ps1"
echo.
pause
