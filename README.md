# Werewolf Turbo - 桌面应用版

AI 辅助的狼人杀游戏助手，支持语音识别和智能分析。

## 功能特性

- 🎮 完整的狼人杀游戏流程管理
- 🎤 **系统音频捕获**（桌面版）/ 麦克风录音（浏览器版）
- 🤖 AI 局势分析与胜率预测
- 📊 玩家身份概率分析
- 🔫 开枪关系可视化
- 👥 多种预设版型（12人标准局、守卫局等）

## 运行模式

### 桌面应用模式（推荐）
直接捕获系统音频，无需配置"立体声混音"

```bash
# 安装依赖
npm install

# 开发模式
npm run electron:dev

# 打包为 Windows 应用
npm run electron:build
```

### 浏览器模式
使用麦克风录音

```bash
npm run dev
```

访问 http://localhost:3000

## 系统要求

- Windows 10/11
- Node.js 18+
- 麦克风权限（浏览器模式）

## 技术栈

- **前端**: Next.js 16 + React 19 + TypeScript
- **状态管理**: Zustand
- **桌面框架**: Electron
- **UI**: Tailwind CSS + Lucide Icons
- **音频**: Web Speech API / Node.js Audio Capture

## 项目结构

```
werewolf-turbo/
├── app/                    # Next.js 应用
│   ├── components/         # React 组件
│   ├── services/           # 业务逻辑
│   ├── store/              # Zustand 状态管理
│   └── types/              # TypeScript 类型定义
├── electron/               # Electron 主进程
│   ├── main.js             # 主进程入口
│   ├── preload.js          # 预加载脚本
│   └── audio.js            # 音频捕获模块
└── public/                 # 静态资源
```

## 开发说明

### 添加新功能
1. 在 `app/components/` 中创建 React 组件
2. 在 `app/store/gameStore.ts` 中添加状态管理
3. 在 `app/services/` 中实现业务逻辑

### 音频功能
- 桌面版使用 `electron/audio.js` 捕获系统音频
- 浏览器版使用 `app/services/aiService.ts` 的 Web Speech API
- 自动检测运行环境并选择合适的 API

## 许可证

MIT
