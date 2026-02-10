@echo off
echo ========================================
echo   Werewolf Turbo - 桌面应用启动器
echo ========================================
echo.

REM 设置 Node.js 路径
set PATH=%PATH%;C:\Program Files\nodejs

REM 检查 Node.js 是否可用
where node >nul 2>nul
if %ERRORLEVEL% NEQ 0 (
    echo [错误] 未找到 Node.js，请确保已安装 Node.js
    pause
    exit /b 1
)

echo [信息] 正在启动 Electron 桌面应用...
echo.
echo 提示：
echo - Next.js 开发服务器将在 http://localhost:3000 启动
echo - Electron 窗口将自动打开
echo - 按 Ctrl+C 可停止应用
echo.

REM 启动 Electron 开发模式
npm run electron:dev
