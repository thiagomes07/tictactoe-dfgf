package api

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"math/rand"
	"net/http"
	"strconv"
	"strings"
	"sync"
	"time"

	"github.com/thiagogomes/tictactoe-dfgf/backend/internal/chat"
	"github.com/thiagogomes/tictactoe-dfgf/backend/internal/game"
	"github.com/thiagogomes/tictactoe-dfgf/backend/internal/model"
	"github.com/thiagogomes/tictactoe-dfgf/backend/internal/store"
	"github.com/thiagogomes/tictactoe-dfgf/backend/internal/ws"
)

type Server struct {
	store   *store.Store
	chat    *chat.Service
	hub     *ws.Hub
	version string
	service string
	rng     *rand.Rand

	chatMu                sync.Mutex
	lastChatAt            map[string]time.Time
	pendingRepliesByKey   map[string]int
	pendingRepliesByMatch map[string]int
	chatMinInterval       time.Duration
	chatReplyDelayMin     time.Duration
	chatReplyDelayMax     time.Duration
	maxPendingPerPlayer   int
	maxPendingPerMatch    int
}

func NewServer(store *store.Store, chatSvc *chat.Service, hub *ws.Hub, version string) *Server {
	if strings.TrimSpace(version) == "" {
		version = "dev"
	}

	return &Server{
		store:                 store,
		chat:                  chatSvc,
		hub:                   hub,
		version:               version,
		service:               "dfgf-backend",
		rng:                   rand.New(rand.NewSource(time.Now().UnixNano())),
		lastChatAt:            make(map[string]time.Time),
		pendingRepliesByKey:   make(map[string]int),
		pendingRepliesByMatch: make(map[string]int),
		chatMinInterval:       2500 * time.Millisecond,
		chatReplyDelayMin:     1200 * time.Millisecond,
		chatReplyDelayMax:     5000 * time.Millisecond,
		maxPendingPerPlayer:   1,
		maxPendingPerMatch:    8,
	}
}

func (s *Server) RegisterRoutes(mux *http.ServeMux) {
	mux.HandleFunc("GET /health", s.handleHealth)
	mux.HandleFunc("GET /v1/health", s.handleHealth)

	mux.HandleFunc("POST /v1/rooms", s.handleCreateRoom)
	mux.HandleFunc("GET /v1/rooms/{roomCode}", s.handleGetRoom)
	mux.HandleFunc("POST /v1/rooms/{roomCode}/join", s.handleJoinRoom)

	mux.HandleFunc("POST /v1/matches", s.handleCreateMatch)
	mux.HandleFunc("GET /v1/matches/{matchId}", s.handleGetMatch)
	mux.HandleFunc("POST /v1/matches/{matchId}/moves", s.handleSubmitMove)
	mux.HandleFunc("GET /v1/matches/{matchId}/chat/messages", s.handleListChatMessages)
	mux.HandleFunc("POST /v1/matches/{matchId}/chat/messages", s.handleSendChatMessage)

	mux.HandleFunc("GET /v1/ws/matches/{matchId}", s.handleMatchWebSocket)
}

func (s *Server) handleHealth(w http.ResponseWriter, _ *http.Request) {
	status := "ok"
	if s.chat == nil || !s.chat.Enabled() {
		status = "degraded"
	}

	writeJSON(w, http.StatusOK, model.HealthResponse{
		Status:  status,
		Service: s.service,
		Version: s.version,
		Now:     time.Now().UTC(),
	})
}

func (s *Server) handleCreateRoom(w http.ResponseWriter, r *http.Request) {
	var req model.CreateRoomRequest
	if err := decodeJSON(r, &req); err != nil {
		writeError(w, http.StatusBadRequest, "INVALID_JSON", err.Error(), nil)
		return
	}

	room, session, err := s.store.CreateRoom(req)
	if err != nil {
		s.writeStoreError(w, err)
		return
	}

	writeJSON(w, http.StatusCreated, model.CreateRoomResponse{
		Room:    room,
		Session: session,
	})
}

