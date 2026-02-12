# API Key 配置指南

为了使用更高精度的语音识别 (Qwen3-ASR)，您需要配置阿里云 DashScope API Key。

## 1. 获取 API Key
1. 访问 [阿里云百炼控制台](https://bailian.console.aliyun.com/?apiKey=1)。
2. 登录您的阿里云账号。
3. 点击 "创建 API Key"。
4. 复制生成的 Key (以 `sk-` 开头)。

## 2. 填写配置
1. 打开项目目录下的 `electron/config.js` 文件。
2. 找到 `DASHSCOPE_API_KEY` 字段。
3. 将您的 Key 粘贴到引号中。

**示例:**
```javascript
module.exports = {
    DASHSCOPE_API_KEY: "sk-a1b2c3d4e5f6...",
    DASHSCOPE_MODEL: "qwen3-asr-flash-realtime"
};
```

## 3. 重启应用
配置完成后，请**完全重启**应用 (关闭窗口并重新运行启动脚本) 以生效。
