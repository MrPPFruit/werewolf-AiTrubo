# Electron 桌面应用麦克风权限修复

## 问题
Electron 桌面应用模式下无法使用麦克风录音。

## 原因
Electron 默认不自动授予媒体设备（麦克风/摄像头）权限，需要在主进程中显式配置。

## 解决方案

### 已修改文件：`electron/main.js`

1. **添加 webPreferences 配置**
   ```javascript
   webPreferences: {
       sandbox: false,  // 禁用沙箱以允许媒体访问
   }
   ```

2. **添加权限请求处理器**
   ```javascript
   mainWindow.webContents.session.setPermissionRequestHandler((webContents, permission, callback) => {
       const allowedPermissions = ['media', 'microphone', 'audioCapture'];
       if (allowedPermissions.includes(permission)) {
           callback(true); // 自动批准麦克风权限
       } else {
           callback(false);
       }
   });
   ```

## 如何测试

1. **重启 Electron 应用**
   ```bash
   # 停止当前运行的应用（Ctrl+C）
   # 重新启动
   .\start-electron.bat
   ```

2. **测试麦克风**
   - 点击任意玩家的麦克风图标
   - 观察音量条是否有波动
   - 说话测试是否有实时转录

## Windows 系统权限

如果仍然无法使用麦克风，请检查 Windows 系统设置：

1. **打开设置** → **隐私和安全性** → **麦克风**
2. 确保 **"允许应用访问麦克风"** 已开启
3. 向下滚动，找到并允许 **Electron** 或 **Node.js** 访问麦克风

## 浏览器版本对比

- **桌面版（Electron）**：现在应该可以正常使用麦克风
- **浏览器版**：需要手动点击浏览器的"允许"按钮授予麦克风权限

## 调试技巧

如果麦克风仍然不工作：

1. **打开开发者工具**（Electron 窗口中按 F12）
2. 查看 Console 是否有错误信息
3. 检查是否有 `[Audio]` 相关的日志
4. 确认看到 `[Audio] Using Web Speech API (microphone)` 日志

## 下一步

如果需要捕获系统音频（而非麦克风），需要：
1. 安装额外的 Node.js 音频库（`node-record-lpcm16`）
2. 配置 Google Cloud Speech API
3. 使用 `electron/audio.js` 中的系统音频捕获功能
