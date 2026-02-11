@echo off
@chcp 65001 >nul
set PATH=%PATH%;C:\Program Files\nodejs
cd /d "%~dp0"
npm install
pause
