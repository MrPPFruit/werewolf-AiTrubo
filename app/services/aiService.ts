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

/**
 * Summarize speech using AI
 */
export const summarizeSpeech = async (text: string): Promise<string> => {
    // @ts-ignore
    if (typeof window !== 'undefined' && window.electronAPI?.summarizeSpeech) {
        try {
            // @ts-ignore
            const result = await window.electronAPI.summarizeSpeech(text);
            if (result.success && result.summary) {
                return result.summary;
            }
        } catch (e) {
            console.error('[AI] Summarize failed:', e);
        }
    }
    return text; // Fallback to original text
};

export const analyzeGameState = async (gameState: GameState): Promise<{
    analysis: string;
    probabilities: Record<string, number>;
    roleProbabilities: Record<string, Record<string, number>>;
    winRate: number; // 0-100
    dangerAlert: string | null; // Warning message if critical point
    playerAnalysis: Record<string, string>; // Detailed analysis per player
}> => {
    // 1. Check environment
    // @ts-ignore
    if (typeof window === 'undefined' || !window.electronAPI?.analyzeGame) {
        console.warn("[AI] Analysis not available in this environment");
        return {
            analysis: "AI分析服务未连接",
            probabilities: {},
            roleProbabilities: {},
            winRate: 50,
            dangerAlert: null,
            playerAnalysis: {}
        };
    }

    // 2. Prepare Context
    // Simplistic context serialization
    const context = {
        gameConfig: gameState.config, // [NEW] Inject Board Configuration
        myPlayerId: gameState.myPlayerId,
        day: gameState.day,
        phase: gameState.phase,
        players: gameState.players.map(p => ({
            id: p.id,
            number: p.number,
            status: p.status,
            isSheriff: p.isSheriff,
            tags: p.tags, // Action tags like 'SHOOTER'
            // Only send role if it's ME or known (e.g. revealed) - logic typically in store but here we trust current state
            role: p.id === gameState.myPlayerId ? p.role : undefined,
            isMarkedTeammate: p.isMarkedTeammate // [NEW] Send Teammate Mark to AI
        })),
        // Filter recent logs (last 2 days maybe? or all relevant ones)
        // Ideally we prioritize logs with summaries
        logs: gameState.logs.filter(l => ['SPEECH', 'VOTE', 'DEATH', 'ACTION'].includes(l.type)).map(l => ({
            day: l.day,
            type: l.type,
            source: l.sourcePlayerId,
            target: l.targetPlayerId,
            content: l.summary || l.message // Use summary if available!
        }))
    };

    // [NEW] Wolf Logic Optimization - Board Aware
    let systemInstructionAppendix = "";

    // Check if I am a wolf
    const myRole = gameState.players.find(p => p.id === gameState.myPlayerId)?.role;
    const isWolf = ['WEREWOLF', 'WOLF_KING', 'BEAUTY_WOLF'].includes(myRole as string);

    if (isWolf) {
        // 1. Identify my known teammates
        const teammates = gameState.players.filter(p =>
            p.id !== gameState.myPlayerId &&
            ['WEREWOLF', 'WOLF_KING', 'BEAUTY_WOLF'].includes(p.role as string)
        ).map(p => `${p.number}号`);

        // 2. Check Board Configuration for Special Roles
        const hasMixblood = (gameState.config.roles['MIXBLOOD'] || 0) > 0;
        // const hasMechWolf = (gameState.config.roles['MECHANICAL_WOLF'] || 0) > 0; // Future support

        let teammateInfo = "";
        if (teammates.length > 0) {
            teammateInfo = `你已知的狼队友是 [${teammates.join(', ')}]。`;
        } else {
            teammateInfo = `你不认识任何队友（可能是孤狼或队友已死）。`;
        }

        let unknownFactorWarning = "";
        if (hasMixblood) {
            unknownFactorWarning = `
            **注意：板子包含【混血儿】。**
            虽然除队友外的玩家大部分是好人，但其中可能混有以狼人为榜样的混血儿（属于狼队）。
            因此，**不要绝对排除**场上存在未知狼队成员的可能性。`;
        } else {
            // Standard Game: No hidden wolves
            unknownFactorWarning = `
            **在当前板子下，狼队没有隐藏成员。**
            因此，**除队友外的所有其他玩家**，其为狼人的概率应视为 **0%**。
            请专注于分析这些“好人”的具体身份（神职还是平民）。`;
        }

        systemInstructionAppendix = `
            **狼人视角特殊规则：**
            玩家本人是狼人。${teammateInfo}
            ${unknownFactorWarning}`;
    }

    const messages = [
        {
            role: 'system',
            content: `你是一个狼人杀高玩分析师。请根据提供的游戏数据进行逻辑推理。
            
            **重要：请务必基于【gameConfig】中的板子配置（角色配置）进行分析。**
            例如：如果不包含“守卫”，则不要推测“同守同救”；如果包含“狼王”，则需考虑其开枪带人的可能性。
            
            **关于死亡玩家：**
            即使玩家已经死亡，也请继续分析其身份概率，这对判断局势至关重要（例如：判断死走的是神还是民）。不要因为玩家死亡就忽略其身份分析。
            ${systemInstructionAppendix}

            输出必须是严格的 JSON 格式，不包含 markdown 代码块或其他文本。格式如下：
            {
                "analysis": "全局局势分析（50字以内，需结合板子配置）",
                "winRate": 50, // 好人胜率 0-100
                "dangerAlert": "紧急提示（可选，无则为null）",
                "players": {
                    "p-1": {
                        "roleProbabilities": { "WEREWOLF": 30, "SEER": 10, ... },
                        "analysis": "对该玩家的详细逻辑分析（例如行为、发言逻辑点，100字以内）"
                    },
                    ...
                }
            }`
        },
        {
            role: 'user',
            content: JSON.stringify(context)
        }
    ];

    try {
        // @ts-ignore
        const res = await window.electronAPI.analyzeGame(messages);
        if (!res.success || !res.analysis) {
            throw new Error(res.error || "Empty response");
        }

        // Clean up markdown code blocks if present (common issue with LLMs)
        let rawJson = res.analysis.replace(/```json/g, '').replace(/```/g, '').trim();
        const aiData = JSON.parse(rawJson);

        // Map response to verified structure
        const probabilities: Record<string, number> = {};
        const roleProbabilities: Record<string, Record<string, number>> = {};
        const playerAnalysis: Record<string, string> = {};

        if (aiData.players) {
            Object.entries(aiData.players).forEach(([playerId, pData]: [string, any]) => {
                roleProbabilities[playerId] = pData.roleProbabilities || {};
                // Calculate max wolf probability
                const wolfProb = (pData.roleProbabilities?.['WEREWOLF'] || 0) + (pData.roleProbabilities?.['WOLF_KING'] || 0) + (pData.roleProbabilities?.['BEAUTY_WOLF'] || 0);
                probabilities[playerId] = wolfProb;
                playerAnalysis[playerId] = pData.analysis || "暂无分析";
            });
        }

        return {
            analysis: aiData.analysis || "AI分析完成",
            probabilities,
            roleProbabilities,
            winRate: aiData.winRate || 50,
            dangerAlert: aiData.dangerAlert || null,
            playerAnalysis
        };

    } catch (e) {
        console.error('[AI] Analysis Error:', e);
        return {
            analysis: "AI分析失败: " + (e instanceof Error ? e.message : String(e)),
            probabilities: {},
            roleProbabilities: {},
            winRate: 50,
            dangerAlert: null,
            playerAnalysis: {}
        };
    }
};
