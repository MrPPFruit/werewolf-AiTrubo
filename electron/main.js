const { app, BrowserWindow, ipcMain } = require('electron');
const path = require('path');
const isDev = require('electron-is-dev');

let mainWindow;
let audioRecorder = null;

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
    if (isDev) {
        mainWindow.webContents.openDevTools();
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
    // Kill sidecar on exit
    if (voiceProcess) {
        voiceProcess.kill();
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

// Sidecar Voice Server (Node.js Child Process)
let voiceProcess = null;

const initVoiceServer = async () => {
    if (voiceProcess) return true;

    const { spawn } = require('child_process');

    // Path to model
    const rawPath = isDev
        ? path.join(__dirname, '../public/models/vosk-model-small-cn-0.22')
        : path.join(process.resourcesPath, 'public/models/vosk-model-small-cn-0.22');

    // Fix Windows paths (just in case Node args act up, though usually standard paths work)
    const modelPath = rawPath.replace(/\\/g, '/');

    // Path to server script
    const serverScript = isDev
        ? path.join(__dirname, 'voice-server.js')
        : path.join(process.resourcesPath, 'electron/voice-server.js'); // Assumption for Prod

    if (!require('fs').existsSync(serverScript)) {
        console.error('[VoiceClient] Server script not found:', serverScript);
        return false;
    }

    console.log('[VoiceClient] Spawning Sidecar:', serverScript);
    console.log('[VoiceClient] Model:', modelPath);

    // Spawn "node" (System Node)
    // stdio: ['pipe', 'pipe', 'pipe']
    voiceProcess = spawn('node', [serverScript, modelPath]);

    voiceProcess.stdout.on('data', (data) => {
        // Buffer to string. Can contain multiple JSON lines.
        const str = data.toString();
        const lines = str.split('\n');

        for (const line of lines) {
            if (!line.trim()) continue;
            try {
                const msg = JSON.parse(line);
                if (msg.type === 'ready') {
                    console.log('[VoiceClient] Sidecar Ready');
                } else if (msg.type === 'result' || msg.type === 'partial') {
                    // Send to Renderer
                    if (mainWindow) {
                        mainWindow.webContents.send('vosk-result', msg);
                    }
                }
            } catch (e) {
                // Partial JSON or log message
                console.log('[VoiceServer Log]:', line);
            }
        }
    });

    voiceProcess.stderr.on('data', (data) => {
        console.error(`[VoiceServer Error]: ${data}`);
    });

    voiceProcess.on('close', (code) => {
        console.log(`[VoiceServer] Exited with code ${code}`);
        voiceProcess = null;
    });

    return true;
};

// IPC: Init
ipcMain.handle('vosk-init', async () => {
    try {
        const success = await initVoiceServer();
        return { success };
    } catch (e) {
        return { success: false, error: e.message };
    }
});

// IPC: Process Audio (Stream to Sidecar)
// IPC: Process Audio (Stream to Sidecar)
// Changed to .on() for better performance (Fire-and-forget, no Promise overhead)
ipcMain.on('vosk-process-audio', (event, data) => {
    if (!voiceProcess || !voiceProcess.stdin) return; // No Ack needed
    try {
        // data comes from IPC.
        // We ensure it's a Node Buffer for stdin.write
        let buffer;
        if (Buffer.isBuffer(data)) {
            buffer = data;
        } else if (data.buffer) {
            // Handle TypedArrays (Int16Array etc) or ArrayBuffer wrapper
            buffer = Buffer.from(data.buffer, data.byteOffset || 0, data.byteLength);
        } else {
            // Fallback (ArrayBuffer or Array)
            buffer = Buffer.from(data);
        }

        voiceProcess.stdin.write(buffer, (err) => {
            if (err) console.error('[VoiceClient] Write Error:', err);
        });
    } catch (e) {
        console.error('Sidecar Write Exception:', e);
    }
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

// [CRITICAL] Prevent Main Process Crash
process.on('uncaughtException', (error) => {
    console.error('CRITICAL: Main Process Uncaught Exception:', error);
    // Keep app alive if possible
});
