@echo off
chcp 65001 >nul
title 即梦 - 强制重新构建

echo [→] 清理旧构建产物...
if exist "%~dp0dist" rmdir /s /q "%~dp0dist"
if exist "%~dp0frontend\dist" rmdir /s /q "%~dp0frontend\dist"

echo [→] 重新构建前端...
cd /d "%~dp0frontend"
call npm run build
if %errorlevel% neq 0 ( echo [错误] 前端构建失败 & pause & exit /b 1 )

echo [→] 重新编译后端...
cd /d "%~dp0"
call npm run build
if %errorlevel% neq 0 ( echo [错误] 后端编译失败 & pause & exit /b 1 )

echo.
echo [✓] 重新构建完成，请运行 start.bat 启动
pause
