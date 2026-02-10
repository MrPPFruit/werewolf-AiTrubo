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

    // Check if running in Electron
    isElectron: true,
});
