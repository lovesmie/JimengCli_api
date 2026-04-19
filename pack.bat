@echo off
chcp 65001 >nul
title 即梦 - 打包发布版（预构建）

set PACK_DIR=%~dp0_pack_temp
set OUT_ZIP=%~dp0jimengCli_api-v1.0.1-windows-x64.zip

echo ============================================
echo   即梦 OpenAI 调度服务 - 打包发布版
echo ============================================
echo.

:: ── 1. 构建前端 ──────────────────────────────
echo [→] 构建前端...
cd /d "%~dp0frontend"
if not exist "node_modules" call npm install
call npm run build
if %errorlevel% neq 0 ( echo [错误] 前端构建失败 & pause & exit /b 1 )
echo [✓] 前端构建完成

:: ── 2. 构建后端 ──────────────────────────────
echo [→] 编译后端...
cd /d "%~dp0"
call npm run build
if %errorlevel% neq 0 ( echo [错误] 后端编译失败 & pause & exit /b 1 )
echo [✓] 后端编译完成

:: ── 3. 裁剪 dev 依赖（减小体积）────────────
echo [→] 裁剪开发依赖...
cd /d "%~dp0"
call npm prune --omit=dev
if %errorlevel% neq 0 ( echo [错误] 依赖裁剪失败 & pause & exit /b 1 )
echo [✓] 依赖裁剪完成

:: ── 4. 清理旧包 ──────────────────────────────
echo [→] 清理旧包...
if exist "%PACK_DIR%" rmdir /s /q "%PACK_DIR%"
if exist "%OUT_ZIP%" del "%OUT_ZIP%"
mkdir "%PACK_DIR%"

:: ── 5. 复制文件 ──────────────────────────────
echo [→] 复制文件...

:: 编译产物
robocopy "%~dp0dist"              "%PACK_DIR%\dist"              /e /njh /njs /ndl >nul
robocopy "%~dp0frontend\dist"     "%PACK_DIR%\frontend\dist"     /e /njh /njs /ndl >nul

:: 生产 node_modules（直接复制当前裁剪后的）
robocopy "%~dp0node_modules" "%PACK_DIR%\node_modules" /e /njh /njs /ndl >nul

:: Prisma schema + 迁移（运行时迁移需要）
robocopy "%~dp0prisma"            "%PACK_DIR%\prisma"            /e /njh /njs /ndl >nul

:: CLI 可执行文件
robocopy "%~dp0bin"               "%PACK_DIR%\bin"               /e /njh /njs /ndl >nul

:: 配置文件
copy "%~dp0package.json"          "%PACK_DIR%\" >nul
copy "%~dp0start.bat"             "%PACK_DIR%\" >nul
copy "%~dp0README.md"             "%PACK_DIR%\" >nul
copy "%~dp0README_EN.md"          "%PACK_DIR%\" >nul
copy "%~dp0LICENSE"               "%PACK_DIR%\" >nul
if exist "%~dp0test_client.html" copy "%~dp0test_client.html" "%PACK_DIR%\" >nul

:: data 目录：只保留空目录结构和 admin.json
mkdir "%PACK_DIR%\data\accounts" >nul
mkdir "%PACK_DIR%\data\temp_inputs" >nul
if exist "%~dp0data\admin.json" copy "%~dp0data\admin.json" "%PACK_DIR%\data\" >nul

:: temp_uploads 占位
mkdir "%PACK_DIR%\temp_uploads" >nul

:: .env 模板
echo DATABASE_URL="file:../data/jimeng.db" > "%PACK_DIR%\.env"

:: docs（可选）
if exist "%~dp0docs" robocopy "%~dp0docs" "%PACK_DIR%\docs" /e /njh /njs /ndl >nul

:: ── 6. 压缩 ──────────────────────────────────
echo [→] 压缩为 jimengCli_api-v1.0.1-windows-x64.zip...
powershell -NoProfile -Command "Compress-Archive -Path '%PACK_DIR%\*' -DestinationPath '%OUT_ZIP%' -Force"

:: ── 7. 清理临时目录 ──────────────────────────
echo [→] 清理临时文件...
rmdir /s /q "%PACK_DIR%"
:: 恢复开发依赖
echo [→] 恢复开发依赖...
cd /d "%~dp0"
call npm install >nul 2>&1

echo.
echo [✓] 打包完成：jimengCli_api-v1.0.1-windows-x64.zip
echo     解压到目标机器，双击 start.bat 即可直接启动（无需构建）
pause
