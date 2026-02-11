const { contextBridge, ipcRenderer } = require('electron');

// Expose protected methods that allow the renderer process to use
// the ipcRenderer without exposing the entire object
contextBridge.exposeInMainWorld('electronAPI', {
    // Audio recording controls
    startRecording: (callback) => {
        ipcRenderer.invoke('start-recording').then((result) => {
            if (!result.success) {
                console.error('Failed to start recording:', result.error);
            }
        });

        // Listen for transcription results
        ipcRenderer.on('audio-transcription', (event, text) => {
            callback(text);
        });
    },

    stopRecording: () => {
        return ipcRenderer.invoke('stop-recording');
    },

    // Native Vosk Bridge
    voskInit: () => ipcRenderer.invoke('vosk-init'),
    // Process audio is now fire-and-forget (results come via event)
    voskProcessAudio: (buffer) => ipcRenderer.send('vosk-process-audio', buffer),
    // Listen for Vosk results (Sidecar)
    onVoskResult: (callback) => ipcRenderer.on('vosk-result', (_event, data) => callback(data)),
    offVoskResult: () => ipcRenderer.removeAllListeners('vosk-result'),

    // Check if running in Electron
    isElectron: true,

    // System Audio
    getDesktopSources: () => ipcRenderer.invoke('get-desktop-sources'),
});
