@echo off
cd /d "%~dp0"
node scripts/mysql-local.mjs start
if errorlevel 1 pause
