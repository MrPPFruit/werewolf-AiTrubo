import { GameState, Role } from "@/app/types/game";

// Type declaration for Electron API
declare global {
    interface Window {
        electronAPI?: {
            isElectron: boolean;
            startRecording: (callback: (text: string) => void) => void;
            stopRecording: () => Promise<{ success: boolean }>;
        };
    }
}

// Web Speech API Implementation (Browser Mode)
let recognition: any = null;
let audioContext: AudioContext | null = null;
let analyser: AnalyserNode | null = null;
let microphone: MediaStreamAudioSourceNode | null = null;
let audioLevelInterval: number | null = null;
let currentStream: MediaStream | null = null;

/**
 * Check microphone permission status
 * @returns 'granted' | 'denied' | 'prompt' | 'unsupported'
 */
export const checkMicrophonePermission = async (): Promise<string> => {
    if (typeof window === 'undefined') return 'unsupported';

    // Check if running in Electron
    if (window.electronAPI?.isElectron) {
        // Electron auto-grants permissions, so always return granted
        return 'granted';
    }

    // Check browser support
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
        return 'unsupported';
    }

    // Check permission API support
    if (navigator.permissions && navigator.permissions.query) {
        try {
            // @ts-ignore - microphone permission
            const result = await navigator.permissions.query({ name: 'microphone' });
            return result.state; // 'granted', 'denied', or 'prompt'
        } catch (e) {
            console.warn('[Permission] Permission API not fully supported', e);
        }
    }

    // Fallback: try to access microphone to check
    try {
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        stream.getTracks().forEach(track => track.stop());
        return 'granted';
    } catch (e: any) {
        if (e.name === 'NotAllowedError' || e.name === 'PermissionDeniedError') {
            return 'denied';
        }
        return 'prompt';
    }
};

/**
 * Request microphone permission
 * @returns true if granted, false if denied
 */
export const requestMicrophonePermission = async (): Promise<boolean> => {
    if (typeof window === 'undefined') return false;

    // Electron auto-grants
    if (window.electronAPI?.isElectron) {
        return true;
    }

    try {
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        // Store stream for later use
        currentStream = stream;
        console.log('[Permission] Microphone access granted');
        return true;
    } catch (e: any) {
        console.error('[Permission] Microphone access denied', e);
        return false;
    }
};

export const startSpeechRecognition = (
    onResult: (text: string) => void,
    onError?: (err: any) => void,
    onAudioLevel?: (level: number) => void
) => {
    // PRIORITY 1: Use Electron API if available (Desktop Mode)
    if (typeof window !== 'undefined' && window.electronAPI?.isElectron) {
        console.log('[Audio] Using Electron system audio capture');
        try {
            window.electronAPI.startRecording(onResult);
            return;
        } catch (e) {
            console.error('[Audio] Electron API failed, falling back to Web Speech API', e);
            // Fall through to Web Speech API
        }
    }

    // FALLBACK: Web Speech API (Browser Mode)
    if (typeof window === 'undefined') return;

    // @ts-ignore
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SpeechRecognition) {
        onError?.("浏览器不支持语音识别");
        return;
    }

    console.log('[Audio] Using Web Speech API (microphone)');

    // Initialize Web Audio API for level monitoring
    if (onAudioLevel) {
        const initAudioMonitoring = async () => {
            try {
                // Reuse existing stream or request new one
                const stream = currentStream || await navigator.mediaDevices.getUserMedia({ audio: true });
                if (!currentStream) currentStream = stream;

                audioContext = new AudioContext();
                analyser = audioContext.createAnalyser();
                microphone = audioContext.createMediaStreamSource(stream);
                microphone.connect(analyser);
                analyser.fftSize = 256;

                const bufferLength = analyser.frequencyBinCount;
                const dataArray = new Uint8Array(bufferLength);

                // Monitor audio level
                audioLevelInterval = window.setInterval(() => {
                    analyser!.getByteFrequencyData(dataArray);
                    const average = dataArray.reduce((a, b) => a + b) / bufferLength;
                    const level = Math.min(100, (average / 255) * 200); // Scale to 0-100
                    onAudioLevel(Math.round(level));
                }, 100);
            } catch (err) {
                console.error('[Audio] Failed to access microphone for level monitoring', err);
                onError?.(err);
            }
        };

        initAudioMonitoring();
    }

    recognition = new SpeechRecognition();
    recognition.lang = 'zh-CN';
    recognition.continuous = true;
    recognition.interimResults = false;

    recognition.onresult = (event: any) => {
        const lastResult = event.results[event.results.length - 1];
        if (lastResult.isFinal) {
            onResult(lastResult[0].transcript);
        }
    };

    recognition.onerror = (event: any) => {
        console.error("Speech recognition error", event.error);
        onError?.(event.error);
    };

    try {
        recognition.start();
    } catch (e) {
        console.error("Failed to start recognition", e);
    }
};

