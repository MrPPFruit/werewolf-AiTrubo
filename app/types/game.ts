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
}

export type LogType = 'SYSTEM' | 'VOTE' | 'DEATH' | 'SPEECH' | 'ACTION';

export interface GameLog {
  id: string;
  timestamp: number;
  phase: GamePhase;
  type: LogType;
  message: string;
  sourcePlayerId?: string;
  targetPlayerId?: string;
}

export interface GameRelation {
  id: string;
  type: 'SHOOT' | 'SHERIFF_TRANSFER' | 'SHERIFF_LOST' | 'VOTE';
  sourceId: string; // Shooter, Previous Sheriff, or Voter
  targetId?: string; // Victim, Next Sheriff, or Vote Target (undefined if LOST or ABSTAIN)
  day: number; // The game day this occurred
  timestamp: number;
}

export interface ASRState {
  type: 'CLOUD' | 'LOCAL';
  model: string;
  status: 'READY' | 'RECORDING' | 'PROCESSING' | 'ERROR';
  errorMessage?: string;
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
  createdAt: number;
}
