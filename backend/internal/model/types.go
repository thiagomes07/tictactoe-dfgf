package model

import "time"

type MatchMode string

const (
	MatchModeVSAI      MatchMode = "vs_ai"
	MatchModePVPLocal  MatchMode = "pvp_local"
	MatchModePVPRemote MatchMode = "pvp_remote"
)

type AiDifficulty string

const (
	AiDifficultyPreAlmoco      AiDifficulty = "pre_almoco"
	AiDifficultyAvaliacaoAnual AiDifficulty = "avaliação_anual"
)

type PlayerSide string

const (
	PlayerSideX PlayerSide = "x"
	PlayerSideO PlayerSide = "o"
)

type MatchState string

const (
	MatchStateWaitingRoom MatchState = "waiting_room"
	MatchStateInProgress  MatchState = "in_progress"
	MatchStateFinished    MatchState = "finished"
)

type MatchOutcome string

const (
	MatchOutcomeX    MatchOutcome = "x"
	MatchOutcomeO    MatchOutcome = "o"
	MatchOutcomeDraw MatchOutcome = "draw"
)

type ActorID string

const (
	ActorEstagiário  ActorID = "estagiario"
	ActorGeraldo     ActorID = "geraldo"
	ActorMarlene     ActorID = "marlene"
	ActorTulio       ActorID = "tulio"
	ActorPatricia    ActorID = "patricia"
	ActorSistemaDFGF ActorID = "sistema_dfgf"
)

type ChatChannel string

const (
	ChatChannelInternalChat    ChatChannel = "internal_chat"
	ChatChannelOfficeBroadcast ChatChannel = "office_broadcast"
)

type RoomState string

const (
	RoomStateWaitingGuest RoomState = "waiting_guest"
	RoomStateReady        RoomState = "ready"
	RoomStatePlaying      RoomState = "playing"
	RoomStateClosed       RoomState = "closed"
)

type BoardSnapshot struct {
	Cells       []*PlayerSide `json:"cells"`
	WinningLine []int         `json:"winningLine"`
}

type MatchParticipant struct {
	PlayerID    string     `json:"playerId"`
	DisplayName string     `json:"displayName"`
	Side        PlayerSide `json:"side"`
	IsBot       bool       `json:"isBot"`
	IsHost      bool       `json:"isHost"`
	IsConnected bool       `json:"isConnected"`
}

type MatchSnapshot struct {
	MatchID         string             `json:"matchId"`
	ProtocolCode    string             `json:"protocolCode"`
	RoomCode        *string            `json:"roomCode"`
	Mode            MatchMode          `json:"mode"`
	AiDifficulty    *AiDifficulty      `json:"aiDifficulty"`
	State           MatchState         `json:"state"`
	Turn            PlayerSide         `json:"turn"`
	MoveCount       int                `json:"moveCount"`
	Board           BoardSnapshot      `json:"board"`
	Participants    []MatchParticipant `json:"participants"`
	Result          *MatchOutcome      `json:"result"`
	StartedAt       time.Time          `json:"startedAt"`
	FinishedAt      *time.Time         `json:"finishedAt"`
	DurationSeconds *int               `json:"durationSeconds"`
}

type MatchMove struct {
	MoveID    string     `json:"moveId"`
	PlayerID  string     `json:"playerId"`
	Side      PlayerSide `json:"side"`
	CellIndex int        `json:"cellIndex"`
	CreatedAt time.Time  `json:"createdAt"`
}

type ChatMessage struct {
	MessageID        string      `json:"messageId"`
	MatchID          string      `json:"matchId"`
	ProtocolCode     string      `json:"protocolCode"`
	ActorID          ActorID     `json:"actorId"`
	ActorDisplayName string      `json:"actorDisplayName"`
	Channel          ChatChannel `json:"channel"`
	Body             string      `json:"body"`
	CreatedAt        time.Time   `json:"createdAt"`
}

type OfficeAnnouncement struct {
	AnnouncementID string    `json:"announcementId"`
	MatchID        string    `json:"matchId"`
	SpeakerID      ActorID   `json:"speakerId"`
	Body           string    `json:"body"`
	CreatedAt      time.Time `json:"createdAt"`
}

