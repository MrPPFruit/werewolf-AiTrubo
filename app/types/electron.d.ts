// Native Electron API Type Definition
export { };

declare global {
    interface Window {
        electronAPI?: {
            isElectron: boolean;
            // Audio Recording
            startRecording: (callback: (text: string) => void) => void;
            stopRecording: () => Promise<{ success: boolean; error?: string }>;

            // Vosk Integration
            voskInit: () => Promise<{ success: boolean; error?: string; usingCloud?: boolean; model?: string }>;
            voskProcessAudio: (buffer: Int16Array) => Promise<{ error?: string }>;
            onVoskResult: (callback: (data: any) => void) => void;
            offVoskResult: () => void;
            onVoskError?: (callback: (err: any) => void) => void;
            voskFlush?: () => Promise<{ success: boolean; error?: string }>;
            voskSetMute?: (mute: boolean) => Promise<{ success: boolean }>;

            // System Audio
            getDesktopSources: () => Promise<{ success: boolean; sources?: Array<{ id: string; name: string }>; error?: string }>;

            // AI Features
            analyzeGame: (messages: any[]) => Promise<{ success: boolean; analysis?: string; error?: string }>;
            summarizeSpeech: (text: string) => Promise<{ success: boolean; summary?: string; error?: string }>;
        }
    }
}
