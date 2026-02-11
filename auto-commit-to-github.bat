@echo off
@chcp 65001 >nul
setlocal enabledelayedexpansion

echo ========================================
echo   Werewolf Turbo - 自动提交到 GitHub
echo ========================================
echo.

REM 设置 Git 路径
set "GIT=C:\Program Files\Git\cmd\git.exe"

REM 检查 Git 是否存在
if not exist "%GIT%" (
    echo [错误] 未找到 Git，请确保 Git 已安装
    pause
    exit /b 1
)

echo [1/8] 初始化 Git 仓库...
"%GIT%" init
if %ERRORLEVEL% NEQ 0 (
    echo [错误] Git 初始化失败
    pause
    exit /b 1
)
echo ✓ 完成
echo.

echo [2/8] 配置 Git 用户信息...
"%GIT%" config user.name "Werewolf Turbo Developer"
"%GIT%" config user.email "dev@werewolf-turbo.local"
echo ✓ 完成
echo.

echo [3/8] 添加文件到暂存区...
"%GIT%" add .
echo ✓ 完成
echo.

echo [4/8] 创建提交...
"%GIT%" commit -m "feat: Complete Werewolf Turbo game assistant" -m "" -m "Features:" -m "- Game state management" -m "- AI analysis and probability calculations" -m "- Real-time speech recognition" -m "- Microphone permission system" -m "- Electron desktop app support" -m "- Multiple game presets" -m "- Player marking and tracking" -m "- Win rate analysis"
if %ERRORLEVEL% NEQ 0 (
    echo [错误] 提交失败
    pause
    exit /b 1
)
echo ✓ 完成
echo.

echo [5/8] 请输入您的 GitHub 信息
echo.
set /p GITHUB_USER="GitHub 用户名: "
set /p REPO_NAME="仓库名称 (默认: werewolf-turbo): "

if "%REPO_NAME%"=="" set "REPO_NAME=werewolf-turbo"

echo.
echo [6/8] 添加远程仓库...
"%GIT%" remote add origin https://github.com/%GITHUB_USER%/%REPO_NAME%.git
if %ERRORLEVEL% NEQ 0 (
    echo [警告] 远程仓库可能已存在，尝试更新...
    "%GIT%" remote set-url origin https://github.com/%GITHUB_USER%/%REPO_NAME%.git
)
echo ✓ 完成
echo.

echo [7/8] 设置主分支...
"%GIT%" branch -M main
echo ✓ 完成
echo.

echo [8/8] 推送到 GitHub...
echo.
echo 提示: 如果仓库不存在，请先在 GitHub 创建:
echo https://github.com/new
echo.
echo 如果需要输入密码，请使用 Personal Access Token
echo (不是 GitHub 密码)
echo.
pause

"%GIT%" push -u origin main

if %ERRORLEVEL% EQU 0 (
    echo.
    echo ========================================
    echo   ✓ 成功推送到 GitHub!
    echo ========================================
    echo.
    echo 仓库地址: https://github.com/%GITHUB_USER%/%REPO_NAME%
    echo.
) else (
    echo.
    echo ========================================
    echo   ✗ 推送失败
    echo ========================================
    echo.
    echo 可能的原因:
    echo 1. 仓库不存在 - 请先在 GitHub 创建仓库
    echo 2. 认证失败 - 请使用 Personal Access Token
    echo 3. 网络问题 - 检查网络连接
    echo.
    echo 创建 Personal Access Token:
    echo https://github.com/settings/tokens
    echo.
)

pause
