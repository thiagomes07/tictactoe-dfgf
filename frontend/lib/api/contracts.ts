import type {
  AiDifficulty,
  ChatMessage,
  MatchMode,
  MatchMove,
  MatchSnapshot,
  OfficeAnnouncement,
  PlayerSide,
  RoomSnapshot
} from "@/types/game";

export const API_ROUTES = {
  health: "/v1/health",
  matches: "/v1/matches",
  matchById: (matchId: string) => `/v1/matches/${encodeURIComponent(matchId)}`,
  matchMoves: (matchId: string) => `/v1/matches/${encodeURIComponent(matchId)}/moves`,
  matchChatMessages: (matchId: string) => `/v1/matches/${encodeURIComponent(matchId)}/chat/messages`,
  rooms: "/v1/rooms",
  roomByCode: (roomCode: string) => `/v1/rooms/${encodeURIComponent(roomCode)}`,
  roomJoin: (roomCode: string) => `/v1/rooms/${encodeURIComponent(roomCode)}/join`
} as const;

export const WS_ROUTES = {
  matchSocket: (matchId: string) => `/v1/ws/matches/${encodeURIComponent(matchId)}`
} as const;

export interface HealthResponse {
  status: "ok" | "degraded";
  service: string;
  version: string;
  now: string;
}

export interface SessionTicket {
  sessionId: string;
  playerId: string;
  reconnectToken: string;
  heartbeatIntervalMs: number;
}

export interface CreateMatchRequest {
  mode: MatchMode;
  hostPlayerId: string;
  hostDisplayName: string;
  guestDisplayName?: string;
  roomCode?: string;
  aiDifficulty?: AiDifficulty;
  preferredSide?: PlayerSide;
}

export interface CreateMatchResponse {
  match: MatchSnapshot;
  room: RoomSnapshot | null;
  session: SessionTicket;
}

export interface GetMatchResponse {
  match: MatchSnapshot;
}

export interface SubmitMoveRequest {
  playerId: string;
  cellIndex: number;
  clientMoveId?: string;
}

export interface SubmitMoveResponse {
  match: MatchSnapshot;
  move: MatchMove;
  generatedMessages: ChatMessage[];
  announcement: OfficeAnnouncement | null;
}

export interface ListMatchMessagesResponse {
  items: ChatMessage[];
  nextCursor: string | null;
}

export interface SendChatMessageRequest {
  playerId: string;
  body: string;
  clientMessageId?: string;
}

export interface SendChatMessageResponse {
  accepted: boolean;
  message: ChatMessage;
  aiReplyQueued: boolean;
}

export interface CreateRoomRequest {
  hostPlayerId: string;
  hostDisplayName: string;
}

export interface CreateRoomResponse {
  room: RoomSnapshot;
  session: SessionTicket;
}

export interface GetRoomResponse {
  room: RoomSnapshot;
  activeMatchId: string | null;
}

export interface JoinRoomRequest {
  playerId: string;
  displayName: string;
}

export interface JoinRoomResponse {
  room: RoomSnapshot;
  activeMatchId: string | null;
  session: SessionTicket;
}

interface WsEnvelope<TType extends string, TPayload> {
  type: TType;
  payload: TPayload;
  emittedAt: string;
}

export type MatchServerEvent =
  | WsEnvelope<"match.snapshot", { match: MatchSnapshot }>
  | WsEnvelope<"match.move.applied", { match: MatchSnapshot; move: MatchMove }>
  | WsEnvelope<"match.finished", { match: MatchSnapshot; reason: "win" | "draw" | "timeout" | "resign" }>
  | WsEnvelope<"chat.message.created", { message: ChatMessage }>
  | WsEnvelope<"announcement.created", { announcement: OfficeAnnouncement }>
  | WsEnvelope<"room.updated", { room: RoomSnapshot }>
  | WsEnvelope<"error", { code: string; message: string }>;

export type MatchClientEvent =
  | WsEnvelope<"presence.ping", { sessionId: string }>
  | WsEnvelope<"chat.typing", { playerId: string; isTyping: boolean }>
  | WsEnvelope<"match.request_snapshot", { sessionId: string }>;

const SERVER_EVENT_TYPES = new Set<MatchServerEvent["type"]>([
  "match.snapshot",
  "match.move.applied",
  "match.finished",
  "chat.message.created",
  "announcement.created",
  "room.updated",
  "error"
]);

export function isMatchServerEvent(value: unknown): value is MatchServerEvent {
  if (!value || typeof value !== "object") return false;
  const maybeEvent = value as Partial<MatchServerEvent>;
  return typeof maybeEvent.type === "string" && SERVER_EVENT_TYPES.has(maybeEvent.type as MatchServerEvent["type"]);
}
