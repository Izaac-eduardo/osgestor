@echo off
title OSGestor - Inicializacao diaria
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0scripts\iniciar-osgestor-exclusao.ps1" -Daily
pause
