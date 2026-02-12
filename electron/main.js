const { app, BrowserWindow, ipcMain } = require('electron');
const path = require('path');
const isDev = require('electron-is-dev');
const DashScopeClient = require('./dashscope');
const { DASHSCOPE_API_KEY } = require('./config');

let mainWindow;
let audioRecorder = null;
let dashClient = null;

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
ipcMain.handle('get-desktop-sources', async () => {
    const { desktopCapturer } = require('electron');
    try {
        const sources = await desktopCapturer.getSources({ types: ['screen'] });
        return { success: true, sources };
    } catch (e) {
        console.error('Failed to get desktop sources:', e);
        return { success: false, error: e.message };
    }
});

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

// IPC: Init
ipcMain.handle('vosk-init', async () => {
    try {
        console.log('[Main] Checking DashScope Config. Key exists:', !!DASHSCOPE_API_KEY, 'Model:', require('./config').DASHSCOPE_MODEL);

        if (!DASHSCOPE_API_KEY) {
            console.error('[Main] No DashScope API Key found. ASR will not work.');
            return { success: false, error: "未配置云端语音识别 API Key" };
        }

        if (dashClient) {
            dashClient.stop();
        }

        console.log('[Main] Initializing DashScope Client...');
        dashClient = new DashScopeClient(
            (text, isFinal) => {
                if (mainWindow) {
                    mainWindow.webContents.send('vosk-result', {
                        type: isFinal ? 'result' : 'partial',
                        data: isFinal ? { text } : { partial: text }
                    });
                }
            },
            (err) => {
                console.error('[DashScope] Error:', err);
                if (mainWindow) {
                    // Optionally send error to frontend
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

// [CRITICAL] Prevent Main Process Crash
process.on('uncaughtException', (error) => {
    console.error('CRITICAL: Main Process Uncaught Exception:', error);
    // Keep app alive if possible
});
