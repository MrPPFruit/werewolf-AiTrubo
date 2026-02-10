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
});

// IPC Handlers for Audio Recording
ipcMain.handle('start-recording', async (event, options) => {
    try {
        if (!audioRecorder) {
            const { startSystemAudioCapture } = require('./audio');
            audioRecorder = startSystemAudioCapture((text) => {
                // Send transcribed text back to renderer
                mainWindow.webContents.send('audio-transcription', text);
            });
        }
        return { success: true };
    } catch (error) {
        console.error('Failed to start recording:', error);
        return { success: false, error: error.message };
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
