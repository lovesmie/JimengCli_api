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
if %errorlevel% neq 0 (
    echo [!] 未检测到 Node.js，正在自动下载安装 v22 LTS...
    powershell -NoProfile -Command "Invoke-WebRequest -Uri 'https://nodejs.org/dist/v22.15.0/node-v22.15.0-x64.msi' -OutFile '%TEMP%\node-lts.msi' -UseBasicParsing"
    if not exist "%TEMP%\node-lts.msi" (
        echo [错误] 下载失败，请手动安装 Node.js：https://nodejs.org
        pause
        exit /b 1
    )
    echo [→] 正在静默安装 Node.js，请稍候...
    msiexec /i "%TEMP%\node-lts.msi" /qn /norestart
    del "%TEMP%\node-lts.msi" >nul 2>&1
    :: 安装完直接把默认路径加进当前 PATH
    set "PATH=%NODE_DEFAULT%;%PATH%"
    node --version >nul 2>&1
    if %errorlevel% neq 0 (
        echo [错误] 安装后仍无法识别 Node.js，请重启电脑后再运行 start.bat
        pause
        exit /b 1
    )
    echo [✓] Node.js 安装完成
)
for /f "tokens=*" %%v in ('node --version') do set NODE_VER=%%v
echo [✓] Node.js %NODE_VER%

:: ── 2. 初始化/迁移数据库 ─────────────────────
echo [→] 初始化数据库...
cd /d "%~dp0"
call node_modules\.bin\prisma migrate deploy >nul 2>&1
if %errorlevel% neq 0 (
    echo [!] 迁移失败，尝试 db push...
    call node_modules\.bin\prisma db push >nul 2>&1
)
echo [✓] 数据库就绪

:: ── 3. 启动服务 ──────────────────────────────
echo.
echo ============================================
cd /d "%~dp0"
call npm start
pause