func (s *Server) handleGetRoom(w http.ResponseWriter, r *http.Request) {
	roomCode := strings.ToUpper(strings.TrimSpace(r.PathValue("roomCode")))
	if roomCode == "" {
		writeError(w, http.StatusBadRequest, "INVALID_ROOM_CODE", "roomCode is required", nil)
		return
	}

	room, activeMatchID, err := s.store.GetRoom(roomCode)
	if err != nil {
		s.writeStoreError(w, err)
		return
	}

	writeJSON(w, http.StatusOK, model.GetRoomResponse{
		Room:          room,
		ActiveMatchID: activeMatchID,
	})
}

func (s *Server) handleJoinRoom(w http.ResponseWriter, r *http.Request) {
	roomCode := strings.ToUpper(strings.TrimSpace(r.PathValue("roomCode")))
	if roomCode == "" {
		writeError(w, http.StatusBadRequest, "INVALID_ROOM_CODE", "roomCode is required", nil)
		return
	}

	var req model.JoinRoomRequest
	if err := decodeJSON(r, &req); err != nil {
		writeError(w, http.StatusBadRequest, "INVALID_JSON", err.Error(), nil)
		return
	}

	room, activeMatchID, session, err := s.store.JoinRoom(roomCode, req)
	if err != nil {
		s.writeStoreError(w, err)
		return
	}

	writeJSON(w, http.StatusOK, model.JoinRoomResponse{
		Room:          room,
		ActiveMatchID: activeMatchID,
		Session:       session,
	})
}

func (s *Server) handleCreateMatch(w http.ResponseWriter, r *http.Request) {
	var req model.CreateMatchRequest
	if err := decodeJSON(r, &req); err != nil {
		writeError(w, http.StatusBadRequest, "INVALID_JSON", err.Error(), nil)
		return
	}

	match, room, session, err := s.store.CreateMatch(req)
	if err != nil {
		s.writeStoreError(w, err)
		return
	}

	startMessage, msgErr := s.store.AddMessage(match.MatchID, model.ChatMessage{
		ActorID:          model.ActorSistemaDFGF,
		ActorDisplayName: "Sistema DFGF",
		Channel:          model.ChatChannelInternalChat,
		Body:             fmt.Sprintf("PROCESSO N? %s ABERTO. AGUARDANDO PREENCHIMENTO.", match.ProtocolCode),
	})
	if msgErr == nil {
		s.hub.Broadcast(match.MatchID, "chat.message.created", map[string]any{"message": startMessage})
	}

	s.hub.Broadcast(match.MatchID, "match.snapshot", map[string]any{"match": match})
	if room != nil {
		s.hub.Broadcast(match.MatchID, "room.updated", map[string]any{"room": *room})
	}

	writeJSON(w, http.StatusCreated, model.CreateMatchResponse{
		Match:   match,
		Room:    room,
		Session: session,
	})
}

func (s *Server) handleGetMatch(w http.ResponseWriter, r *http.Request) {
	matchID := strings.TrimSpace(r.PathValue("matchId"))
	if matchID == "" {
		writeError(w, http.StatusBadRequest, "INVALID_MATCH_ID", "matchId is required", nil)
		return
	}

	match, err := s.store.GetMatch(matchID)
	if err != nil {
		s.writeStoreError(w, err)
		return
	}

	writeJSON(w, http.StatusOK, model.GetMatchResponse{Match: match})
}