export const stopSpeechRecognition = () => {
    // Stop Electron recording if available
    if (typeof window !== 'undefined' && window.electronAPI?.isElectron) {
        window.electronAPI.stopRecording();
        return;
    }

    // Stop Web Speech API
    if (recognition) {
        recognition.stop();
        recognition = null;
    }

    // Clean up audio monitoring
    if (audioLevelInterval) {
        clearInterval(audioLevelInterval);
        audioLevelInterval = null;
    }

    if (microphone) {
        microphone.disconnect();
        microphone = null;
    }

    if (audioContext) {
        audioContext.close();
        audioContext = null;
    }

    analyser = null;

    // Note: We keep currentStream alive for reuse
};

// Legacy shim if needed (deprecated)
export const transcribeAudio = async (blob: Blob): Promise<string> => {
    return "[语音识别需使用实时模式，请更新调用逻辑]";
};

export const analyzeGameState = async (gameState: GameState): Promise<{
    analysis: string;
    probabilities: Record<string, number>;
    roleProbabilities: Record<string, Record<string, number>>;
    winRate: number; // 0-100
    dangerAlert: string | null; // Warning message if critical point
}> => {
    await new Promise((resolve) => setTimeout(resolve, 1500));

    // Mock logic to generate probabilities based on random
    const probabilities: Record<string, number> = {};
    const roleProbabilities: Record<string, Record<string, number>> = {};

    gameState.players.forEach(player => {
        if (!player.isDead) {
            const wolfProb = Math.floor(Math.random() * 100);
            probabilities[player.id] = wolfProb;

            roleProbabilities[player.id] = {
                'WEREWOLF': wolfProb,
                'VILLAGER': Math.max(0, 100 - wolfProb - 30),
                'SEER': Math.floor(Math.random() * 20),
                'WITCH': Math.floor(Math.random() * 15),
            };
        }
    });

    const alivePlayers = gameState.players.filter(p => !p.isDead);
    const aliveWolves = alivePlayers.filter(p => p.role === 'WEREWOLF').length;
    const aliveGood = alivePlayers.length - aliveWolves;

    let winRate = 50;
    if (aliveWolves === 0) winRate = 100;
    else if (aliveGood <= aliveWolves) winRate = 0;
    else winRate = Math.floor((aliveGood / (aliveGood + aliveWolves)) * 100);

    let dangerAlert = null;
    if (aliveGood <= aliveWolves + 1) {
        dangerAlert = "警告：好人阵营濒临失败！";
    } else if (aliveWolves === 1 && alivePlayers.length > 4) {
        dangerAlert = "提示：仅剩一只狼，注意屠边风险";
    }

    const analysis = `当前局势分析：存活 ${alivePlayers.length} 人，预计狼人 ${aliveWolves} 只。好人阵营胜率 ${winRate}%。`;

    return {
        analysis,
        probabilities,
        roleProbabilities,
        winRate,
        dangerAlert,
    };
};
