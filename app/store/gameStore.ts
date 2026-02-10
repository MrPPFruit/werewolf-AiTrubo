import { create } from 'zustand';
import { GameState, Player, Role, GamePhase, GameLog, LogType, GameRelation } from '@/app/types/game';

interface GameStore extends GameState {
    // Actions
    setupGame: (playerCount: number, roles: Record<Role, number>, myRole: Role, myNumber: number, templateId?: string) => void;
    nextPhase: () => void;
    setPhase: (phase: GamePhase) => void;
    updatePlayer: (playerId: string, updates: Partial<Player>) => void;
    addLog: (type: LogType, message: string, sourceId?: string, targetId?: string) => void;
    killPlayer: (playerId: string) => void;
    revivePlayer: (playerId: string) => void;
    setSheriff: (playerId: string | null) => void;
    transferSheriff: (targetId: string | null) => void; // New: Transfer or Lost
    toggleTeammateMark: (playerId: string) => void;
    setPlayerMark: (playerId: string, mark: Role | 'GOOD' | 'BAD' | 'SILVER' | 'PROTECT' | null) => void;
    togglePlayerTag: (playerId: string, tag: 'SHOOTER' | 'SHOT_DEAD') => void;
    addRelation: (type: GameRelation['type'], sourceId: string, targetId?: string) => void; // New: Add relation
    wolfSelfDestruct: (playerId: string) => void; // New: Wolf Suicide
    updateProbabilities: (probabilities: Record<string, Record<string, number>>) => void;
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
};

const initialState: GameState = {
    id: '',
    config: { playerCount: 0, roles: initialRoles },
    phase: 'SETUP',
    day: 0,
    players: [],
    logs: [],
    relations: [], // Init relations
    myPlayerId: null,
    sheriffId: null,
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
            config: { playerCount, roles, templateId }, // Store templateId
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
        // Basic phase transition logic (simplified for now)
        // Detailed implementation will depend on game rules
        const currentPhase = get().phase;
        let next = currentPhase;
        // TODO: Implement full phase machine
        set({ phase: next });
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
                    phase: state.phase,
                    type,
                    message,
                    sourcePlayerId: sourceId,
                    targetPlayerId: targetId,
                },
            ],
        })),

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

        // Log the transfer/loss
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

    wolfSelfDestruct: (playerId) => {
        const p = get().players.find(p => p.id === playerId);
        if (!p) return;

        get().killPlayer(playerId);
        get().addLog('ACTION', `狼人 ${p.number} 号自爆`, playerId);
        get().setPhase('NIGHT_START'); // Direct to Night
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
                    timestamp: Date.now()
                }
            ]
        }));
    },

    toggleTeammateMark: (playerId) => {
        const { players, config } = get();
        const targetPlayer = players.find(p => p.id === playerId);
        if (!targetPlayer) return;

        // If currently marked, just unmark (always allowed)
        if (targetPlayer.isMarkedTeammate) {
            set((state) => ({
                players: state.players.map((p) =>
                    p.id === playerId ? { ...p, isMarkedTeammate: false } : p
                ),
            }));
            return;
        }

        // If marking, check limit
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
            // Optional: Notify user limit reached? For now just don't mark.
            // A toast or log would be better, but keeping it simple for store logic.
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

    resetGame: () => set(initialState),
}));
