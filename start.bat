@echo off
chcp 65001 >nul
title 即梦 OpenAI 调度服务

echo ============================================
echo   即梦 OpenAI API 调度服务 - 一键启动
echo ============================================
echo.

:: ── 1. 检查 Node.js，没有就自动下载安装 ────────
set "NODE_DEFAULT=C:\Program Files\nodejs"
if exist "%NODE_DEFAULT%\node.exe" set "PATH=%NODE_DEFAULT%;%PATH%"

node --version >nul 2>&1
if %errorlevel% equ 0 goto NODE_INSTALLED

echo [!] 未检测到 Node.js，正在自动下载安装 v22 LTS...
powershell -NoProfile -Command "Invoke-WebRequest -Uri 'https://nodejs.org/dist/v22.15.0/node-v22.15.0-x64.msi' -OutFile '%TEMP%\node-lts.msi' -UseBasicParsing"
if exist "%TEMP%\node-lts.msi" goto INSTALL_NODE

echo [错误] 下载失败，请手动安装 Node.js：https://nodejs.org
pause
exit /b 1

:INSTALL_NODE
echo [→] 正在静默安装 Node.js，请稍候...
msiexec /i "%TEMP%\node-lts.msi" /qn /norestart
del "%TEMP%\node-lts.msi" >nul 2>&1
:: 安装完直接把默认路径加进当前 PATH
set "PATH=%NODE_DEFAULT%;%PATH%"
node --version >nul 2>&1
if %errorlevel% equ 0 goto NODE_INSTALLED

echo [错误] 安装后仍无法识别 Node.js，请重启电脑后再运行 start.bat
pause
exit /b 1

:NODE_INSTALLED
for /f "tokens=*" %%v in ('node --version') do set NODE_VER=%%v
echo [✓] Node.js %NODE_VER%

:: ── 1.5 自动下载最新版即梦 CLI ─────────────────────
echo [→] 检查官方即梦 CLI 是否存在...
if exist "%~dp0bin\dreamina.exe" goto CLI_READY

echo [!] 未检测到即梦 CLI (dreamina.exe)，正在从官方自动下载...
if not exist "%~dp0bin" mkdir "%~dp0bin"
powershell -NoProfile -Command "Invoke-WebRequest -Uri 'https://sf3-cn.feishucdn.com/obj/ies-hotsoon-draft/dreamina_installer/dreamina.exe' -OutFile '%~dp0bin\dreamina.exe' -UseBasicParsing"
if exist "%~dp0bin\dreamina.exe" goto CLI_READY

echo [错误] 即梦 CLI 下载失败，请手动前往官方文档获取并放入 bin 目录。
pause
exit /b 1

:CLI_READY
echo [✓] 即梦 CLI 已就绪

:: ── 2. 初始化/迁移数据库 ─────────────────────
echo [→] 初始化数据库...
cd /d "%~dp0"
call npx prisma migrate deploy >nul 2>&1
if %errorlevel% equ 0 goto DB_READY

echo [!] 迁移失败，尝试 db push...
call npx prisma db push >nul 2>&1

:DB_READY
echo [✓] 数据库就绪

:: ── 3. 启动服务 ──────────────────────────────
echo.
echo ============================================
cd /d "%~dp0"
call npm start
echo [!] 服务已停止运行
pause
