export type MatchMode = "vs_ai" | "pvp_local" | "pvp_remote";
export type AiDifficulty = "pre_almoco" | "avaliacao_anual";
export type PlayerSide = "x" | "o";
export type CellMark = PlayerSide | null;
export type MatchState = "waiting_room" | "in_progress" | "finished";
export type MatchOutcome = "x" | "o" | "draw" | null;
export type ActorId = "estagiario" | "geraldo" | "marlene" | "tulio" | "patricia" | "sistema_dfgf";
export type ChatChannel = "internal_chat" | "office_broadcast";
export type RoomState = "waiting_guest" | "ready" | "playing" | "closed";

export interface BoardSnapshot {
  cells: CellMark[];
  winningLine: number[] | null;
}

export interface MatchParticipant {
  playerId: string;
  displayName: string;
  side: PlayerSide;
  isBot: boolean;
  isHost: boolean;
  isConnected: boolean;
}

export interface MatchSnapshot {
  matchId: string;
  protocolCode: string;
  roomCode: string | null;
  mode: MatchMode;
  aiDifficulty: AiDifficulty | null;
  state: MatchState;
  turn: PlayerSide;
  moveCount: number;
  board: BoardSnapshot;
  participants: MatchParticipant[];
  result: MatchOutcome;
  startedAt: string;
  finishedAt: string | null;
  durationSeconds: number | null;
}

export interface MatchMove {
  moveId: string;
  playerId: string;
  side: PlayerSide;
  cellIndex: number;
  createdAt: string;
}

export interface ChatMessage {
  messageId: string;
  matchId: string;
  protocolCode: string;
  actorId: ActorId;
  actorDisplayName: string;
  channel: ChatChannel;
  body: string;
  createdAt: string;
}

export interface OfficeAnnouncement {
  announcementId: string;
  matchId: string;
  speakerId: ActorId;
  body: string;
  createdAt: string;
}

export interface RoomSnapshot {
  roomCode: string;
  status: RoomState;
  hostPlayerId: string;
  guestPlayerId: string | null;
  createdAt: string;
  expiresAt: string;
}

export type ArchiveStatus = "DEFERIDO" | "INDEFERIDO" | "ARQUIVADO";

export interface MatchArchiveItem {
  id: string;
  protocolCode: string;
  mode: MatchMode;
  startedAt: string;
  finishedAt: string;
  durationSeconds: number;
  status: ArchiveStatus;
  resultLabel: string;
}
