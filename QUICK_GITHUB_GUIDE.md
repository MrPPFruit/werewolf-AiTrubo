# 快速提交到 GitHub 指南

## 问题说明
Git 已安装但需要**重启系统或注销重新登录**后才能在命令行中使用。

## 最简单的方法：使用 GitHub Desktop

### 下载并安装 GitHub Desktop
1. 访问：https://desktop.github.com/
2. 下载并安装
3. 使用 GitHub 账号登录

### 提交步骤
1. 打开 GitHub Desktop
2. 点击 **File** → **Add Local Repository**
3. 选择项目文件夹：
   ```
   c:\Users\PPG\.gemini\antigravity\scratch\werewolf-turbo
   ```
4. 点击 **Publish repository**
5. 填写信息：
   - Name: `werewolf-turbo`
   - Description: `AI-powered Werewolf game assistant`
   - 选择 Public 或 Private
6. 点击 **Publish repository**

✅ 完成！您的代码已上传到 GitHub

---

## 方法 2：命令行（需要重启后）

### 步骤 1：重启电脑或注销重新登录

### 步骤 2：打开新终端并执行

```bash
# 进入项目目录
cd c:\Users\PPG\.gemini\antigravity\scratch\werewolf-turbo

# 初始化仓库
git init

# 配置用户信息（替换为您的信息）
git config user.name "Your Name"
git config user.email "your.email@example.com"

# 添加文件
git add .

# 创建提交
git commit -m "feat: Complete Werewolf Turbo game assistant"

# 在 GitHub 创建仓库后，添加远程地址（替换 YOUR_USERNAME）
git remote add origin https://github.com/YOUR_USERNAME/werewolf-turbo.git

# 推送
git branch -M main
git push -u origin main
```

### 步骤 3：创建 GitHub 仓库

1. 访问：https://github.com/new
2. Repository name: `werewolf-turbo`
3. Description: `AI-powered Werewolf game assistant with Electron support`
4. 选择 Public 或 Private
5. **不要**勾选 "Initialize this repository with a README"
6. 点击 **Create repository**

### 步骤 4：获取 Personal Access Token（如果需要）

如果推送时要求密码：

1. 访问：https://github.com/settings/tokens
2. 点击 **Generate new token (classic)**
3. Note: `Werewolf Turbo`
4. 勾选 `repo` 权限
5. 点击 **Generate token**
6. **复制 token**（只显示一次！）
7. 推送时使用 token 作为密码

---

## 验证

提交成功后，访问您的 GitHub 仓库：
```
https://github.com/YOUR_USERNAME/werewolf-turbo
```

应该能看到所有项目文件！

---

## 项目文件清单

✅ 已包含的重要文件：
- `README.md` - 项目说明
- `package.json` - 依赖配置
- `app/` - Next.js 应用代码
- `electron/` - Electron 桌面应用
- `.gitignore` - Git 忽略配置
- `start-electron.bat` - 桌面应用启动脚本
- `start-browser.bat` - 浏览器版启动脚本

---

## 推荐：GitHub Desktop

如果您不熟悉命令行，**强烈推荐使用 GitHub Desktop**：
- ✅ 图形化界面，简单易用
- ✅ 自动处理认证
- ✅ 可视化查看更改
- ✅ 一键推送

下载地址：https://desktop.github.com/
