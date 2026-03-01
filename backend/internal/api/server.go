package api

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"math/rand"
	"net/http"
	"os"
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

	chatMu                 sync.Mutex
	lastChatAt             map[string]time.Time
	pendingRepliesByKey    map[string]int
	pendingRepliesByMatch  map[string]int
	lastGameCommentByMatch map[string]string
	chatMinInterval        time.Duration
	chatReplyDelayMin      time.Duration
	chatReplyDelayMax      time.Duration
	chatBurstMinReplies    int
	chatBurstMaxReplies    int
	chatBurstGapMin        time.Duration
	chatBurstGapMax        time.Duration
	aiMoveDelayMin         time.Duration
	aiMoveDelayMax         time.Duration
	bedrockTimeout         time.Duration
	maxPendingPerPlayer    int
	maxPendingPerMatch     int
}

func NewServer(store *store.Store, chatSvc *chat.Service, hub *ws.Hub, version string) *Server {
	if strings.TrimSpace(version) == "" {
		version = "dev"
	}

	return &Server{
		store:                  store,
		chat:                   chatSvc,
		hub:                    hub,
		version:                version,
		service:                "dfgf-backend",
		rng:                    rand.New(rand.NewSource(time.Now().UnixNano())),
		lastChatAt:             make(map[string]time.Time),
		pendingRepliesByKey:    make(map[string]int),
		pendingRepliesByMatch:  make(map[string]int),
		lastGameCommentByMatch: make(map[string]string),
		chatMinInterval:        2500 * time.Millisecond,
		chatReplyDelayMin:      1200 * time.Millisecond,
		chatReplyDelayMax:      5000 * time.Millisecond,
		chatBurstMinReplies:    2,
		chatBurstMaxReplies:    3,
		chatBurstGapMin:        700 * time.Millisecond,
		chatBurstGapMax:        2200 * time.Millisecond,
		aiMoveDelayMin:         getEnvDurationMs("AI_MOVE_DELAY_MIN_MS", 800*time.Millisecond),
		aiMoveDelayMax:         getEnvDurationMs("AI_MOVE_DELAY_MAX_MS", 1800*time.Millisecond),
		bedrockTimeout:         getEnvDurationMs("BEDROCK_REQUEST_TIMEOUT_MS", 25*time.Second),
		maxPendingPerPlayer:    1,
		maxPendingPerMatch:     8,
	}
}

func (s *Server) RegisterRoutes(mux *http.ServeMux) {
	mux.HandleFunc("GET /health", s.handleHealth)
	mux.HandleFunc("GET /v1/health", s.handleHealth)

	mux.HandleFunc("GET /v1/rooms", s.handleListRooms)
	mux.HandleFunc("POST /v1/rooms", s.handleCreateRoom)
	mux.HandleFunc("GET /v1/rooms/{roomCode}", s.handleGetRoom)
	mux.HandleFunc("POST /v1/rooms/{roomCode}/join", s.handleJoinRoom)
	mux.HandleFunc("POST /v1/rooms/{roomCode}/close", s.handleCloseRoom)

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

	room, activeMatchID, hostDisplayName, err := s.store.GetRoom(roomCode)
	if err != nil {
		s.writeStoreError(w, err)
		return
	}

	writeJSON(w, http.StatusOK, model.GetRoomResponse{
		Room:            room,
		ActiveMatchID:   activeMatchID,
		HostDisplayName: hostDisplayName,
	})
}

func (s *Server) handleListRooms(w http.ResponseWriter, r *http.Request) {
	onlyAvailable := true
	if raw := strings.TrimSpace(r.URL.Query().Get("available")); raw != "" {
		onlyAvailable = raw != "0" && strings.ToLower(raw) != "false"
	}

	limit := 50
	if raw := strings.TrimSpace(r.URL.Query().Get("limit")); raw != "" {
		if parsed, err := strconv.Atoi(raw); err == nil && parsed > 0 {
			limit = parsed
		}
	}

	items := s.store.ListRooms(onlyAvailable, limit)
	writeJSON(w, http.StatusOK, model.ListRoomsResponse{Items: items})
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

	if activeMatchID != nil {
		if match, matchErr := s.store.GetMatch(*activeMatchID); matchErr == nil {
			s.hub.Broadcast(*activeMatchID, "match.snapshot", map[string]any{"match": match})
		}
	}

	writeJSON(w, http.StatusOK, model.JoinRoomResponse{
		Room:          room,
		ActiveMatchID: activeMatchID,
		Session:       session,
	})
}

