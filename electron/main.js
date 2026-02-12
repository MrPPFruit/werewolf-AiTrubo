const { app, BrowserWindow, ipcMain } = require('electron');
const path = require('path');
const isDev = require('electron-is-dev');
const DashScopeClient = require('./dashscope');
const { DASHSCOPE_API_KEY } = require('./config');
const logger = require('./logger');

let mainWindow;
let audioRecorder = null;
let dashClient = null;
let isVoskMuted = false;

function createWindow() {
    mainWindow = new BrowserWindow({
        width: 1400,
        height: 900,
        minWidth: 1200,
        minHeight: 700,
        webPreferences: {
            preload: path.join(__dirname, 'preload.js'),
            contextIsolation: true,
            nodeIntegration: false,
            // Enable media permissions for microphone
            enableRemoteModule: false,
            sandbox: false,
        },
        backgroundColor: '#0f172a',
        title: 'Werewolf Turbo',
        icon: path.join(__dirname, '../public/icon.png'),
    });

    // Handle permission requests for media devices
    mainWindow.webContents.session.setPermissionRequestHandler((webContents, permission, callback) => {
        const allowedPermissions = ['media', 'microphone', 'audioCapture'];
        if (allowedPermissions.includes(permission)) {
            callback(true); // Approve
        } else {
            callback(false); // Deny
        }
    });

    // Load Next.js app
    const startUrl = isDev
        ? 'http://localhost:3000'
        : `file://${path.join(__dirname, '../out/index.html')}`;

    mainWindow.loadURL(startUrl);

    // Open DevTools in development
    // Open DevTools in development
    if (isDev) {
        // mainWindow.webContents.openDevTools();
    }

    mainWindow.on('closed', () => {
        mainWindow = null;
    });
}

// App lifecycle
app.whenReady().then(() => {
    createWindow();

    app.on('activate', () => {
        if (BrowserWindow.getAllWindows().length === 0) {
            createWindow();
        }
    });
});

app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') {
        app.quit();
    }
});

// [CRITICAL] Enable SharedArrayBuffer for WASM (Vosk)
app.on('ready', () => {
    const { session } = require('electron');
    session.defaultSession.webRequest.onHeadersReceived((details, callback) => {
        callback({
            responseHeaders: {
                ...details.responseHeaders,
                'Cross-Origin-Opener-Policy': 'same-origin',
                'Cross-Origin-Embedder-Policy': 'require-corp',
            },
        });
    });
});

// IPC Handlers for Audio Recording


ipcMain.handle('start-recording', async (event, options) => {
    try {
        if (!audioRecorder) {
            const { startSystemAudioCapture } = require('./audio');
            audioRecorder = startSystemAudioCapture((text) => {
                mainWindow.webContents.send('audio-transcription', text);
            });
        }
        return { success: true };
    } catch (error) {
        console.error('Failed to start recording:', error);
        return { success: false, error: error.message };
    }
});

// IPC: Mute/Unmute
ipcMain.handle('vosk-set-mute', async (event, mute) => {
    isVoskMuted = mute;
    return { success: true };
});

// IPC: Init
ipcMain.handle('vosk-init', async () => {
    try {
        // Replace console.log with logger.info and console.error with logger.error in various places
        // This is a global replace strategy for the file. 

        // 1. vosk-init
        logger.info(`[Main] Init DashScope. Key Present: ${!!DASHSCOPE_API_KEY}, Model: ${require('./config').DASHSCOPE_MODEL}`);

        if (!DASHSCOPE_API_KEY) {
            logger.error('[Main] No DashScope API Key found.');
            return { success: false, error: "未配置云端语音识别 API Key" };
        }

        if (dashClient) {
            dashClient.stop();
        }

        logger.info('[Main] Initializing DashScope Client...');
        dashClient = new DashScopeClient(
            (text, isFinal) => {
                if (mainWindow && !isVoskMuted) {
                    mainWindow.webContents.send('vosk-result', {
                        type: isFinal ? 'result' : 'partial',
                        data: isFinal ? { text } : { partial: text }
                    });
                }
            },
            (err) => {
                logger.error(`[DashScope] Error: ${err}`);
                if (mainWindow) {
                    mainWindow.webContents.send('vosk-error', err);
                }
            }
        );

        dashClient.start();

        // Return model info
        const { DASHSCOPE_MODEL } = require('./config');
        return {
            success: true,
            usingCloud: true,
            model: DASHSCOPE_MODEL || 'qwen3-asr-flash-realtime'
        };
    } catch (e) {
        return { success: false, error: e.message };
    }
});

// IPC: Process Audio (Stream to Cloud Only)
ipcMain.on('vosk-process-audio', (event, data) => {
    // Cloud ASR Only
    if (dashClient && dashClient.isReady) {
        try {
            let buffer;
            if (Buffer.isBuffer(data)) {
                buffer = data;
            } else if (data.buffer) {
                buffer = Buffer.from(data.buffer, data.byteOffset || 0, data.byteLength);
            } else {
                buffer = Buffer.from(data);
            }
            dashClient.sendAudio(buffer);
        } catch (e) {
            console.error('[DashScope] Write Error:', e);
        }
    }
});

