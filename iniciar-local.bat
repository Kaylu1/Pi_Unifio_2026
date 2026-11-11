@echo off
cd /d "%~dp0"
node -e "process.exit(Number(process.versions.node.split('.')[0]) === 24 ? 0 : 1)"
if errorlevel 1 (
  echo Instale o Node.js 24 para executar o OScar.
  pause
  exit /b 1
)
call npm.cmd start
pause
