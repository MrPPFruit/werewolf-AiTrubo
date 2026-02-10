@echo off
setlocal

echo ========================================
echo   Werewolf Turbo - 推送到 GitHub
echo ========================================
echo.

REM 添加 Git 到 PATH
set "PATH=%PATH%;C:\Program Files\Git\cmd"

echo [1/9] 检查 Git...
git --version
if %ERRORLEVEL% NEQ 0 (
    echo [错误] 无法找到 Git
    pause
    exit /b 1
)
echo.

echo [2/9] 初始化 Git 仓库...
git init
echo.

echo [3/9] 配置 Git 用户信息...
git config user.name "Werewolf Turbo Developer"
git config user.email "dev@werewolf-turbo.local"
echo.

echo [4/9] 添加所有文件...
git add .
echo.

echo [5/9] 创建提交...
git commit -m "feat: Complete Werewolf Turbo game assistant" -m "" -m "Features:" -m "- Game state management with role tracking" -m "- AI analysis and probability calculations" -m "- Real-time speech recognition" -m "- Microphone permission system" -m "- Electron desktop app support" -m "- Multiple game presets" -m "- Player marking and tracking" -m "- Win rate analysis and danger alerts"
echo.

echo [6/9] 请输入您的 GitHub 信息
echo.
set /p GITHUB_USER="GitHub 用户名: "
if "%GITHUB_USER%"=="" (
    echo [错误] 用户名不能为空
    pause
    exit /b 1
)

set /p REPO_NAME="仓库名称 (默认: werewolf-turbo): "
if "%REPO_NAME%"=="" set "REPO_NAME=werewolf-turbo"

echo.
echo [7/9] 添加远程仓库...
git remote add origin https://github.com/%GITHUB_USER%/%REPO_NAME%.git 2>nul
if %ERRORLEVEL% NEQ 0 (
    echo [提示] 远程仓库已存在，更新 URL...
    git remote set-url origin https://github.com/%GITHUB_USER%/%REPO_NAME%.git
)
echo.

echo [8/9] 设置主分支...
git branch -M main
echo.

echo [9/9] 推送到 GitHub...
echo.
echo ========================================
echo   重要提示
echo ========================================
echo.
echo 1. 如果仓库不存在，请先在 GitHub 创建:
echo    https://github.com/new
echo    仓库名: %REPO_NAME%
echo.
echo 2. 推送时需要输入密码，请使用:
echo    Personal Access Token (不是 GitHub 密码)
echo.
echo 3. 创建 Token:
echo    https://github.com/settings/tokens
echo    勾选 'repo' 权限
echo.
pause
echo.

git push -u origin main

if %ERRORLEVEL% EQU 0 (
    echo.
    echo ========================================
    echo   ✓ 成功推送到 GitHub!
    echo ========================================
    echo.
    echo 仓库地址:
    echo https://github.com/%GITHUB_USER%/%REPO_NAME%
    echo.
) else (
    echo.
    echo ========================================
    echo   ✗ 推送失败
    echo ========================================
    echo.
    echo 可能的原因:
    echo 1. 仓库不存在 - 请先创建仓库
    echo 2. 认证失败 - 请使用 Personal Access Token
    echo 3. 网络问题 - 检查网络连接
    echo.
)

pause
