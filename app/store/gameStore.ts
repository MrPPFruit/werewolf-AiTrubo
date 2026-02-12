import { create } from 'zustand';
import { GameState, Player, Role, GamePhase, GameLog, LogType, GameRelation } from '@/app/types/game';

interface GameStore extends GameState {
    // Actions
    setupGame: (playerCount: number, roles: Record<Role, number>, myRole: Role, myNumber: number, templateId?: string) => void;
    nextPhase: () => void;
    setPhase: (phase: GamePhase) => void;
    updatePlayer: (playerId: string, updates: Partial<Player>) => void;
    addLog: (type: LogType, message: string, sourceId?: string, targetId?: string) => void;
    updateLog: (id: string, message: string) => void;
    killPlayer: (playerId: string) => void;
    revivePlayer: (playerId: string) => void;
    setSheriff: (playerId: string | null) => void;
    transferSheriff: (targetId: string | null) => void;
    toggleTeammateMark: (playerId: string) => void;
    setPlayerMark: (playerId: string, mark: Role | 'GOOD' | 'BAD' | 'SILVER' | 'PROTECT' | null) => void;
    togglePlayerTag: (playerId: string, tag: 'SHOOTER' | 'SHOT_DEAD') => void;
    addRelation: (type: GameRelation['type'], sourceId: string, targetId?: string) => void;
    submitVote: (voterId: string, targetId: string | null) => void; // New: Vote action
    wolfSelfDestruct: (playerId: string) => void;
    toggleCampaign: (playerId: string) => void;
    quitElection: (playerId: string) => void;
    setMixbloodTarget: (targetId: string) => void;
    updateProbabilities: (probabilities: Record<string, Record<string, number>>) => void;
    setAsrState: (state: Partial<import('@/app/types/game').ASRState>) => void; // New ASR State
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
    asrState: { // Default ASR State
        type: 'CLOUD',
        model: 'Loading...',
        status: 'READY'
    },
    createdAt: 0,
};

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
            day: 0,
            logs: [],
            myPlayerId: `p-${myNumber}`,
            sheriffId: null,
            createdAt: Date.now(),
        });

        get().addLog('SYSTEM', 'Game Started');
    },

    nextPhase: () => {
        const currentPhase = get().phase;
        // Basic placeholder for phase logic
        set({ phase: currentPhase });
    },

    setPhase: (phase) => set({ phase }),

    updatePlayer: (playerId, updates) =>
        set((state) => ({
            players: state.players.map((p) => (p.id === playerId ? { ...p, ...updates } : p)),
        })),

    addLog: (type, message, sourceId, targetId) =>
        set((state) => ({
            logs: [
                ...state.logs,
                {
                    id: crypto.randomUUID(),
                    timestamp: Date.now(),
                    day: state.day,
                    phase: state.phase,
                    type,
                    message,
                    sourcePlayerId: sourceId,
                    targetPlayerId: targetId,
                },
            ],
        })),

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

    killPlayer: (playerId) => {
        get().updatePlayer(playerId, { status: 'DEAD' });
        get().addLog('DEATH', `Player ${playerId} marked as DEAD`, undefined, playerId);
    },

    revivePlayer: (playerId) => {
        get().updatePlayer(playerId, { status: 'ALIVE' });
        get().addLog('ACTION', `Player ${playerId} revived`, undefined, playerId);
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
        const { players } = get();
        const voter = players.find(p => p.id === voterId);
        const target = targetId ? players.find(p => p.id === targetId) : null;

        if (!voter) return;

        get().addRelation('VOTE', voterId, targetId || undefined);

        const message = target
            ? `玩家 ${voter.number} 投票给 -> ${target.number}`
            : `玩家 ${voter.number} 弃票`;
        get().addLog('VOTE', message, voterId, targetId || undefined);
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
            get().addLog('SYSTEM', 'Cannot mark more teammates than total wolves.');
        }
    },

    setPlayerMark: (playerId, mark) => {
        set((state) => ({
            players: state.players.map((p) =>
                p.id === playerId ? { ...p, markedRole: mark === null ? undefined : mark } : p
            ),
        }));
    },

    updateProbabilities: (probabilities) =>
        set((state) => ({
            players: state.players.map((p) => ({
                ...p,
                roleProbabilities: probabilities[p.id] || p.roleProbabilities,
            })),
        })),

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
                const hasQuitElection = isCampaigning ? false : p.hasQuitElection;
                return { ...p, isCampaigning, hasQuitElection };
            }),
        }));

        const player = get().players.find(p => p.id === playerId);
        if (player) {
            const action = !player.isCampaigning ? '上警' : '取消上警';
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
