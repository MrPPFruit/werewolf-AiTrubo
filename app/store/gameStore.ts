import { create } from 'zustand';
import { GameState, Player, Role, GamePhase, GameLog, LogType, GameRelation } from '@/app/types/game';
import { initAILogger } from '@/app/services/aiLogger';

interface GameStore extends GameState {
    // Actions
    setupGame: (playerCount: number, roles: Record<Role, number>, myRole: Role, myNumber: number, templateId?: string) => void;
    nextPhase: () => void;
    setPhase: (phase: GamePhase) => void;
    updatePlayer: (playerId: string, updates: Partial<Player>) => void;
    addLog: (type: LogType, message: string, sourceId?: string, targetId?: string) => string;
    updateLog: (id: string, message: string) => void;
    updateLogSummary: (id: string, summary: string) => void;
    killPlayer: (playerId: string) => void;
    exilePlayer: (playerId: string) => void;
    revivePlayer: (playerId: string) => void;
    setSheriff: (playerId: string | null) => void;
    transferSheriff: (targetId: string | null) => void;
    toggleTeammateMark: (playerId: string) => void;
    setPlayerMark: (playerId: string, mark: Role | 'GOOD' | 'BAD' | 'SILVER' | 'PROTECT' | null) => void;
    togglePlayerTag: (playerId: string, tag: 'SHOOTER' | 'SHOT_DEAD') => void;
    addRelation: (type: GameRelation['type'], sourceId: string, targetId?: string) => void;
    submitVote: (voterId: string, targetId: string | null) => void; // New: Vote action
    retractVote: (voterId: string) => void;
    nextVoteRound: () => void; // New: Advance to next PK round
    organizeVote: (targetIds: string[]) => void;
    wolfSelfDestruct: (playerId: string) => void;
    toggleCampaign: (playerId: string) => void;
    quitElection: (playerId: string) => void;
    setMixbloodTarget: (targetId: string) => void;
    markWolfKill: (targetId: string) => void; // New: Wolf mark target
    // Skill Actions
    useWitchMedic: (targetId: string) => void;
    useWitchPoison: (targetId: string) => void;
    guardPlayer: (targetId: string) => void;


    updateProbabilities: (probabilities: Record<string, Record<string, number>>, analysisMap?: Record<string, string>) => void;
    setAsrState: (state: Partial<import('@/app/types/game').ASRState>) => void;
    incrementDay: () => void;
    resetGame: () => void;
}

const initialRoles: Record<Role, number> = {
    VILLAGER: 0,
    WEREWOLF: 0,
    SEER: 0,
    WITCH: 0,
    HUNTER: 0,
    GUARD: 0,
    IDIOT: 0,
    WOLF_KING: 0,
    BEAUTY_WOLF: 0,
    MIXBLOOD: 0,
};

const initialState: GameState = {
    id: '',
    config: { playerCount: 0, roles: initialRoles },
    phase: 'SETUP',
    day: 0,
    players: [],
    logs: [],
    relations: [],
    myPlayerId: null,
    sheriffId: null,
    currentVoteRound: 1, // Default to round 1
    asrState: { // Default ASR State
        type: 'CLOUD',
        model: 'Loading...',
        status: 'READY'
    },
    createdAt: 0,
    skillState: {
        witchMedicUsed: false,
        witchPoisonUsed: false,
        guardLastProtectId: null,
        hunterStatus: 'UNKNOWN',
        wolfKillTargetId: null
    }
};

// Export ActionType for UI components
export type ActionType = 'KILL' | 'REVIVE' | 'SHERIFF' | 'SHERIFF_LOST' | 'RECORD' | 'MARK_TEAMMATE' | 'MARK_ROLE' | 'TOGGLE_TAG' | 'SELF_DESTRUCT' | 'ADD_RELATION' | 'TOGGLE_CAMPAIGN' | 'QUIT_ELECTION' | 'SET_MIXBLOOD_TARGET' | 'WITCH_SAVE' | 'WITCH_POISON' | 'GUARD_PROTECT' | 'WOLF_KILL';