type RoomSnapshot struct {
	RoomCode      string    `json:"roomCode"`
	Status        RoomState `json:"status"`
	HostPlayerID  string    `json:"hostPlayerId"`
	GuestPlayerID *string   `json:"guestPlayerId"`
	CreatedAt     time.Time `json:"createdAt"`
	ExpiresAt     time.Time `json:"expiresAt"`
}

type SessionTicket struct {
	SessionID           string `json:"sessionId"`
	PlayerID            string `json:"playerId"`
	ReconnectToken      string `json:"reconnectToken"`
	HeartbeatIntervalMs int    `json:"heartbeatIntervalMs"`
}

type HealthResponse struct {
	Status  string    `json:"status"`
	Service string    `json:"service"`
	Version string    `json:"version"`
	Now     time.Time `json:"now"`
}

type CreateMatchRequest struct {
	Mode             MatchMode     `json:"mode"`
	HostPlayerID     string        `json:"hostPlayerId"`
	HostDisplayName  string        `json:"hostDisplayName"`
	GuestDisplayName *string       `json:"guestDisplayName,omitempty"`
	RoomCode         *string       `json:"roomCode,omitempty"`
	AiDifficulty     *AiDifficulty `json:"aiDifficulty,omitempty"`
	PreferredSide    *PlayerSide   `json:"preferredSide,omitempty"`
}

type CreateMatchResponse struct {
	Match   MatchSnapshot `json:"match"`
	Room    *RoomSnapshot `json:"room"`
	Session SessionTicket `json:"session"`
}

type GetMatchResponse struct {
	Match MatchSnapshot `json:"match"`
}

type SubmitMoveRequest struct {
	PlayerID     string  `json:"playerId"`
	CellIndex    int     `json:"cellIndex"`
	ClientMoveID *string `json:"clientMoveId,omitempty"`
}

type SubmitMoveResponse struct {
	Match             MatchSnapshot       `json:"match"`
	Move              MatchMove           `json:"move"`
	GeneratedMessages []ChatMessage       `json:"generatedMessages"`
	Announcement      *OfficeAnnouncement `json:"announcement"`
}

type ListMatchMessagesResponse struct {
	Items      []ChatMessage `json:"items"`
	NextCursor *string       `json:"nextCursor"`
}

type SendChatMessageRequest struct {
	PlayerID        string  `json:"playerId"`
	Body            string  `json:"body"`
	ClientMessageID *string `json:"clientMessageId,omitempty"`
}

type SendChatMessageResponse struct {
	Accepted      bool        `json:"accepted"`
	Message       ChatMessage `json:"message"`
	AiReplyQueued bool        `json:"aiReplyQueued"`
}

type CreateRoomRequest struct {
	HostPlayerID    string `json:"hostPlayerId"`
	HostDisplayName string `json:"hostDisplayName"`
}

type CreateRoomResponse struct {
	Room    RoomSnapshot  `json:"room"`
	Session SessionTicket `json:"session"`
}

type GetRoomResponse struct {
	Room          RoomSnapshot `json:"room"`
	ActiveMatchID *string      `json:"activeMatchId"`
}

type JoinRoomRequest struct {
	PlayerID    string `json:"playerId"`
	DisplayName string `json:"displayName"`
}

type JoinRoomResponse struct {
	Room          RoomSnapshot  `json:"room"`
	ActiveMatchID *string       `json:"activeMatchId"`
	Session       SessionTicket `json:"session"`
}

type ErrorEnvelope struct {
	Error ErrorPayload `json:"error"`
}

type ErrorPayload struct {
	Code      string         `json:"code"`
	Message   string         `json:"message"`
	Details   map[string]any `json:"details,omitempty"`
	RequestID *string        `json:"requestId,omitempty"`
}

type WsEnvelope[T any] struct {
	Type      string    `json:"type"`
	Payload   T         `json:"payload"`
	EmittedAt time.Time `json:"emittedAt"`
}

type MatchClientEvent struct {
	Type      string         `json:"type"`
	Payload   map[string]any `json:"payload"`
	EmittedAt *time.Time     `json:"emittedAt,omitempty"`
}