func (s *Server) handleCloseRoom(w http.ResponseWriter, r *http.Request) {
	roomCode := strings.ToUpper(strings.TrimSpace(r.PathValue("roomCode")))
	if roomCode == "" {
		writeError(w, http.StatusBadRequest, "INVALID_ROOM_CODE", "roomCode is required", nil)
		return
	}

	var req model.CloseRoomRequest
	if err := decodeJSON(r, &req); err != nil {
		writeError(w, http.StatusBadRequest, "INVALID_JSON", err.Error(), nil)
		return
	}

	activeMatchID, err := s.store.CloseRoom(roomCode, req.HostPlayerID)
	if err != nil {
		s.writeStoreError(w, err)
		return
	}

	if activeMatchID != nil {
		s.hub.Broadcast(*activeMatchID, "room.closed", map[string]any{
			"roomCode": roomCode,
			"reason":   "host_left",
			"message":  "A sala foi encerrada pelo host.",
		})
	}

	writeJSON(w, http.StatusOK, model.CloseRoomResponse{
		RoomCode: roomCode,
		Closed:   true,
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
		Channel:          model.ChatChannelGameCommentary,
		Body:             fmt.Sprintf("PROCESSO Nº %s ABERTO. AGUARDANDO PREENCHIMENTO DO FORMULÁRIO 3x3-B.", match.ProtocolCode),
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

	generatedMessages := make([]model.ChatMessage, 0, 6)
	if commentary := s.buildCommentaryAfterPlayerMove(matchID, match, playerMove); commentary != nil {
		if msg, err := s.store.AddMessage(matchID, *commentary); err == nil {
			generatedMessages = append(generatedMessages, msg)
			s.hub.Broadcast(matchID, "chat.message.created", map[string]any{"message": msg})
		}
	}

	if match.Mode == model.MatchModeVSAI && match.State == model.MatchStateInProgress {
		bot := findBotParticipant(match.Participants)
		if bot != nil && bot.Side == match.Turn {
			time.Sleep(s.randomDuration(s.aiMoveDelayMin, s.aiMoveDelayMax))
			aiMoveIndex := s.chooseAIMove(r.Context(), match, bot.Side)
			if aiMoveIndex >= 0 {
				aiMatch, aiMove, applyErr := s.store.ApplyMove(matchID, bot.PlayerID, aiMoveIndex)
				if applyErr == nil {
					match = aiMatch
					s.hub.Broadcast(matchID, "match.move.applied", map[string]any{"match": aiMatch, "move": aiMove})

					if commentary := s.buildCommentaryAfterAIMove(matchID, aiMatch, bot.Side); commentary != nil {
						if msg, err := s.store.AddMessage(matchID, *commentary); err == nil {
							generatedMessages = append(generatedMessages, msg)
							s.hub.Broadcast(matchID, "chat.message.created", map[string]any{"message": msg})
						}
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

		s.chatMu.Lock()
		delete(s.lastGameCommentByMatch, matchID)
		s.chatMu.Unlock()
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
		ActorID:          model.ActorEstagiário,
		ActorDisplayName: senderDisplayName(match, req.PlayerID),
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

func (s *Server) chooseAIMove(_ context.Context, snapshot model.MatchSnapshot, aiSide model.PlayerSide) int {
	available := game.AvailableMoves(snapshot.Board.Cells)
	if len(available) == 0 {
		return -1
	}

	difficulty := model.AiDifficultyPreAlmoco
	if snapshot.AiDifficulty != nil {
		difficulty = *snapshot.AiDifficulty
	}

	// Hard mode is deterministic minimax to create a clear and noticeable difficulty gap.
	if isHardDifficulty(difficulty) {
		return game.ChooseMove(snapshot.Board.Cells, aiSide, model.AiDifficultyAvaliacaoAnual)
	}

	// Easy mode: mostly random with occasional tactical moves.
	if s.rng.Intn(100) < 30 {
		return game.ChooseMove(snapshot.Board.Cells, aiSide, model.AiDifficultyAvaliacaoAnual)
	}

	return game.ChooseMove(snapshot.Board.Cells, aiSide, model.AiDifficultyPreAlmoco)
}

func (s *Server) maybeBuildAnnouncement(ctx context.Context, snapshot model.MatchSnapshot) *model.OfficeAnnouncement {
	if snapshot.State != model.MatchStateFinished && s.rng.Intn(100) > 15 {
		return nil
	}

	hint := "andamento"
	if snapshot.State == model.MatchStateFinished {
		hint = "resultado_final"
	}

	body := "Sr. Geraldo: estou supervisionando tudo de perto com rigor estratégico."
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

type gameCommentCandidate struct {
	actorID model.ActorID
	body    string
}

func (s *Server) buildCommentaryAfterPlayerMove(matchID string, snapshot model.MatchSnapshot, move model.MatchMove) *model.ChatMessage {
	candidates := make([]gameCommentCandidate, 0, 12)

	if snapshot.State == model.MatchStateFinished && snapshot.Result != nil {
		switch *snapshot.Result {
		case model.MatchOutcomeDraw:
			candidates = append(candidates,
				gameCommentCandidate{actorID: model.ActorSistemaDFGF, body: "PROCESSO ENCAMINHADO A INSTANCIA SUPERIOR. RESULTADO: EMPATE ADMINISTRATIVO."},
				gameCommentCandidate{actorID: model.ActorPatricia, body: "Empate registrado. RH recomenda uma pausa para cafe antes da proxima demanda."},
				gameCommentCandidate{actorID: model.ActorTulio, body: "Empate elegante: ninguem vence, mas todo mundo gera burocracia."},
			)
		default:
			if snapshot.Mode == model.MatchModeVSAI && move.Side == model.PlayerSide(*snapshot.Result) {
				candidates = append(candidates,
					gameCommentCandidate{actorID: model.ActorGeraldo, body: "Esse resultado ja estava no meu plano de desenvolvimento da equipe."},
					gameCommentCandidate{actorID: model.ActorGeraldo, body: "Concedi margem pedagogica. Lideranca moderna funciona assim."},
					gameCommentCandidate{actorID: model.ActorTulio, body: "Vitoria registrada. A narrativa da chefia ja esta em fase de revisao."},
					gameCommentCandidate{actorID: model.ActorPatricia, body: "RH confirma o resultado e sugere comemorar com responsabilidade institucional."},
				)
			} else {
				candidates = append(candidates,
					gameCommentCandidate{actorID: model.ActorTulio, body: "Resultado consolidado. O setor de egos acabou de lotar."},
					gameCommentCandidate{actorID: model.ActorPatricia, body: "Partida encerrada. Nao esquecam de registrar a percepcao de aprendizado."},
					gameCommentCandidate{actorID: model.ActorSistemaDFGF, body: "PROCESSO FINALIZADO. STATUS ATUALIZADO NO ARQUIVO MORTO."},
				)
			}
		}
	} else {
		emitChance := 68
		if snapshot.Mode != model.MatchModeVSAI {
			emitChance = 60
		}
		if snapshot.MoveCount >= 7 {
			emitChance = 84
		}
		if s.rng.Intn(100) >= emitChance {
			return nil
		}

		if snapshot.Mode == model.MatchModeVSAI {
			candidates = append(candidates,
				gameCommentCandidate{actorID: model.ActorTulio, body: "Boa escolha. Agora vamos descobrir como a chefia vai reinterpretar isso."},
				gameCommentCandidate{actorID: model.ActorTulio, body: "Movimento interessante. O relatorio vai chamar isso de iniciativa proativa."},
				gameCommentCandidate{actorID: model.ActorTulio, body: "Gostei da jogada. Ja preparei a versao oficial para quando der problema."},
				gameCommentCandidate{actorID: model.ActorPatricia, body: "Jogada registrada. RH parabeniza o engajamento no processo."},
				gameCommentCandidate{actorID: model.ActorPatricia, body: "Anotado no fluxo interno. Mantenham o dialogo civilizado, por favor."},
				gameCommentCandidate{actorID: model.ActorGeraldo, body: "Continue assim. Estou avaliando seu desempenho com criterios avancados."},
				gameCommentCandidate{actorID: model.ActorSistemaDFGF, body: "MOVIMENTO RECEBIDO. PROTOCOLO ATUALIZADO SEM PENDENCIAS."},
			)
		} else {
			candidates = append(candidates,
				gameCommentCandidate{actorID: model.ActorTulio, body: "Disputa boa. O setor inteiro ja escolheu lados nos bastidores."},
				gameCommentCandidate{actorID: model.ActorTulio, body: "Ritmo forte. Isso aqui virou final de campeonato de planilha."},
				gameCommentCandidate{actorID: model.ActorPatricia, body: "RH acompanha a rivalidade com interesse tecnico e leve preocupacao."},
				gameCommentCandidate{actorID: model.ActorGeraldo, body: "Excelente. Competicao saudavel sob minha supervisao qualificada."},
				gameCommentCandidate{actorID: model.ActorSistemaDFGF, body: "ATUALIZACAO PVP PROCESSADA. CONTINUIDADE AUTORIZADA."},
			)
		}
	}

	chosen, ok := s.pickGameComment(matchID, candidates)
	if !ok {
		return nil
	}

	return &model.ChatMessage{
		ActorID:          chosen.actorID,
		ActorDisplayName: actorDisplayName(chosen.actorID),
		Channel:          model.ChatChannelGameCommentary,
		Body:             chosen.body,
	}
}

func (s *Server) buildCommentaryAfterAIMove(matchID string, snapshot model.MatchSnapshot, aiSide model.PlayerSide) *model.ChatMessage {
	candidates := make([]gameCommentCandidate, 0, 10)

	if snapshot.State == model.MatchStateFinished && snapshot.Result != nil {
		if model.PlayerSide(*snapshot.Result) == aiSide {
			candidates = append(candidates,
				gameCommentCandidate{actorID: model.ActorMarlene, body: "QUE VISAO ESTRATEGICA, SR. GERALDO! RESULTADO IMPECAVEL!"},
				gameCommentCandidate{actorID: model.ActorMarlene, body: "A CHEFIA ENTREGOU EXCELENCIA TECNICA EM FORMATO DE JOGADA!"},
				gameCommentCandidate{actorID: model.ActorMarlene, body: "INCRIVEL! LIDERANCA DE ALTO IMPACTO EM CADA CASA DO TABULEIRO!"},
				gameCommentCandidate{actorID: model.ActorGeraldo, body: "Como previsto. Execucao precisa e visao de longo prazo."},
				gameCommentCandidate{actorID: model.ActorSistemaDFGF, body: "RESULTADO HOMOLOGADO. CHEFIA VENCEDORA NESTA DEMANDA."},
			)
		} else if *snapshot.Result == model.MatchOutcomeDraw {
			candidates = append(candidates,
				gameCommentCandidate{actorID: model.ActorSistemaDFGF, body: "EMPATE CONFIRMADO. PROCESSO SEGUIRA PARA TRAMITE SUPERIOR."},
				gameCommentCandidate{actorID: model.ActorPatricia, body: "Empate encerrado com civilidade. RH considera um desfecho maduro."},
				gameCommentCandidate{actorID: model.ActorMarlene, body: "Empate ousado! A chefia claramente pensou varios passos a frente."},
			)
		}
	} else {
		emitChance := 74
		if snapshot.MoveCount >= 7 {
			emitChance = 88
		}
		if s.rng.Intn(100) >= emitChance {
			return nil
		}

		aiCanWinNext := s.hasImmediateWinningChance(snapshot.Board.Cells, aiSide)
		playerCanWinNext := s.hasImmediateWinningChance(snapshot.Board.Cells, game.OtherSide(aiSide))

		if aiCanWinNext {
			candidates = append(candidates,
				gameCommentCandidate{actorID: model.ActorMarlene, body: "QUE LEITURA TATICA! O SR. GERALDO DEIXOU O TABULEIRO SOB PRESSAO TOTAL!"},
				gameCommentCandidate{actorID: model.ActorMarlene, body: "A CHEFIA ARMOU UM CENARIO BRILHANTE. VISIONARIO COMO SEMPRE!"},
				gameCommentCandidate{actorID: model.ActorGeraldo, body: "Posicionei a equipe para fechar o processo no proximo movimento."},
			)
		} else if playerCanWinNext {
			candidates = append(candidates,
				gameCommentCandidate{actorID: model.ActorMarlene, body: "Jogada ousada da chefia. Estrategia de risco calculado com elegancia!"},
				gameCommentCandidate{actorID: model.ActorTulio, body: "Clima tenso. A chefia chamou isso de estrategia adaptativa em tempo real."},
				gameCommentCandidate{actorID: model.ActorGeraldo, body: "Estou testando sua resiliencia sob pressao. Tudo monitorado."},
			)
		} else {
			candidates = append(candidates,
				gameCommentCandidate{actorID: model.ActorMarlene, body: "Movimento refinado da chefia. Execucao muito acima da media departamental!"},
				gameCommentCandidate{actorID: model.ActorMarlene, body: "Que dominio de processo, Sr. Geraldo! Impressionante consistencia."},
				gameCommentCandidate{actorID: model.ActorTulio, body: "A chefia jogou com conviccao. A explicacao tecnica chega depois."},
				gameCommentCandidate{actorID: model.ActorSistemaDFGF, body: "JOGADA DA CHEFIA REGISTRADA. PROCESSO SEGUE EM ANALISE."},
			)
		}
	}

	chosen, ok := s.pickGameComment(matchID, candidates)
	if !ok {
		return nil
	}

	return &model.ChatMessage{
		ActorID:          chosen.actorID,
		ActorDisplayName: actorDisplayName(chosen.actorID),
		Channel:          model.ChatChannelGameCommentary,
		Body:             chosen.body,
	}
}

func (s *Server) hasImmediateWinningChance(board []*model.PlayerSide, side model.PlayerSide) bool {
	available := game.AvailableMoves(board)
	for _, move := range available {
		nextBoard, err := game.ApplyMove(board, side, move)
		if err != nil {
			continue
		}
		winner, _, _ := game.Resolve(nextBoard)
		if winner != nil && *winner == side {
			return true
		}
	}
	return false
}

func (s *Server) pickGameComment(matchID string, candidates []gameCommentCandidate) (gameCommentCandidate, bool) {
	if len(candidates) == 0 {
		return gameCommentCandidate{}, false
	}

	s.chatMu.Lock()
	defer s.chatMu.Unlock()

	lastBody := s.lastGameCommentByMatch[matchID]
	filtered := make([]gameCommentCandidate, 0, len(candidates))
	for _, candidate := range candidates {
		if strings.TrimSpace(candidate.body) == "" {
			continue
		}
		if candidate.body == lastBody {
			continue
		}
		filtered = append(filtered, candidate)
	}
	if len(filtered) == 0 {
		filtered = candidates
	}

	chosen := filtered[s.rng.Intn(len(filtered))]
	s.lastGameCommentByMatch[matchID] = chosen.body
	return chosen, true
}

func actorDisplayName(actor model.ActorID) string {
	switch actor {
	case model.ActorMarlene:
		return "Marlene"
	case model.ActorTulio:
		return "Túlio"
	case model.ActorPatricia:
		return "Patrícia de RH"
	case model.ActorSistemaDFGF:
		return "Sistema DFGF"
	case model.ActorGeraldo:
		return "Sr. Geraldo"
	default:
		return "Colega"
	}
}

func senderDisplayName(snapshot model.MatchSnapshot, playerID string) string {
	cleanPlayerID := strings.TrimSpace(playerID)
	if cleanPlayerID == "" {
		return "Estagiario(a)"
	}

	for _, participant := range snapshot.Participants {
		if strings.TrimSpace(participant.PlayerID) != cleanPlayerID {
			continue
		}
		name := strings.TrimSpace(participant.DisplayName)
		if name != "" {
			return name
		}
		break
	}

	return "Estagiario(a)"
}

func (s *Server) writeStoreError(w http.ResponseWriter, err error) {
	switch {
	case errors.Is(err, store.ErrNotFound):
		writeError(w, http.StatusNotFound, "NOT_FOUND", "recurso nao encontrado", nil)
	case errors.Is(err, store.ErrConflict):
		message := strings.TrimSpace(err.Error())
		if strings.HasPrefix(strings.ToLower(message), strings.ToLower(store.ErrConflict.Error())+":") {
			message = strings.TrimSpace(message[len(store.ErrConflict.Error())+1:])
		}
		if message == "" {
			message = "conflito de estado"
		}
		writeError(w, http.StatusConflict, "CONFLICT", message, nil)
	case errors.Is(err, store.ErrInvalidInput):
		message := strings.TrimSpace(err.Error())
		if strings.HasPrefix(strings.ToLower(message), strings.ToLower(store.ErrInvalidInput.Error())+":") {
			message = strings.TrimSpace(message[len(store.ErrInvalidInput.Error())+1:])
		}
		if message == "" {
			message = "entrada invalida"
		}
		writeError(w, http.StatusBadRequest, "INVALID_INPUT", message, nil)
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

		replyCount := s.randomReplyCount(snapshot.Mode)
		usedActors := make(map[model.ActorID]struct{}, replyCount)

		for i := 0; i < replyCount; i++ {
			currentSnapshot, err := s.store.GetMatch(matchID)
			if err != nil {
				return
			}

			recentMessages, _, _ := s.store.ListMessages(matchID, nil, 24)
			allowedActors := s.allowedReplyActors(currentSnapshot.Mode, usedActors)

			// Keep chat latency bounded; if Bedrock is slow/unavailable we fall back quickly.
			ctx, cancel := context.WithTimeout(context.Background(), s.bedrockTimeout)
			actorID, body := s.chat.GenerateReply(ctx, currentSnapshot, recentMessages, userText, chat.ReplyOptions{
				AllowedActors: allowedActors,
			})
			cancel()

			replyMessage, err := s.store.AddMessage(matchID, model.ChatMessage{
				ActorID:          actorID,
				ActorDisplayName: actorDisplayName(actorID),
				Channel:          model.ChatChannelChatReply,
				Body:             body,
			})
			if err == nil {
				usedActors[actorID] = struct{}{}
				s.hub.Broadcast(matchID, "chat.message.created", map[string]any{"message": replyMessage})
			}

			if i == replyCount-1 {
				break
			}

			gap := s.randomDuration(s.chatBurstGapMin, s.chatBurstGapMax)
			gapTimer := time.NewTimer(gap)
			<-gapTimer.C
			gapTimer.Stop()
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

func isHardDifficulty(d model.AiDifficulty) bool {
	value := strings.ToLower(strings.TrimSpace(string(d)))
	return value == strings.ToLower(string(model.AiDifficultyAvaliacaoAnual)) ||
		value == "avaliacao_anual" ||
		value == "avaliação_anual" ||
		value == "avaliaã§ã£o_anual"
}

func (s *Server) randomReplyCount(_ model.MatchMode) int {
	minReplies := s.chatBurstMinReplies
	maxReplies := s.chatBurstMaxReplies

	if minReplies < 1 {
		minReplies = 1
	}
	if maxReplies < minReplies {
		maxReplies = minReplies
	}

	// Usually more than one reply, but keep occasional single-message realism.
	if s.rng.Intn(100) < 18 {
		return 1
	}

	if maxReplies == minReplies {
		return minReplies
	}
	return minReplies + s.rng.Intn(maxReplies-minReplies+1)
}

func (s *Server) allowedReplyActors(mode model.MatchMode, used map[model.ActorID]struct{}) []model.ActorID {
	base := []model.ActorID{
		model.ActorMarlene,
		model.ActorTulio,
		model.ActorPatricia,
		model.ActorSistemaDFGF,
		model.ActorGeraldo,
	}

	// For vs_ai we slightly bias toward Geraldo and Marlene.
	if mode == model.MatchModeVSAI && s.rng.Intn(100) < 45 {
		base = []model.ActorID{
			model.ActorGeraldo,
			model.ActorMarlene,
			model.ActorTulio,
			model.ActorPatricia,
			model.ActorSistemaDFGF,
		}
	}

	available := make([]model.ActorID, 0, len(base))
	for _, actor := range base {
		if _, exists := used[actor]; !exists {
			available = append(available, actor)
		}
	}
	if len(available) == 0 {
		return base
	}

	// Give Bedrock some constrained freedom while keeping character variety.
	target := 3
	if len(available) < target {
		target = len(available)
	}
	if target <= 0 {
		return base
	}

	s.rng.Shuffle(len(available), func(i, j int) {
		available[i], available[j] = available[j], available[i]
	})
	return available[:target]
}

func (s *Server) randomDuration(minValue, maxValue time.Duration) time.Duration {
	if maxValue <= minValue {
		return minValue
	}
	return minValue + time.Duration(s.rng.Int63n(int64(maxValue-minValue)))
}

func getEnvDurationMs(key string, fallback time.Duration) time.Duration {
	value := strings.TrimSpace(os.Getenv(key))
	if value == "" {
		return fallback
	}

	parsed, err := strconv.Atoi(value)
	if err != nil || parsed <= 0 {
		return fallback
	}

	return time.Duration(parsed) * time.Millisecond
}