export const useGameStore = create<GameStore>((set, get) => ({
    ...initialState,

    setupGame: (playerCount, roles, myRole, myNumber, templateId) => {
        const players: Player[] = Array.from({ length: playerCount }, (_, i) => ({
            id: `p-${i + 1}`,
            number: i + 1,
            status: 'ALIVE',
            isSheriff: false,
            role: i + 1 === myNumber ? myRole : undefined, // Only set own role initially
            notes: '',
            roleProbabilities: {}, // Init empty analysis
        }));

        set({
            id: crypto.randomUUID(),
            config: { playerCount, roles, templateId },
            players,
            phase: 'NIGHT_START',
            day: 1,
            logs: [],
            myPlayerId: `p-${myNumber}`,
            sheriffId: null,
            currentVoteRound: 1,
            createdAt: Date.now(),
        });

        // Initialize AI Logger for this game session
        initAILogger(get().id, { playerCount, roles, templateId });

        get().addLog('SYSTEM', 'Game Started');
    },

    nextPhase: () => {
        const currentPhase = get().phase;
        // Basic placeholder for phase logic
        set({ phase: currentPhase });
    },

    setPhase: (phase) => set({ phase, currentVoteRound: 1 }),

    incrementDay: () => set((state) => ({ day: state.day + 1, currentVoteRound: 1 })),

    updatePlayer: (playerId, updates) =>
        set((state) => ({
            players: state.players.map((p) => (p.id === playerId ? { ...p, ...updates } : p)),
        })),

    addLog: (type, message, sourceId, targetId) => {
        const id = crypto.randomUUID();
        set((state) => ({
            logs: [
                ...state.logs,
                {
                    id,
                    timestamp: Date.now(),
                    day: state.day,
                    phase: state.phase,
                    type,
                    message,
                    sourcePlayerId: sourceId,
                    targetPlayerId: targetId,
                },
            ],
        }));
        return id;
    },

    updateLog: (id, newMessage) => {
        set(state => ({
            logs: state.logs.map(log => {
                if (log.id === id) {
                    return {
                        ...log,
                        message: newMessage,
                        // If originalMessage is slightly different or undefined, set it.
                        // We only set originalMessage if it's not already set, preserving the TRUE original.
                        originalMessage: log.originalMessage || log.message
                    };
                }
                return log;
            })
        }));
    },

    updateLogSummary: (id, summary) => {
        set(state => ({
            logs: state.logs.map(log => (log.id === id ? { ...log, summary } : log))
        }));
    },

    killPlayer: (playerId) => {
        get().updatePlayer(playerId, { status: 'DEAD' });
        const p = get().players.find(p => p.id === playerId);
        get().addLog('DEATH', `玩家 ${p?.number} 号被标记死亡`, undefined, playerId);
    },

    exilePlayer: (playerId) => {
        const p = get().players.find(p => p.id === playerId);
        if (!p) return;
        // 白痴被放逐翻牌不死，但失去投票权
        if (p.role === 'IDIOT') {
            get().updatePlayer(playerId, { status: 'EXILED' });
            get().addLog('ACTION', `玩家 ${p.number} 号被放逐，翻牌白痴，不死但失去投票权`, undefined, playerId);
        } else {
            get().updatePlayer(playerId, { status: 'DEAD' });
            get().addLog('DEATH', `玩家 ${p.number} 号被放逐出局`, undefined, playerId);
        }
    },

    revivePlayer: (playerId) => {
        get().updatePlayer(playerId, { status: 'ALIVE' });
        const p = get().players.find(p => p.id === playerId);
        get().addLog('ACTION', `玩家 ${p?.number} 号复活`, undefined, playerId);
    },

    setSheriff: (playerId: string | null) => {
        const { players } = get();
        const newPlayers = players.map(p => ({ ...p, isSheriff: p.id === playerId }));
        set({ players: newPlayers, sheriffId: playerId });
        if (playerId) {
            get().addLog('SYSTEM', `玩家 ${players.find(p => p.id === playerId)?.number} 当选警长`, undefined, playerId);
        }
    },

    transferSheriff: (targetId) => {
        const currentSheriffId = get().sheriffId;
        const { players } = get();

        if (targetId) {
            get().addRelation('SHERIFF_TRANSFER', currentSheriffId || 'system', targetId);
            get().addLog('SYSTEM', `警徽流转: ${players.find(p => p.id === currentSheriffId)?.number || '?'} -> ${players.find(p => p.id === targetId)?.number}`, currentSheriffId || undefined, targetId);
            get().setSheriff(targetId);
        } else {
            get().addRelation('SHERIFF_LOST', currentSheriffId || 'system');
            get().addLog('SYSTEM', `警徽流失`, currentSheriffId || undefined);
            get().setSheriff(null);
        }
    },

    submitVote: (voterId, targetId) => {
        const { players, day, phase } = get();
        const voter = players.find(p => p.id === voterId);
        const target = targetId ? players.find(p => p.id === targetId) : null;

        if (!voter) return;

        // Remove previous vote for this phase if exists (to avoid duplicates in log if retrying, or just append?)
        // Usually we append, but for accurate state we might want to cleanup? 
        // Let's just append for history, but UI filters latest.
        // Actually, if we use `retractVote` for modification, we are good.

        // Let's just append for history, but UI filters latest.
        // Actually, if we use `retractVote` for modification, we are good.

        get().addRelation('VOTE', voterId, targetId || undefined);

        const message = target
            ? `玩家 ${voter.number} 投票给 -> ${target.number}`
            : `玩家 ${voter.number} 弃票`;
        get().addLog('VOTE', message, voterId, targetId || undefined);
    },

    retractVote: (voterId) => {
        const { day, phase, currentVoteRound } = get();
        // Remove ALL vote relations for this voter in this day/phase/ROUND to allow re-voting
        set(state => ({
            relations: state.relations.filter(r =>
                !(r.type === 'VOTE' && r.sourceId === voterId && r.day === day && r.phase === phase && (r.round || 1) === currentVoteRound)
            )
        }));
    },

    nextVoteRound: () => {
        const { currentVoteRound, myPlayerId } = get();
        set({ currentVoteRound: currentVoteRound + 1 });
        get().addLog('ACTION', `开启第 ${currentVoteRound + 1} 轮投票 (PK)`, myPlayerId || undefined);
    },

    organizeVote: (targetIds) => {
        const { players, myPlayerId, sheriffId } = get();
        if (!sheriffId) return; // Logic check

        const sheriff = players.find(p => p.id === sheriffId);
        const targets = players.filter(p => targetIds.includes(p.id)).map(p => p.number).join(', ');

        if (targets) {
            get().addLog('ACTION', `警长 ${sheriff?.number || '?'} 归票于: [${targets}]`, sheriffId);
        }
    },

    wolfSelfDestruct: (playerId) => {
        const p = get().players.find(p => p.id === playerId);
        if (!p) return;

        get().killPlayer(playerId);
        get().addLog('ACTION', `狼人 ${p.number} 号自爆`, playerId);
        get().setPhase('NIGHT_START');
    },

    addRelation: (type, sourceId, targetId) => {
        set(state => ({
            relations: [
                ...state.relations,
                {
                    id: crypto.randomUUID(),
                    type,
                    sourceId,
                    targetId,
                    day: get().day,
                    phase: get().phase,
                    round: get().currentVoteRound, // Add current round
                    timestamp: Date.now()
                }
            ]
        }));
    },

    toggleTeammateMark: (playerId) => {
        const { players, config } = get();
        const targetPlayer = players.find(p => p.id === playerId);
        if (!targetPlayer) return;

        if (targetPlayer.isMarkedTeammate) {
            set((state) => ({
                players: state.players.map((p) =>
                    p.id === playerId ? { ...p, isMarkedTeammate: false } : p
                ),
            }));
            return;
        }

        const totalWolves = Object.entries(config.roles)
            .filter(([role]) => ['WEREWOLF', 'WOLF_KING', 'BEAUTY_WOLF'].includes(role))
            .reduce((sum, [, count]) => sum + count, 0);

        const currentMarkedCount = players.filter(p => p.isMarkedTeammate).length;

        if (currentMarkedCount < totalWolves) {
            set((state) => ({
                players: state.players.map((p) =>
                    p.id === playerId ? { ...p, isMarkedTeammate: true } : p
                ),
            }));
        } else {
            get().addLog('SYSTEM', '标记的狼队友数量不能超过狼人总数。');
        }
    },

    setPlayerMark: (playerId, mark) => {
        set((state) => ({
            players: state.players.map((p) =>
                p.id === playerId ? { ...p, markedRole: mark === null ? undefined : mark } : p
            ),
        }));
    },

    updateProbabilities: (probabilities, analysisMap) =>
        set((state) => {
            // Pre-compute: which roles exist in this game config
            const wolfRoles = ['WEREWOLF', 'WOLF_KING', 'BEAUTY_WOLF'];
            const hasHunter = (state.config.roles['HUNTER'] || 0) > 0;
            const hasWolfKing = (state.config.roles['WOLF_KING'] || 0) > 0;

            return {
                players: state.players.map((p) => {
                    let newProbs = probabilities[p.id] || p.roleProbabilities;

                    // === Priority 1: Self (absolute certainty) ===
                    if (p.id === state.myPlayerId && p.role) {
                        newProbs = { [p.role]: 100 };
                    }
                    // === Priority 2: Exiled Idiot (public: flipped card) ===
                    else if (p.status === 'EXILED') {
                        newProbs = { IDIOT: 100 };
                    }
                    // === Priority 3: Shooter confirmed identity (public: shot someone) ===
                    else if (p.tags?.includes('SHOOTER') && p.status === 'DEAD') {
                        // Shooter died and shot: either HUNTER or WOLF_KING
                        if (hasHunter && !hasWolfKing) {
                            newProbs = { HUNTER: 100 };
                        } else if (!hasHunter && hasWolfKing) {
                            newProbs = { WOLF_KING: 100 };
                        } else if (p.isMarkedTeammate || p.markedRole === 'BAD') {
                            // Known wolf who shot → WOLF_KING
                            newProbs = { WOLF_KING: 100 };
                        } else if (p.markedRole === 'GOOD' || p.markedRole === 'SILVER') {
                            // Verified good who shot → HUNTER
                            newProbs = { HUNTER: 100 };
                        } else {
                            // Both exist, unknown allegiance: high probability both
                            newProbs = { HUNTER: 50, WOLF_KING: 50 };
                        }
                    }
                    // === Priority 4: Marked Teammate (user-confirmed wolf) ===
                    else if (p.isMarkedTeammate) {
                        newProbs = { WEREWOLF: 100 };
                    }
                    // === Priority 5: Seer verification marks ===
                    else if (p.markedRole === 'BAD') {
                        // 查杀: confirmed wolf team, set wolf roles high
                        newProbs = { ...newProbs, VILLAGER: 0, SEER: 0, WITCH: 0, HUNTER: 0, GUARD: 0, IDIOT: 0 };
                    }
                    else if (p.markedRole === 'GOOD') {
                        // 金水: confirmed good, zero out all wolf roles
                        newProbs = { ...newProbs, WEREWOLF: 0, WOLF_KING: 0, BEAUTY_WOLF: 0 };
                    }
                    else if (p.markedRole === 'SILVER') {
                        // 银水 (witch saved): confirmed not wolf
                        newProbs = { ...newProbs, WEREWOLF: 0, WOLF_KING: 0, BEAUTY_WOLF: 0 };
                    }
                    // === Priority 6: Wolf perspective override ===
                    else if (wolfRoles.includes(state.players.find((me: Player) => me.id === state.myPlayerId)?.role || '')) {
                        // Keep AI probabilities for other roles, only set WEREWOLF to 0
                        newProbs = { ...newProbs, WEREWOLF: 0 };
                    }

                    return {
                        ...p,
                        roleProbabilities: newProbs,
                        analysis: analysisMap?.[p.id] || p.analysis,
                    };
                }),
            }
        }),

    togglePlayerTag: (playerId, tag) => {
        set((state) => ({
            players: state.players.map((p) => {
                if (p.id !== playerId) return p;
                const tags = p.tags || [];
                const newTags = tags.includes(tag)
                    ? tags.filter((t) => t !== tag)
                    : [...tags, tag];
                return { ...p, tags: newTags };
            }),
        }));
    },

    toggleCampaign: (playerId) => {
        set((state) => ({
            players: state.players.map((p) => {
                if (p.id !== playerId) return p;
                const isCampaigning = !p.isCampaigning;
                return { ...p, isCampaigning, hasQuitElection: isCampaigning ? false : p.hasQuitElection };
            }),
        }));

        const player = get().players.find(p => p.id === playerId);
        if (player) {
            const action = player.isCampaigning ? '上警' : '取消上警';
            get().addLog('ACTION', `玩家 ${player.number} ${action}`, playerId);
        }
    },

    quitElection: (playerId) => {
        set((state) => ({
            players: state.players.map((p) =>
                p.id === playerId ? { ...p, isCampaigning: false, hasQuitElection: true } : p
            ),
        }));
        const player = get().players.find(p => p.id === playerId);
        if (player) {
            get().addLog('ACTION', `玩家 ${player.number} 退水`, playerId);
        }
    },

    setMixbloodTarget: (targetId) => {
        set((state) => ({
            players: state.players.map((p) =>
                p.id === state.myPlayerId ? { ...p, mixbloodTargetId: targetId } : p
            ),
        }));
        const target = get().players.find(p => p.id === targetId);
        get().addLog('SYSTEM', `你已认 ${target?.number} 号为榜样`, get().myPlayerId || undefined);
    },

    markWolfKill: (targetId) => {
        const { myPlayerId, day, phase } = get();
        // Allow re-marking? Yes.
        // Update skill state
        set(state => ({
            skillState: { ...state.skillState, wolfKillTargetId: targetId }
        }));

        // Add relation for AI to pick up
        // Note: Relation usually tracks history. If we change target, do we keep old relation?
        // Better to clean up old WOLF_KILL for this day/phase to avoid confusion?
        // Let's remove old WOLF_KILL for this day first.
        set(state => ({
            relations: state.relations.filter(r =>
                !(r.type === 'WOLF_KILL' && r.day === day)
            )
        }));

        get().addRelation('WOLF_KILL', myPlayerId || 'wolves', targetId);
        get().addLog('ACTION', `狼队锁定目标: ${get().players.find(p => p.id === targetId)?.number} 号`, myPlayerId || undefined, targetId);
    },

    useWitchMedic: (targetId) => {
        const { skillState, myPlayerId } = get();
        if (skillState.witchMedicUsed) return;

        get().revivePlayer(targetId);
        get().addRelation('WITCH_SAVE', myPlayerId || 'witch', targetId);
        get().addLog('ACTION', `女巫使用解药救了 ${get().players.find(p => p.id === targetId)?.number} 号`, myPlayerId || undefined, targetId);

        set(state => ({
            skillState: { ...state.skillState, witchMedicUsed: true }
        }));
    },

    useWitchPoison: (targetId) => {
        const { skillState, myPlayerId } = get();
        if (skillState.witchPoisonUsed) return;

        get().killPlayer(targetId);
        get().addRelation('WITCH_POISON', myPlayerId || 'witch', targetId);
        get().addLog('ACTION', `女巫使用毒药毒死 ${get().players.find(p => p.id === targetId)?.number} 号`, myPlayerId || undefined, targetId);

        set(state => ({
            skillState: { ...state.skillState, witchPoisonUsed: true }
        }));
    },

    guardPlayer: (targetId) => {
        const { skillState, myPlayerId } = get();
        if (skillState.guardLastProtectId === targetId) {
            get().addLog('SYSTEM', '守卫不可连续两晚守护同一名玩家', myPlayerId || undefined);
            return;
        }

        get().addRelation('GUARD_PROTECT', myPlayerId || 'guard', targetId);
        get().addLog('ACTION', `守卫守护了 ${get().players.find(p => p.id === targetId)?.number} 号`, myPlayerId || undefined, targetId);

        set(state => ({
            skillState: { ...state.skillState, guardLastProtectId: targetId }
        }));
    },

    setAsrState: (updates) => {
        set(state => ({
            asrState: {
                ...state.asrState,
                ...updates
            }
        }));
    },

    resetGame: () => set(initialState),
}));
