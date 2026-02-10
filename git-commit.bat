@echo off
echo 正在提交到 Git...
echo.

"C:\Program Files\Git\cmd\git.exe" init
"C:\Program Files\Git\cmd\git.exe" config user.name "Werewolf Turbo Developer"
"C:\Program Files\Git\cmd\git.exe" config user.email "developer@werewolf-turbo.local"
"C:\Program Files\Git\cmd\git.exe" add .
"C:\Program Files\Git\cmd\git.exe" commit -m "feat: Complete Werewolf Turbo game assistant

- Game state management with role tracking
- AI analysis and probability calculations  
- Real-time speech recognition with audio detection
- Microphone permission request system
- Electron desktop app support
- Multiple game presets
- Player marking and relationship tracking
- Win rate analysis and danger alerts"

echo.
echo ========================================
echo 本地提交完成！
echo ========================================
echo.
echo 下一步: 在 GitHub 创建仓库后运行
echo git remote add origin YOUR_REPO_URL
echo git branch -M main
echo git push -u origin main
echo.
pause
