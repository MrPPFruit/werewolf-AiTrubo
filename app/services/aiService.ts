import { GameState, Role } from "@/app/types/game";
import { startVoskRecording, stopVoskRecording } from './voskService';
import dictionary from '@/app/config/dictionary.json';

// Type declaration for Electron API
interface VoskResult {
    type: 'result' | 'partial' | 'ready';
    data: {
        text?: string;
        partial?: string;
    };
}

// Native Electron API Type Definition
declare global {
    interface Window {
        electronAPI?: {
            isElectron: boolean;
            startRecording: (callback: (text: string) => void) => void;
            stopRecording: () => Promise<{ success: boolean; error?: string }>;
            voskInit: () => Promise<{ success: boolean; error?: string }>;
            voskProcessAudio: (buffer: Int16Array) => Promise<{ error?: string }>;
            onVoskResult: (callback: (data: VoskResult) => void) => void;
            offVoskResult: () => void;
            voskFlush?: () => Promise<{ success: boolean; error?: string }>;
            getDesktopSources: () => Promise<{ success: boolean; sources?: Array<{ id: string; name: string }>; error?: string }>;
        }
    }
}

// Web Speech API Implementation (Browser Mode)
let recognition: any = null;
let audioContext: AudioContext | null = null;
let analyser: AnalyserNode | null = null;
let microphone: MediaStreamAudioSourceNode | null = null;
let audioLevelInterval: number | null = null;
let currentStream: MediaStream | null = null;

// Helper to start audio monitoring
const startAudioMonitoring = async (onAudioLevel: (level: number) => void, onError?: (err: any) => void) => {
    try {
        // Reuse existing stream or request new one (if not provided by Vosk yet, but here we usually grab our own for viz)
        const stream = currentStream || await navigator.mediaDevices.getUserMedia({ audio: true });
        if (!currentStream) currentStream = stream;

        if (audioContext) audioContext.close();
        audioContext = new AudioContext();
        analyser = audioContext.createAnalyser();
        microphone = audioContext.createMediaStreamSource(stream);
        microphone.connect(analyser);
        analyser.fftSize = 256;

        const bufferLength = analyser.frequencyBinCount;
        const dataArray = new Uint8Array(bufferLength);

        // Monitor audio level
        const interval = window.setInterval(() => {
            if (analyser) {
                analyser.getByteFrequencyData(dataArray);
                const average = dataArray.reduce((a, b) => a + b) / bufferLength;
                const level = Math.min(100, (average / 255) * 200); // Scale to 0-100
                onAudioLevel(Math.round(level));
            }
        }, 100);

        return interval;
    } catch (err) {
        console.error('[Audio] Failed to access microphone for level monitoring', err);
        onError?.(err);
        return null;
    }
};

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

export const startSpeechRecognition = async (
    preferredSource: 'SYSTEM' | 'MICROPHONE',
    onResult: (text: string) => void,
    onError?: (err: any) => void,
    onAudioLevel?: (level: number) => void
) => {
    // OPTION 2: Vosk (Offline/Electron - Microphone OR System)
    // Uses Vosk (WASM) for ASR, and either getUserMedia or desktopCapturer for audio.
    if (typeof window !== 'undefined' && window.electronAPI?.isElectron && (preferredSource === 'MICROPHONE' || preferredSource === 'SYSTEM')) {
        console.log(`[Audio] Using Vosk (Offline WASM) for ${preferredSource}`);
        try {
            startVoskRecording(
                (text, isFinal) => {
                    if (isFinal) {
                        // Apply rudimentary correction on final results
                        correctTextWithAI(text).then(corrected => {
                            onResult(corrected);
                        });
                    } else {
                        onResult(text); // Partials
                    }
                },
                (err) => {
                    console.error('[Audio] Vosk Error:', err);
                    onError?.(err);
                },
                // Pass audio level callback directly to Vosk service to avoid double getUserMedia
                onAudioLevel,
                preferredSource
            );

            // Note: startAudioMonitoring is purposely NOT called here because startVoskRecording handles it.
        } catch (e) {
            console.error('[Audio] Failed to start Vosk', e);
            onError?.("离线语音模块启动失败");
        }
        return;
    }

    // OPTION 3: Web Speech API (Browser)
    // Used if preferredSource is 'MICROPHONE' OR if not in Electron
    if (typeof window === 'undefined') return;

    // @ts-ignore
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SpeechRecognition) {
        onError?.("浏览器不支持语音识别");
        return;
    }

    console.log('[Audio] Using Web Speech API (Microphone)');

    // Initialize Web Audio API for level monitoring
    if (onAudioLevel) {
        audioLevelInterval = await startAudioMonitoring(onAudioLevel, onError) as unknown as number;
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
        // 'network' error is common in Electron without API keys.
        // We log it as a warning but still pass it to the handler so UI can show a friendly message.
        if (event.error === 'network') {
            console.warn("[Audio] Speech recognition network error. Microphone level should still work.");
        } else {
            console.error("Speech recognition error", event.error);
        }
        onError?.(event.error);
    };

    try {
        recognition.start();
    } catch (e) {
        console.error("Failed to start recognition", e);
    }
};

export const stopSpeechRecognition = async () => {
    // Stop Web Speech API
    if (recognition) {
        recognition.stop();
        recognition = null;
    }

    // Clean up audio monitoring interval
    if (audioLevelInterval) {
        clearInterval(audioLevelInterval);
        audioLevelInterval = null;
    }

    // Stop Vosk (Electron)
    if (typeof window !== 'undefined' && window.electronAPI?.isElectron) {
        window.electronAPI.stopRecording(); // Stop Electron's desktopCapturer or getUserMedia
        // Await the flush delay for Vosk to process any remaining audio
        await stopVoskRecording(true);
    } else {
        // If not in Electron, or if Vosk was used in a browser context (e.g., for testing),
        // ensure it's stopped. The `true` argument for flush delay is only relevant if it was actively recording.
        stopVoskRecording();
    }

    // Clean up Web Audio API resources
    if (microphone) {
        microphone.disconnect();
        microphone = null;
    }

    if (audioContext && audioContext.state === 'running') {
        // Only close audioContext if it's running and not managed by an external service (like Vosk, if it were to manage its own context)
        // For Web Speech API path, we explicitly created and manage it here.
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

/**
 * Simple "AI" correction for common homophones in Werewolf.
 * In a real scenario, this would call an LLM API.
 */
export const correctTextWithAI = async (text: string): Promise<string> => {
    const corrections: Record<string, string> = dictionary;

    let corrected = text;
    for (const [key, value] of Object.entries(corrections)) {
        corrected = corrected.replace(new RegExp(key, 'g'), value);
    }
    return corrected;
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
        if (player.status === 'ALIVE') {
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

    const alivePlayers = gameState.players.filter(p => p.status === 'ALIVE');
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