// IPC: Flush Audio (Force finalization)
ipcMain.handle('vosk-flush', async () => {
    if (dashClient && dashClient.isReady) {
        try {
            dashClient.flush();
            return { success: true };
        } catch (e) {
            console.error('[DashScope] Flush Error:', e);
            return { success: false, error: e.message };
        }
    }
    return { success: false, error: "Client not ready" };
});

ipcMain.handle('stop-recording', async () => {
    try {
        if (audioRecorder) {
            audioRecorder.stop();
            audioRecorder = null;
        }
        return { success: true };
    } catch (error) {
        console.error('Failed to stop recording:', error);
        return { success: false, error: error.message };
    }
});

// System Audio Capture Helpers
ipcMain.handle('get-desktop-sources', async () => {
    try {
        const { desktopCapturer } = require('electron');
        const sources = await desktopCapturer.getSources({ types: ['screen'] });
        return {
            success: true,
            sources: sources.map(s => ({
                id: s.id,
                name: s.name
            }))
        };
    } catch (e) {
        console.error('Failed to get desktop sources:', e);
        return { success: false, error: e.message };
    }
});

// [CRITICAL] Enable SharedArrayBuffer for WASM (Vosk)
// ... (existing code)

// Helper for DashScope API (OpenAI Compatible)
// Helper for DashScope API (OpenAI Compatible) - Using Electron net module for better stability
async function callDashScope(messages, model = 'qwen-max') {
    if (!DASHSCOPE_API_KEY) {
        throw new Error("Missing DashScope API Key");
    }

    const { net } = require('electron');

    return new Promise((resolve, reject) => {
        const request = net.request({
            method: 'POST',
            url: 'https://dashscope.aliyuncs.com/compatible-mode/v1/chat/completions',
        });

        request.setHeader('Authorization', `Bearer ${DASHSCOPE_API_KEY}`);
        request.setHeader('Content-Type', 'application/json');

        request.on('response', (response) => {
            let body = '';
            response.on('data', (chunk) => {
                body += chunk.toString();
            });
            response.on('end', () => {
                if (response.statusCode >= 200 && response.statusCode < 300) {
                    try {
                        const data = JSON.parse(body);
                        if (data.choices && data.choices.length > 0) {
                            resolve(data.choices[0].message.content);
                        } else {
                            reject(new Error(`DashScope Response Format Error: ${body}`));
                        }
                    } catch (e) {
                        reject(new Error(`Failed to parse DashScope response: ${e.message}`));
                    }
                } else {
                    reject(new Error(`DashScope API Error: ${response.statusCode} ${body}`));
                }
            });
            response.on('error', (error) => {
                reject(error);
            });
        });

        request.on('error', (error) => {
            console.error('[DashScope] Network Request Error:', error);
            reject(error);
        });

        request.write(JSON.stringify({
            model: model,
            messages: messages,
            temperature: 0.7,
        }));

        request.end();
    });
}

// IPC: AI Game Analysis
ipcMain.handle('analyze-game', async (event, { messages }) => {
    try {
        const { DASHSCOPE_LLM_MODEL } = require('./config');
        const model = DASHSCOPE_LLM_MODEL || 'qwen-max';
        console.log(`[Main] analyzing game with ${model}...`);
        const result = await callDashScope(messages, model);
        return { success: true, analysis: result };
    } catch (error) {
        console.error('[Main] Analysis failed:', error);
        return { success: false, error: error.message };
    }
});

// IPC: Speech Summarization
ipcMain.handle('summarize-speech', async (event, { text }) => {
    try {
        if (!text || text.length < 10) return { success: true, summary: text };

        const { DASHSCOPE_LLM_MODEL } = require('./config');
        const model = DASHSCOPE_LLM_MODEL || 'qwen-max';

        const messages = [
            {
                role: 'system',
                content: `你是一个狼人杀游戏记录员。请将玩家的发言去除口语废话（如“这个”、“就是”），提炼为关键逻辑点。
                
                **核心任务：智能修正语音识别错误**
                请根据狼人杀语境修正谐音错别字，例如：
                - "鱼眼家" -> "预言家"
                - "警辉" -> "警徽"
                - "金水" -> "金水" (不应识别为薪水)
                - "查杀" -> "查杀" (不应识别为茶杀)
                - "女巫" -> "女巫"
                - "猎人" -> "猎人"
                
                输出要求：保持简练，不要歪曲原意。直接输出修正后的摘要。`
            },
            { role: 'user', content: text }
        ];

        console.log(`[Main] Summarizing speech with ${model}...`);
        const summary = await callDashScope(messages, model);
        return { success: true, summary: summary };
    } catch (error) {
        console.error('[Main] Summarization failed:', error);
        return { success: false, error: error.message };
    }
});

// [CRITICAL] Prevent Main Process Crash
process.on('uncaughtException', (error) => {
    console.error('CRITICAL: Main Process Uncaught Exception:', error);
    // Keep app alive if possible
});