func (s *Server) handleSubmitMove(w http.ResponseWriter, r *http.Request) {
	matchID := strings.TrimSpace(r.PathValue("matchId"))
	if matchID == "" {
		writeError(w, http.StatusBadRequest, "INVALID_MATCH_ID", "matchId is required", nil)
		return
	}

	var req model.SubmitMoveRequest
	if err := decodeJSON(r, &req); err != nil {
		writeError(w, http.StatusBadRequest, "INVALID_JSON", err.Error(), nil)
		return
	}

	match, playerMove, err := s.store.ApplyMove(matchID, req.PlayerID, req.CellIndex)
	if err != nil {
		s.writeStoreError(w, err)
		return
	}

	s.hub.Broadcast(matchID, "match.move.applied", map[string]any{"match": match, "move": playerMove})

	generatedMessages := make([]model.ChatMessage, 0, 4)
	if msg, err := s.store.AddMessage(matchID, model.ChatMessage{
		ActorID:          model.ActorTulio,
		ActorDisplayName: "Tulio",
		Channel:          model.ChatChannelInternalChat,
		Body:             "Boa escolha... dependendo do que o Sr. Geraldo achar, claro.",
	}); err == nil {
		generatedMessages = append(generatedMessages, msg)
		s.hub.Broadcast(matchID, "chat.message.created", map[string]any{"message": msg})
	}

	if match.Mode == model.MatchModeVSAI && match.State == model.MatchStateInProgress {
		bot := findBotParticipant(match.Participants)
		if bot != nil && bot.Side == match.Turn {
			aiMoveIndex := s.chooseAIMove(r.Context(), match, bot.Side)
			if aiMoveIndex >= 0 {
				aiMatch, aiMove, applyErr := s.store.ApplyMove(matchID, bot.PlayerID, aiMoveIndex)
				if applyErr == nil {
					match = aiMatch
					s.hub.Broadcast(matchID, "match.move.applied", map[string]any{"match": aiMatch, "move": aiMove})

					marleneLine := "QUE VISAO ESTRATEGICA, SR. GERALDO!!"
					if s.rng.Intn(100) > 60 {
						marleneLine = "Ousado! Quebrando paradigmas como sempre!!"
					}
					if msg, err := s.store.AddMessage(matchID, model.ChatMessage{
						ActorID:          model.ActorMarlene,
						ActorDisplayName: "Marlene",
						Channel:          model.ChatChannelInternalChat,
						Body:             marleneLine,
					}); err == nil {
						generatedMessages = append(generatedMessages, msg)
						s.hub.Broadcast(matchID, "chat.message.created", map[string]any{"message": msg})
					}
				}
			}
		}
	}

	announcement := s.maybeBuildAnnouncement(r.Context(), match)
	if announcement != nil {
		s.hub.Broadcast(matchID, "announcement.created", map[string]any{"announcement": *announcement})
	}

	if match.State == model.MatchStateFinished {
		reason := "win"
		if match.Result != nil && *match.Result == model.MatchOutcomeDraw {
			reason = "draw"
		}
		s.hub.Broadcast(matchID, "match.finished", map[string]any{"match": match, "reason": reason})
	}

	writeJSON(w, http.StatusOK, model.SubmitMoveResponse{
		Match:             match,
		Move:              playerMove,
		GeneratedMessages: generatedMessages,
		Announcement:      announcement,
	})
}

func (s *Server) handleListChatMessages(w http.ResponseWriter, r *http.Request) {
	matchID := strings.TrimSpace(r.PathValue("matchId"))
	if matchID == "" {
		writeError(w, http.StatusBadRequest, "INVALID_MATCH_ID", "matchId is required", nil)
		return
	}

	var cursor *int
	if raw := strings.TrimSpace(r.URL.Query().Get("cursor")); raw != "" {
		value, err := strconv.Atoi(raw)
		if err != nil {
			writeError(w, http.StatusBadRequest, "INVALID_CURSOR", "cursor must be an integer", nil)
			return
		}
		cursor = &value
	}

	limit := 50
	if raw := strings.TrimSpace(r.URL.Query().Get("limit")); raw != "" {
		value, err := strconv.Atoi(raw)
		if err == nil && value > 0 {
			limit = value
		}
	}

	items, next, err := s.store.ListMessages(matchID, cursor, limit)
	if err != nil {
		s.writeStoreError(w, err)
		return
	}

	var nextCursor *string
	if next != nil {
		value := strconv.Itoa(*next)
		nextCursor = &value
	}

	writeJSON(w, http.StatusOK, model.ListMatchMessagesResponse{
		Items:      items,
		NextCursor: nextCursor,
	})
}

