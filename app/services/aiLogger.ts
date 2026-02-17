/**
 * AI Debug Logger Service
 * 
 * 每局游戏自动创建一个 Markdown 日志文件，保存到 game-logs/ 文件夹。
 * 日志包含完整的 AI 推理输入输出，格式可读。
 * 通过 Next.js API Route 写入文件系统。
 */

import { Role } from '@/app/types/game';

interface AILogEntry {
    timestamp: number;
    day: number;
    phase: string;
    input: any;       // enhancedContext sent to AI
    messages: any[];  // Full message array
    rawOutput: string;
    parsed: any;
    error?: string;
}

// Game session state
let currentGameId: string = '';
let currentFilename: string = '';
let currentTemplate: string = '';
let logEntries: AILogEntry[] = [];
let gameStartTime: string = '';
let gameConfig: { playerCount: number; roles: Record<string, number> } | null = null;

// Debounce timer for file saves
let saveTimer: ReturnType<typeof setTimeout> | null = null;

/**
 * Initialize logger for a new game
 */
export const initAILogger = (gameId: string, config?: { playerCount: number; roles: Record<string, number>; templateId?: string }): void => {
    currentGameId = gameId;
    logEntries = [];
    gameConfig = config || null;

    // Generate timestamp-based filename
    const now = new Date();
    gameStartTime = now.toLocaleString('zh-CN', {
        year: 'numeric', month: '2-digit', day: '2-digit',
        hour: '2-digit', minute: '2-digit', second: '2-digit',
        hour12: false
    });

    // Build template string from roles
    const templateParts: string[] = [];
    if (config?.roles) {
        const roleNames: Record<string, string> = {
            VILLAGER: '民', WEREWOLF: '狼', SEER: '预', WITCH: '女',
            HUNTER: '猎', GUARD: '守', IDIOT: '白', WOLF_KING: '狼王',
            BEAUTY_WOLF: '美', MIXBLOOD: '混'
        };
        Object.entries(config.roles).forEach(([role, count]) => {
            if (count > 0) {
                templateParts.push(`${roleNames[role] || role}×${count}`);
            }
        });
    }
    currentTemplate = config?.templateId || templateParts.join(' ') || '未知板型';

    // Create safe filename
    const timeStr = now.toISOString().replace(/[:.]/g, '-').slice(0, 19);
    currentFilename = `${timeStr}_${currentTemplate.replace(/[<>:"/\\|?*\s]/g, '_')}.md`;

    // Save initial file
    saveToFile();
    console.log(`[AILogger] Initialized: ${currentFilename}`);
};

/**
 * Log an AI analysis call
 */
export const logAIAnalysis = (entry: {
    day: number;
    phase: string;
    input: any;
    messages: any[];
    rawOutput: string;
    parsed: any;
    error?: string;
}): void => {
    logEntries.push({
        timestamp: Date.now(),
        ...entry,
    });

    // Debounced save (avoid too frequent writes)
    if (saveTimer) clearTimeout(saveTimer);
    saveTimer = setTimeout(() => saveToFile(), 1000);

    console.log(`[AILogger] Logged #${logEntries.length} (Day ${entry.day}, ${entry.phase})`);
};

/**
 * Generate readable Markdown content
 */
