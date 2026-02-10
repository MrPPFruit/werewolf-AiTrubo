@echo off
echo ========================================
echo   Werewolf Turbo - 浏览器版启动器
echo ========================================
echo.

REM 设置 Node.js 路径
set PATH=%PATH%;C:\Program Files\nodejs

echo [信息] 正在启动 Next.js 开发服务器...
echo.
echo 启动后请访问: http://localhost:3000
echo 按 Ctrl+C 可停止服务器
echo.

REM 启动 Next.js 开发服务器
npm run dev
