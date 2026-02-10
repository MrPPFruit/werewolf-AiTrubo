# Git 提交指南

## 问题说明
Git 已成功安装，但需要**重启终端**才能使用。当前终端无法识别 Git 命令。

## 解决方案

### 方式 1：使用批处理脚本（推荐）

1. **关闭当前终端**
2. **打开新的 PowerShell 或 CMD 窗口**
3. **进入项目目录**：
   ```bash
   cd c:\Users\PPG\.gemini\antigravity\scratch\werewolf-turbo
   ```
4. **运行提交脚本**：
   ```bash
   .\git-setup-and-commit.bat
   ```

### 方式 2：手动执行命令

打开新终端后，依次执行以下命令：

```bash
# 进入项目目录
cd c:\Users\PPG\.gemini\antigravity\scratch\werewolf-turbo

# 初始化 Git 仓库
git init

# 配置用户信息
git config user.name "Your Name"
git config user.email "your.email@example.com"

# 添加所有文件
git add .

# 创建提交
git commit -m "feat: Complete Werewolf Turbo game assistant

Features:
- Game state management with role tracking
- AI analysis and probability calculations
- Real-time speech recognition with audio level detection
- Microphone permission request system
- Electron desktop app with system audio support
- Multiple game presets (京城大师赛, 网易狼人杀)
- Player marking and relationship tracking
- Win rate analysis and danger alerts
- Live transcription display
- Responsive UI with dark theme"

# 查看状态
git status
```

## 推送到 GitHub

### 步骤 1：在 GitHub 创建新仓库

1. 访问 https://github.com/new
2. 仓库名称：`werewolf-turbo`
3. 描述：`AI-powered Werewolf game assistant with Electron support`
4. 选择 **Public** 或 **Private**
5. **不要**勾选 "Initialize this repository with a README"
6. 点击 **Create repository**

### 步骤 2：关联远程仓库并推送

GitHub 会显示类似以下的命令，复制并执行：

```bash
git remote add origin https://github.com/YOUR_USERNAME/werewolf-turbo.git
git branch -M main
git push -u origin main
```

**替换 `YOUR_USERNAME` 为您的 GitHub 用户名！**

## 使用 GitHub Desktop（更简单）

如果您安装了 GitHub Desktop：

1. 打开 GitHub Desktop
2. File → Add Local Repository
3. 选择项目文件夹：`c:\Users\PPG\.gemini\antigravity\scratch\werewolf-turbo`
4. 点击 "Publish repository"
5. 选择仓库名称和可见性
6. 点击 "Publish"

## 验证

提交成功后，您应该能在 GitHub 上看到：
- ✅ 所有项目文件
- ✅ README.md
- ✅ package.json
- ✅ 完整的提交历史

## 后续更新

以后修改代码后，使用以下命令提交：

```bash
git add .
git commit -m "描述您的更改"
git push
```

## 常见问题

### Q: 提示 "git 不是内部或外部命令"
**A:** 需要重启终端。Git 安装后必须重新打开终端才能使用。

### Q: 推送时要求输入用户名密码
**A:** GitHub 已不支持密码认证，需要使用 Personal Access Token：
1. GitHub → Settings → Developer settings → Personal access tokens
2. Generate new token (classic)
3. 勾选 `repo` 权限
4. 复制 token 并在推送时使用 token 作为密码

### Q: 推送失败 "remote: Repository not found"
**A:** 检查远程仓库 URL 是否正确：
```bash
git remote -v
git remote set-url origin https://github.com/YOUR_USERNAME/werewolf-turbo.git
```

---

**已创建的文件：**
- `.gitignore` - Git 忽略文件配置
- `git-setup-and-commit.bat` - 自动化提交脚本

**下一步：** 重启终端后运行 `git-setup-and-commit.bat`
