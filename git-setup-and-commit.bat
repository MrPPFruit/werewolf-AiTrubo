@echo off
echo ========================================
echo   Werewolf Turbo - Git 提交脚本
echo ========================================
echo.

echo [1/6] 初始化 Git 仓库...
git init
if %ERRORLEVEL% NEQ 0 (
    echo [错误] Git 初始化失败
    echo 请确保已重启终端后再运行此脚本
    pause
    exit /b 1
)
echo.

echo [2/6] 配置 Git 用户信息...
git config user.name "Werewolf Turbo Developer"
git config user.email "dev@werewolf-turbo.local"
echo.

echo [3/6] 添加文件到暂存区...
git add .
echo.

echo [4/6] 查看将要提交的文件...
git status --short
echo.

echo [5/6] 创建提交...
git commit -m "feat: Complete Werewolf Turbo game assistant" -m "" -m "Features:" -m "- Game state management with role tracking" -m "- AI analysis and probability calculations" -m "- Real-time speech recognition with audio detection" -m "- Microphone permission request system" -m "- Electron desktop app support" -m "- Multiple game presets" -m "- Player marking and relationship tracking" -m "- Win rate analysis and danger alerts"
echo.

echo [6/6] 检查提交状态...
git log --oneline -1
echo.

echo ========================================
echo   本地提交完成！
echo ========================================
echo.
echo 下一步操作:
echo.
echo 1. 在 GitHub 创建新仓库: https://github.com/new
echo    仓库名: werewolf-turbo
echo.
echo 2. 关联远程仓库:
echo    git remote add origin https://github.com/YOUR_USERNAME/werewolf-turbo.git
echo.
echo 3. 推送到 GitHub:
echo    git branch -M main
echo    git push -u origin main
echo.
echo 详细说明请查看 GIT_SETUP_GUIDE.md
echo.
pause
