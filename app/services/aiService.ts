import { GameState, Role } from "@/app/types/game";
import { startVoskRecording, stopVoskRecording } from './voskService';
import dictionary from '@/app/config/dictionary.json';
import { logAIAnalysis } from './aiLogger';

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
    debugContext?: any; // [NEW] Raw context for debugging
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

    // [NEW] Night Action Extraction
    const nightActions = {
        witchSave: gameState.players.find(p =>
            gameState.relations.some(r => r.type === 'WITCH_SAVE' && r.targetId === p.id)
        )?.number,
        witchPoison: gameState.players.find(p =>
            gameState.relations.some(r => r.type === 'WITCH_POISON' && r.targetId === p.id)
        )?.number,
        guardProtect: gameState.players.find(p =>
            gameState.relations.some(r => r.type === 'GUARD_PROTECT' && r.targetId === p.id && r.day === gameState.day)
        )?.number,
        wolfKill: gameState.players.find(p =>
            gameState.relations.some(r => r.type === 'WOLF_KILL' && r.targetId === p.id && r.day === gameState.day)
        )?.number
    };

    // Helper: player id → number
    const idToNum = (id: string | undefined) => {
        if (!id) return null;
        const p = gameState.players.find(pl => pl.id === id);
        return p ? p.number : null;
    };

    // === Build Timeline (unified, deduplicated) ===
    const timeline = [];
    for (let d = 1; d <= gameState.day; d++) {
        const events: any[] = [];

        // Logs for this day
        gameState.logs
            .filter(l => l.day === d && ['SPEECH', 'VOTE', 'DEATH', 'ACTION'].includes(l.type))
            .forEach(l => {
                events.push({
                    类型: l.type === 'SPEECH' ? '发言' : l.type === 'VOTE' ? '投票' : l.type === 'DEATH' ? '死亡' : '行动',
                    阶段: l.phase,
                    来源: idToNum(l.sourcePlayerId),
                    目标: idToNum(l.targetPlayerId),
                    内容: l.summary || l.message
                });
            });

        // Votes for this day
        gameState.relations
            .filter(r => r.type === 'VOTE' && r.day === d)
            .forEach(r => {
                events.push({
                    类型: '投票记录',
                    阶段: r.phase,
                    轮次: r.round || 1,
                    投票人: idToNum(r.sourceId),
                    目标: r.targetId ? idToNum(r.targetId) : '弃票'
                });
            });

        timeline.push({ 天数: d, 事件: events });
    }

    // === Build Player List (number-based, no redundant IDs) ===
    const playerList = gameState.players.map(p => {
        const info: any = {
            号码: p.number,
            状态: p.status === 'ALIVE' ? '存活' : p.status === 'DEAD' ? '死亡' : '放逐',
        };
        if (p.isSheriff) info.警长 = true;
        if (p.tags?.length) info.标签 = p.tags;
        if (p.id === gameState.myPlayerId && p.role) info.身份 = p.role;
        if (p.isMarkedTeammate) info.已知狼队友 = true;
        if (p.markedRole) info.标记 = p.markedRole;
        if (p.isCampaigning) info.竞选中 = true;
        if (p.hasQuitElection) info.已退水 = true;

        // Public role (auto-detected)
        const pubRole = (() => {
            if (p.role === 'IDIOT' && p.status === 'EXILED') return '白痴(已翻牌)';
            if (p.tags?.includes('SHOOTER') && (p.status === 'DEAD' || p.status === 'EXILED')) {
                const hasHunter = (gameState.config.roles['HUNTER'] || 0) > 0;
                const hasWolfKing = (gameState.config.roles['WOLF_KING'] || 0) > 0;
                if (hasHunter && !hasWolfKing) return '猎人(已开枪)';
                if (!hasHunter && hasWolfKing) return '狼王(已开枪)';
                if (p.isMarkedTeammate || p.markedRole === 'BAD') return '狼王(已开枪)';
                if (p.markedRole === 'GOOD' || p.markedRole === 'SILVER') return '猎人(已开枪)';
                return '猎人或狼王(已开枪)';
            }
            return undefined;
        })();
        if (pubRole) info.已公开身份 = pubRole;

        // Previous analysis (for continuity)
        if (p.analysis) info.上次分析 = p.analysis;

        // Mixblood
        if (gameState.myPlayerId && p.id === gameState.myPlayerId && p.mixbloodTargetId) {
            info.混血儿榜样 = idToNum(p.mixbloodTargetId);
        }

        return info;
    });

    // === Role Config (readable) ===
    const roleNames: Record<string, string> = {
        VILLAGER: '村民', WEREWOLF: '狼人', SEER: '预言家', WITCH: '女巫',
        HUNTER: '猎人', GUARD: '守卫', IDIOT: '白痴', WOLF_KING: '狼王',
        BEAUTY_WOLF: '美人狼', MIXBLOOD: '混血儿'
    };
    const roleConfig: Record<string, number> = {};
    Object.entries(gameState.config.roles).forEach(([role, count]) => {
        if (count > 0) roleConfig[roleNames[role] || role] = count;
    });

    // === Wolf Perspective Appendix ===
    const myRole = gameState.players.find(p => p.id === gameState.myPlayerId)?.role;
    const isWolf = ['WEREWOLF', 'WOLF_KING', 'BEAUTY_WOLF'].includes(myRole as string);

    let wolfAppendix = "";
    if (isWolf) {
        const teammates = gameState.players.filter(p =>
            p.id !== gameState.myPlayerId &&
            ['WEREWOLF', 'WOLF_KING', 'BEAUTY_WOLF'].includes(p.role as string)
        ).map(p => `${p.number}号`);

        const hasMixblood = (gameState.config.roles['MIXBLOOD'] || 0) > 0;
        const teammateStr = teammates.length > 0 ? `已知狼队友: [${teammates.join(', ')}]` : '无已知队友';

        wolfAppendix = `
## ⚠️ 狼人视角特殊规则
你是狼人阵营。${teammateStr}。
${hasMixblood
                ? '注意: 板子含混血儿，可能存在未知的狼阵营成员。'
                : '当前板子无隐藏狼队成员，除已知队友外所有人的"狼人"概率必须为 0%。'}`;
    }

    // === Night Actions (readable) ===
    const nightInfo: string[] = [];
    if (nightActions.wolfKill) nightInfo.push(`狼刀目标: ${nightActions.wolfKill}号`);
    if (nightActions.witchSave) nightInfo.push(`女巫救药: ${nightActions.witchSave}号`);
    if (nightActions.witchPoison) nightInfo.push(`女巫毒药: ${nightActions.witchPoison}号`);
    if (nightActions.guardProtect) nightInfo.push(`守卫守护: ${nightActions.guardProtect}号`);

    // === Skill State (readable) ===
    const skillInfo: string[] = [];
    if (gameState.skillState.witchMedicUsed) skillInfo.push('女巫救药已使用');
    if (gameState.skillState.witchPoisonUsed) skillInfo.push('女巫毒药已使用');
    if (gameState.skillState.hunterStatus !== 'UNKNOWN') {
        skillInfo.push(`猎人状态: ${gameState.skillState.hunterStatus === 'CAN_SHOOT' ? '可以开枪' : '不能开枪'}`);
    }

    // === Build Enhanced Context ===
    const enhancedContext = {
        角色配置: roleConfig,
        人数: gameState.config.playerCount,
        当前天数: gameState.day,
        当前阶段: gameState.phase,
        我的号码: idToNum(gameState.myPlayerId || undefined),
        我的身份: myRole || '未知',
        技能状态: skillInfo.length > 0 ? skillInfo : undefined,
        今夜行动: nightInfo.length > 0 ? nightInfo : undefined,
        玩家列表: playerList,
        时间线: timeline,
    };

    // === All roles in game (for probability constraint) ===
    const allRoles = Object.entries(gameState.config.roles)
        .filter(([, count]) => count > 0)
        .map(([role]) => role)
        .join(', ');

    // === System Prompt (全中文) ===
    const messages = [
        {
            role: 'system',
            content: `你是一位顶尖的狼人杀比赛分析师。根据我提供的 JSON 游戏数据，进行逻辑推理并输出分析结果。

# 输入数据说明
- **角色配置**: 当前板子中包含的角色和数量
- **玩家列表**: 每个玩家的状态和已知信息
- **时间线**: 按天分组的事件（发言、投票、死亡等）
- **技能状态**: 女巫药水、守卫守护等使用情况
- **今夜行动**: 本夜的具体操作目标

# 绝对事实（不可违反）
1. **"标记"字段**是用户根据查验/救人等操作手动标记的，视为绝对真相:
   - GOOD = 预言家查验为好人（金水）
   - BAD = 预言家查验为坏人（查杀）
   - SILVER = 女巫救过的人（银水）
   - PROTECT = 守卫保护过的人
2. **"已公开身份"**是因游戏事件自动翻牌的身份（如白痴被放逐翻牌），绝对真实
3. **"已知狼队友"** = true 的玩家，其身份100%确定是狼人
4. **"身份"字段**只出现在我自己身上，是我的真实角色
5. 只分析角色配置中存在的角色，不要臆造不存在的角色
${wolfAppendix}

# 分析维度（请按以下维度逐步推理）
1. **事实回顾**: 目前谁死了？谁是警长？哪些技能已使用？
2. **发言分析**: 各玩家发言的核心观点是什么？谁在踩谁？谁在保谁？
3. **投票动机**: 投票行为是否与发言立场一致？异常投票暗示什么？
4. **身份排除法**: 已确认身份的玩家排除后，剩余角色如何分配？
5. **逻辑矛盾**: 是否存在多人同时跳同一身份？是否有与已知事实冲突的言论？
6. **阵营分析**: 基于以上推理，划分"大概率好人"、"大概率狼人"、"待观察"三组

# 输出格式（JSON）
输出一个 JSON 对象，结构如下：

{
  "reasoning": "（300-500字的中文推理过程，按上述维度逐步分析）",
  "logical_contradictions": ["矛盾1", "矛盾2"],
  "winRate": 50,
  "dangerAlert": "紧急警报文字 或 null",
  "players": {
    "p-1": {
      "roleProbabilities": { "角色名": 概率 },
      "analysis": "50字以内的中文分析"
    }
  }
}

# 概率规则（严格遵守）
1. 每个玩家的 roleProbabilities 中，所有概率之和必须**恰好等于 100**
2. 必须覆盖当前板子所有存在的角色: [${allRoles}]
3. 概率为 0 的角色也要写出来（写 0 即可）
4. 已确认身份的玩家（标记/已公开身份/自己），对应角色概率设为 100，其余为 0
5. players 的 key 使用 "p-号码" 格式（如 "p-1", "p-2"）

# 输出要求
1. 只输出原始 JSON 字符串，不要添加 markdown 格式标记
2. 所有文字内容必须使用**简体中文**
3. 必须为**每一个玩家**都给出分析，不能遗漏
`
        },
        {
            role: 'user',
            content: JSON.stringify(enhancedContext)
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

        // [AI Logger] Record successful analysis
        logAIAnalysis({
            day: gameState.day,
            phase: gameState.phase,
            input: enhancedContext,
            messages,
            rawOutput: rawJson,
            parsed: aiData,
        });

        return {
            analysis: aiData.reasoning || aiData.analysis || "AI分析完成", // Use reasoning as main analysis text
            probabilities,
            roleProbabilities,
            winRate: aiData.winRate || 50,
            dangerAlert: aiData.dangerAlert || null,
            playerAnalysis,
            debugContext: enhancedContext // [NEW] Return context
        };

    } catch (e) {
        // [AI Logger] Record failed analysis
        logAIAnalysis({
            day: gameState.day,
            phase: gameState.phase,
            input: enhancedContext,
            messages,
            rawOutput: '',
            parsed: null,
            error: e instanceof Error ? e.message : String(e),
        });

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