function generateMarkdown(): string {
    const lines: string[] = [];

    // === Header ===
    lines.push(`# 🐺 狼人杀 AI 推理日志`);
    lines.push('');
    lines.push(`| 项目 | 信息 |`);
    lines.push(`|------|------|`);
    lines.push(`| ⏰ 开始时间 | ${gameStartTime} |`);
    lines.push(`| 🎲 板型 | ${currentTemplate} |`);
    lines.push(`| 👥 人数 | ${gameConfig?.playerCount || '?'} 人 |`);
    lines.push(`| 🆔 游戏ID | \`${currentGameId.slice(0, 8)}...\` |`);
    lines.push(`| 📊 分析次数 | ${logEntries.length} 次 |`);
    lines.push('');

    if (gameConfig?.roles) {
        lines.push(`### 角色配置`);
        const roleNames: Record<string, string> = {
            VILLAGER: '村民', WEREWOLF: '狼人', SEER: '预言家', WITCH: '女巫',
            HUNTER: '猎人', GUARD: '守卫', IDIOT: '白痴', WOLF_KING: '狼王',
            BEAUTY_WOLF: '美人狼', MIXBLOOD: '混血儿'
        };
        const roleParts = Object.entries(gameConfig.roles)
            .filter(([, count]) => count > 0)
            .map(([role, count]) => `${roleNames[role] || role} ×${count}`)
            .join(' | ');
        lines.push(`> ${roleParts}`);
        lines.push('');
    }

    lines.push('---');
    lines.push('');

    // === Each Analysis Entry ===
    logEntries.forEach((entry, index) => {
        const time = new Date(entry.timestamp).toLocaleTimeString('zh-CN', { hour12: false });
        const phaseNames: Record<string, string> = {
            NIGHT_START: '🌙 夜晚开始', WEREWOLF_ACTION: '🐺 狼人行动',
            SEER_ACTION: '🔮 预言家查验', WITCH_ACTION: '🧪 女巫行动',
            GUARD_ACTION: '🛡️ 守卫守护', DAY_START: '☀️ 白天',
            DEATH_ANNOUNCE: '💀 死亡公告', ELECTION: '👑 警长竞选',
            SPEECH: '🎤 发言阶段', VOTE: '🗳️ 投票放逐',
            EXILE_SPEECH: '💬 遗言', GAME_OVER: '🏁 游戏结束'
        };

        lines.push(`## 📋 分析 #${index + 1} — 第${entry.day}天 ${phaseNames[entry.phase] || entry.phase}`);
        lines.push(`> 🕐 ${time}`);
        lines.push('');

        // --- Input Context (readable summary) ---
        lines.push(`### 📥 输入上下文`);
        lines.push('');

        if (entry.input) {
            // Player states
            if (entry.input.players) {
                lines.push(`#### 玩家状态`);
                lines.push(`| # | 状态 | 标记 | 标签 | 备注 |`);
                lines.push(`|---|------|------|------|------|`);
                entry.input.players.forEach((p: any) => {
                    const marks = [];
                    if (p.isMarkedTeammate) marks.push('🐺队友');
                    if (p.markedRole) marks.push(`标记:${p.markedRole}`);
                    if (p.isSheriff) marks.push('👑警长');
                    if (p.publicRole) marks.push(`公开:${p.publicRole}`);
                    const tags = p.tags?.join(', ') || '-';
                    const notes = p.notes ? p.notes.slice(0, 20) : '-';
                    lines.push(`| ${p.number} | ${p.status} | ${marks.join(', ') || '-'} | ${tags} | ${notes} |`);
                });
                lines.push('');
            }

            // Vote history
            if (entry.input.voteHistory?.length > 0) {
                lines.push(`#### 投票记录`);
                entry.input.voteHistory.forEach((v: any) => {
                    lines.push(`- 第${v.day}天 R${v.round || 1}: ${v.voterNumber}号 → ${v.targetNumber ? v.targetNumber + '号' : '弃票'}`);
                });
                lines.push('');
            }

            // Night actions
            if (entry.input.nightActions?.length > 0) {
                lines.push(`#### 夜间行动`);
                entry.input.nightActions.forEach((a: any) => {
                    lines.push(`- 第${a.day}夜: ${a.type} (${a.sourceNumber}号 → ${a.targetNumber ? a.targetNumber + '号' : '无目标'})`);
                });
                lines.push('');
            }

            // Game logs
            if (entry.input.gameLogs?.length > 0) {
                lines.push(`#### 游戏日志 (最近)`);
                const recentLogs = entry.input.gameLogs.slice(-10);
                recentLogs.forEach((log: any) => {
                    const src = log.sourceNumber ? `[${log.sourceNumber}号]` : '';
                    lines.push(`- D${log.day} ${log.phase}: ${src} ${log.message?.slice(0, 80) || ''}`);
                });
                if (entry.input.gameLogs.length > 10) {
                    lines.push(`- _(共 ${entry.input.gameLogs.length} 条，仅显示最近 10 条)_`);
                }
                lines.push('');
            }
        }

        // --- Full Prompt (collapsible) ---
        lines.push(`<details>`);
        lines.push(`<summary>📨 完整 Prompt (点击展开)</summary>`);
        lines.push('');
        if (entry.messages?.length > 0) {
            entry.messages.forEach((msg: any, i: number) => {
                lines.push(`**[${msg.role?.toUpperCase() || 'UNKNOWN'}]**`);
                lines.push('```');
                const content = typeof msg.content === 'string' ? msg.content : JSON.stringify(msg.content, null, 2);
                lines.push(content.slice(0, 5000));
                if (content.length > 5000) lines.push(`\n... (截断, 总长 ${content.length} 字符)`);
                lines.push('```');
                lines.push('');
            });
        }
        lines.push(`</details>`);
        lines.push('');

        // --- Output ---
        if (entry.error) {
            lines.push(`### ❌ 错误`);
            lines.push(`\`\`\``);
            lines.push(entry.error);
            lines.push(`\`\`\``);
        } else {
            lines.push(`### 📤 AI 输出`);
            lines.push('');

            if (entry.parsed) {
                // Reasoning
                if (entry.parsed.reasoning) {
                    lines.push(`#### 💭 推理过程`);
                    lines.push(`> ${entry.parsed.reasoning.replace(/\n/g, '\n> ')}`);
                    lines.push('');
                }

                // Player analysis
                if (entry.parsed.players) {
                    lines.push(`#### 🎯 玩家分析`);
                    lines.push(`| # | 分析 | 角色概率 |`);
                    lines.push(`|---|------|---------|`);
                    Object.entries(entry.parsed.players).forEach(([pid, pData]: [string, any]) => {
                        const num = pid.replace('p-', '');
                        const analysis = (pData.analysis || '-').replace(/\|/g, '/').slice(0, 60);
                        const probs = pData.roleProbabilities
                            ? Object.entries(pData.roleProbabilities)
                                .filter(([, v]) => (v as number) > 0)
                                .sort(([, a], [, b]) => (b as number) - (a as number))
                                .slice(0, 3)
                                .map(([r, v]) => `${r}:${v}%`)
                                .join(' ')
                            : '-';
                        lines.push(`| ${num} | ${analysis} | ${probs} |`);
                    });
                    lines.push('');
                }

                // Win rate & danger
                if (entry.parsed.winRate !== undefined) {
                    lines.push(`- **胜率**: ${entry.parsed.winRate}%`);
                }
                if (entry.parsed.dangerAlert) {
                    lines.push(`- **⚠️ 危险警报**: ${entry.parsed.dangerAlert}`);
                }
                lines.push('');
            }

            // Raw output (collapsible)
            lines.push(`<details>`);
            lines.push(`<summary>🔍 原始 JSON 输出 (点击展开)</summary>`);
            lines.push('');
            lines.push('```json');
            try {
                lines.push(JSON.stringify(entry.parsed || entry.rawOutput, null, 2).slice(0, 8000));
            } catch {
                lines.push(entry.rawOutput?.slice(0, 8000) || '(empty)');
            }
            lines.push('```');
            lines.push(`</details>`);
        }

        lines.push('');
        lines.push('---');
        lines.push('');
    });

    // Footer
    lines.push(`_日志由 Werewolf Turbo AI Logger 自动生成_`);

    return lines.join('\n');
}

/**
 * Save current log to file via Electron IPC
 */
async function saveToFile(): Promise<void> {
    if (!currentFilename) return;

    const content = generateMarkdown();

    try {
        // @ts-ignore - Electron API exposed via preload
        if (typeof window !== 'undefined' && window.electronAPI?.saveGameLog) {
            // @ts-ignore
            const res = await window.electronAPI.saveGameLog(currentFilename, content);
            if (!res.success) {
                console.warn('[AILogger] Failed to save:', res.error);
            }
        } else {
            console.warn('[AILogger] Electron API not available, skipping file save');
        }
    } catch (e) {
        console.warn('[AILogger] Save error:', e);
    }
}

/**
 * Get current log entries count
 */
export const getLogCount = (): number => logEntries.length;

/**
 * Get current log filename
 */
export const getLogFilename = (): string => currentFilename;