func (s *Server) handleSendChatMessage(w http.ResponseWriter, r *http.Request) {
	matchID := strings.TrimSpace(r.PathValue("matchId"))
	if matchID == "" {
		writeError(w, http.StatusBadRequest, "INVALID_MATCH_ID", "matchId is required", nil)
		return
	}

	var req model.SendChatMessageRequest
	if err := decodeJSON(r, &req); err != nil {
		writeError(w, http.StatusBadRequest, "INVALID_JSON", err.Error(), nil)
		return
	}
	if strings.TrimSpace(req.PlayerID) == "" || strings.TrimSpace(req.Body) == "" {
		writeError(w, http.StatusBadRequest, "INVALID_INPUT", "playerId and body are required", nil)
		return
	}
	req.Body = strings.TrimSpace(req.Body)

	accepted, retryAfterMs := s.acquireReplySlot(matchID, req.PlayerID)
	if !accepted {
		writeError(w, http.StatusTooManyRequests, "RATE_LIMITED", "aguarde antes de enviar nova mensagem", map[string]any{
			"retryAfterMs": retryAfterMs,
		})
		return
	}

	match, err := s.store.GetMatch(matchID)
	if err != nil {
		s.releaseReplySlot(matchID, req.PlayerID)
		s.writeStoreError(w, err)
		return
	}

	userMessage, err := s.store.AddMessage(matchID, model.ChatMessage{
		ActorID:          model.ActorEstagiario,
		ActorDisplayName: "Estagiario(a)",
		Channel:          model.ChatChannelInternalChat,
		Body:             req.Body,
	})
	if err != nil {
		s.releaseReplySlot(matchID, req.PlayerID)
		s.writeStoreError(w, err)
		return
	}
	s.hub.Broadcast(matchID, "chat.message.created", map[string]any{"message": userMessage})

	s.scheduleReply(matchID, req.PlayerID, match, req.Body)

	writeJSON(w, http.StatusOK, model.SendChatMessageResponse{
		Accepted:      true,
		Message:       userMessage,
		AiReplyQueued: true,
	})
}

func (s *Server) handleMatchWebSocket(w http.ResponseWriter, r *http.Request) {
	matchID := strings.TrimSpace(r.PathValue("matchId"))
	if matchID == "" {
		writeError(w, http.StatusBadRequest, "INVALID_MATCH_ID", "matchId is required", nil)
		return
	}

	s.hub.ServeMatchSocket(w, r, matchID)
}

func (s *Server) chooseAIMove(ctx context.Context, snapshot model.MatchSnapshot, aiSide model.PlayerSide) int {
	available := game.AvailableMoves(snapshot.Board.Cells)
	if len(available) == 0 {
		return -1
	}

	if s.chat != nil && s.chat.Enabled() {
		if move, err := s.chat.SuggestGeraldoMove(ctx, snapshot, available); err == nil {
			return move
		}
	}

	difficulty := model.AiDifficultyPreAlmoco
	if snapshot.AiDifficulty != nil {
		difficulty = *snapshot.AiDifficulty
	}
	return game.ChooseMove(snapshot.Board.Cells, aiSide, difficulty)
}

func (s *Server) maybeBuildAnnouncement(ctx context.Context, snapshot model.MatchSnapshot) *model.OfficeAnnouncement {
	if snapshot.State != model.MatchStateFinished && s.rng.Intn(100) > 15 {
		return nil
	}

	hint := "andamento"
	if snapshot.State == model.MatchStateFinished {
		hint = "resultado_final"
	}

	body := "Sr. Geraldo: estou supervisionando tudo de perto."
	if s.chat != nil {
		body = s.chat.GenerateAnnouncement(ctx, snapshot, hint)
	}

	ann, err := s.store.AddAnnouncement(snapshot.MatchID, model.OfficeAnnouncement{
		SpeakerID: model.ActorGeraldo,
		Body:      strings.TrimSpace(body),
	})
	if err != nil {
		return nil
	}
	return &ann
}

func findBotParticipant(participants []model.MatchParticipant) *model.MatchParticipant {
	for i := range participants {
		if participants[i].IsBot {
			copy := participants[i]
			return &copy
		}
	}
	return nil
}

func actorDisplayName(actor model.ActorID) string {
	switch actor {
	case model.ActorMarlene:
		return "Marlene"
	case model.ActorTulio:
		return "Tulio"
	case model.ActorPatricia:
		return "Patricia de RH"
	case model.ActorSistemaDFGF:
		return "Sistema DFGF"
	case model.ActorGeraldo:
		return "Sr. Geraldo"
	default:
		return "Colega"
	}
}

