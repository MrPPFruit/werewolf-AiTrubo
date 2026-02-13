export type Role =
  | 'VILLAGER'
  | 'WEREWOLF'
  | 'SEER'
  | 'WITCH'
  | 'HUNTER'
  | 'GUARD'
  | 'IDIOT'
  | 'WOLF_KING'
  | 'BEAUTY_WOLF'
  | 'MIXBLOOD';

export type GamePhase =
  | 'SETUP' // Configuration
  | 'NIGHT_START' // Night falls
  | 'WEREWOLF_ACTION' // Wolves kill
  | 'SEER_ACTION' // Seer checks
  | 'WITCH_ACTION' // Witch saves/poisons
  | 'HUNTER_ACTION' // Hunter check status (passive)
  | 'GUARD_ACTION' // Guard protects
  | 'DAY_START' // Day breaks
  | 'DEATH_ANNOUNCE' // Announce deaths
  | 'ELECTION' // Sheriff election
  | 'SPEECH' // Players speak
  | 'VOTE' // Vote for exile
  | 'EXILE_SPEECH' // Exiled player speaks
  | 'GAME_OVER';

export type PlayerStatus = 'ALIVE' | 'DEAD' | 'EXILED';

export interface Player {
  id: string;
  number: number;
  role?: Role;
  status: PlayerStatus;
  isSheriff: boolean;
  isMarkedTeammate?: boolean; // Local visual mark for teammates (e.g. for Werewolves)
  markedRole?: Role | 'GOOD' | 'BAD' | 'SILVER' | 'PROTECT'; // Local mark for Seer/Witch/Guard
  roleProbabilities?: Record<string, number>; // Local analysis: Role -> Probability %
  tags?: ('SHOOTER' | 'SHOT_DEAD')[]; // Special status tags
  isCampaigning?: boolean; // Sheriff election: participating
  hasQuitElection?: boolean; // Sheriff election: withdrew
  mixbloodTargetId?: string; // Mixblood: chosen role model
  notes: string; // User notes about this player
  avatar?: string;
  analysis?: string; // AI Logic Analysis for this player
}

export type LogType = 'SYSTEM' | 'VOTE' | 'DEATH' | 'SPEECH' | 'ACTION';

export interface GameLog {
  id: string;
  timestamp: number;
  day: number; // Game day
  phase: GamePhase;
  type: LogType;
  message: string;
  originalMessage?: string; // For restoring edited logs
  summary?: string; // AI Summarized Logic Point
  sourcePlayerId?: string;
  targetPlayerId?: string;
}

export interface GameRelation {
  id: string;
  type: 'SHOOT' | 'SHERIFF_TRANSFER' | 'SHERIFF_LOST' | 'VOTE' | 'WITCH_SAVE' | 'WITCH_POISON' | 'GUARD_PROTECT' | 'WOLF_KILL';
  sourceId: string; // Shooter, Previous Sheriff, Voter, Witch, Guard, Wolf
  targetId?: string; // Victim, Next Sheriff, Vote Target
  day: number; // The game day this occurred
  phase?: GamePhase; // The phase this occurred (e.g. ELECTION vs VOTE)
  round?: number; // Voting round (default 1, increases on PK)
  timestamp: number;
}

export interface ASRState {
  type: 'CLOUD' | 'LOCAL';
  model: string;
  status: 'READY' | 'RECORDING' | 'PROCESSING' | 'ERROR';
  errorMessage?: string;
}

export interface SkillState {
  witchMedicUsed: boolean;
  witchPoisonUsed: boolean;
  guardLastProtectId: string | null;
  hunterStatus: 'CAN_SHOOT' | 'CANNOT_SHOOT' | 'UNKNOWN';
  wolfKillTargetId: string | null; // New: Wolf kill target
}

export interface GameState {
  id: string;
  config: {
    playerCount: number;
    roles: Record<Role, number>;
    templateId?: string; // ID of the selected template (e.g. '12_standard', '12_guard')
  };
  phase: GamePhase;
  day: number;
  players: Player[];
  relations: GameRelation[]; // New: Track relationships like shooting, sheriff transfer
  logs: GameLog[];
  myPlayerId: string | null; // The user's own player ID
  sheriffId: string | null;
  currentVoteRound: number; // Current voting round (1, 2, 3...)
  skillState: SkillState; // New: Track special role skills
  asrState: ASRState; // Current ASR status
  createdAt: number;
}