func (s *Server) writeStoreError(w http.ResponseWriter, err error) {
	switch {
	case errors.Is(err, store.ErrNotFound):
		writeError(w, http.StatusNotFound, "NOT_FOUND", "recurso nao encontrado", nil)
	case errors.Is(err, store.ErrConflict):
		writeError(w, http.StatusConflict, "CONFLICT", "conflito de estado", nil)
	case errors.Is(err, store.ErrInvalidInput):
		writeError(w, http.StatusBadRequest, "INVALID_INPUT", "dados invalidos", nil)
	case errors.Is(err, store.ErrUnauthorized):
		writeError(w, http.StatusUnauthorized, "UNAUTHORIZED", "sessao invalida", nil)
	case errors.Is(err, store.ErrInvalidState):
		writeError(w, http.StatusConflict, "INVALID_STATE", "estado invalido para operacao", nil)
	default:
		writeError(w, http.StatusInternalServerError, "INTERNAL_ERROR", "erro interno", nil)
	}
}

func decodeJSON(r *http.Request, out any) error {
	defer r.Body.Close()
	decoder := json.NewDecoder(io.LimitReader(r.Body, 1<<20))
	decoder.DisallowUnknownFields()
	if err := decoder.Decode(out); err != nil {
		return err
	}
	return nil
}

func writeJSON(w http.ResponseWriter, statusCode int, payload any) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(statusCode)
	_ = json.NewEncoder(w).Encode(payload)
}

func writeError(w http.ResponseWriter, statusCode int, code, message string, details map[string]any) {
	writeJSON(w, statusCode, model.ErrorEnvelope{
		Error: model.ErrorPayload{
			Code:    code,
			Message: message,
			Details: details,
		},
	})
}

func (s *Server) scheduleReply(matchID, playerID string, snapshot model.MatchSnapshot, userText string) {
	delayRange := s.chatReplyDelayMax - s.chatReplyDelayMin
	randomDelay := s.chatReplyDelayMin
	if delayRange > 0 {
		randomDelay += time.Duration(s.rng.Int63n(int64(delayRange)))
	}

	go func() {
		defer s.releaseReplySlot(matchID, playerID)

		timer := time.NewTimer(randomDelay)
		defer timer.Stop()
		<-timer.C

		ctx, cancel := context.WithTimeout(context.Background(), 22*time.Second)
		defer cancel()

		recentMessages, _, _ := s.store.ListMessages(matchID, nil, 20)
		actorID, body := s.chat.GenerateReply(ctx, snapshot, recentMessages, userText)

		replyMessage, err := s.store.AddMessage(matchID, model.ChatMessage{
			ActorID:          actorID,
			ActorDisplayName: actorDisplayName(actorID),
			Channel:          model.ChatChannelInternalChat,
			Body:             body,
		})
		if err == nil {
			s.hub.Broadcast(matchID, "chat.message.created", map[string]any{"message": replyMessage})
		}
	}()
}

func (s *Server) acquireReplySlot(matchID, playerID string) (bool, int) {
	key := matchID + "::" + playerID
	now := time.Now().UTC()

	s.chatMu.Lock()
	defer s.chatMu.Unlock()

	if lastAt, ok := s.lastChatAt[key]; ok {
		nextAllowedAt := lastAt.Add(s.chatMinInterval)
		if now.Before(nextAllowedAt) {
			retryAfterMs := int(nextAllowedAt.Sub(now).Milliseconds())
			if retryAfterMs < 100 {
				retryAfterMs = 100
			}
			return false, retryAfterMs
		}
	}

	if s.pendingRepliesByKey[key] >= s.maxPendingPerPlayer {
		return false, int(s.chatReplyDelayMin.Milliseconds())
	}

	if s.pendingRepliesByMatch[matchID] >= s.maxPendingPerMatch {
		return false, int((s.chatReplyDelayMin + 800*time.Millisecond).Milliseconds())
	}

	s.lastChatAt[key] = now
	s.pendingRepliesByKey[key]++
	s.pendingRepliesByMatch[matchID]++
	return true, 0
}

func (s *Server) releaseReplySlot(matchID, playerID string) {
	key := matchID + "::" + playerID

	s.chatMu.Lock()
	defer s.chatMu.Unlock()

	if s.pendingRepliesByKey[key] > 0 {
		s.pendingRepliesByKey[key]--
	}
	if s.pendingRepliesByKey[key] <= 0 {
		delete(s.pendingRepliesByKey, key)
	}

	if s.pendingRepliesByMatch[matchID] > 0 {
		s.pendingRepliesByMatch[matchID]--
	}
	if s.pendingRepliesByMatch[matchID] <= 0 {
		delete(s.pendingRepliesByMatch, matchID)
	}
}
