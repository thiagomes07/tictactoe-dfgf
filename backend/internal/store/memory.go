package store

import (
	"crypto/rand"
	"encoding/hex"
	"errors"
	"fmt"
	"math/big"
	"slices"
	"strings"
	"sync"
	"time"

	"github.com/thiagogomes/tictactoe-dfgf/backend/internal/game"
	"github.com/thiagogomes/tictactoe-dfgf/backend/internal/model"
)

var (
	ErrNotFound     = errors.New("resource not found")
	ErrConflict     = errors.New("resource conflict")
	ErrInvalidInput = errors.New("invalid input")
	ErrUnauthorized = errors.New("unauthorized")
	ErrInvalidState = errors.New("invalid state")
)

type MatchRecord struct {
	Snapshot      model.MatchSnapshot
	Moves         []model.MatchMove
	Messages      []model.ChatMessage
	Announcements []model.OfficeAnnouncement
}

type RoomRecord struct {
	Snapshot         model.RoomSnapshot
	HostDisplayName  string
	GuestDisplayName *string
	ActiveMatchID    *string
	LastActivityAt   time.Time
}

type SessionRecord struct {
	Ticket   model.SessionTicket
	MatchID  *string
	RoomCode *string
	LastSeen time.Time
}

type Store struct {
	mu       sync.RWMutex
	matches  map[string]*MatchRecord
	rooms    map[string]*RoomRecord
	sessions map[string]*SessionRecord
}

const (
	roomIdleTTL        = 30 * time.Minute
	roomPlayingIdleTTL = 2 * time.Hour
)

func New() *Store {
	return &Store{
		matches:  make(map[string]*MatchRecord),
		rooms:    make(map[string]*RoomRecord),
		sessions: make(map[string]*SessionRecord),
	}
}

func (s *Store) CreateRoom(req model.CreateRoomRequest) (model.RoomSnapshot, model.SessionTicket, error) {
	if strings.TrimSpace(req.HostPlayerID) == "" || strings.TrimSpace(req.HostDisplayName) == "" {
		return model.RoomSnapshot{}, model.SessionTicket{}, fmt.Errorf("%w: hostPlayerId and hostDisplayName are required", ErrInvalidInput)
	}

	s.mu.Lock()
	defer s.mu.Unlock()

	now := time.Now().UTC()
	s.cleanupInactiveRoomsLocked(now)
	roomCode := s.generateUniqueRoomCodeLocked()
	room := model.RoomSnapshot{
		RoomCode:      roomCode,
		Status:        model.RoomStateWaitingGuest,
		HostPlayerID:  req.HostPlayerID,
		GuestPlayerID: nil,
		CreatedAt:     now,
		ExpiresAt:     now.Add(24 * time.Hour),
	}

	s.rooms[roomCode] = &RoomRecord{
		Snapshot:         room,
		HostDisplayName:  req.HostDisplayName,
		GuestDisplayName: nil,
		ActiveMatchID:    nil,
		LastActivityAt:   now,
	}

	ticket := newSessionTicket(req.HostPlayerID)
	s.sessions[ticket.SessionID] = &SessionRecord{
		Ticket:   ticket,
		RoomCode: &roomCode,
		LastSeen: now,
	}

	return room, ticket, nil
}

func (s *Store) GetRoom(roomCode string) (model.RoomSnapshot, *string, string, error) {
	s.mu.Lock()
	defer s.mu.Unlock()

	now := time.Now().UTC()
	s.cleanupInactiveRoomsLocked(now)

	room, ok := s.rooms[roomCode]
	if !ok {
		return model.RoomSnapshot{}, nil, "", ErrNotFound
	}
	room.LastActivityAt = now

	return cloneRoomSnapshot(room.Snapshot), cloneStringPtr(room.ActiveMatchID), room.HostDisplayName, nil
}

func (s *Store) JoinRoom(roomCode string, req model.JoinRoomRequest) (model.RoomSnapshot, *string, model.SessionTicket, error) {
	if strings.TrimSpace(req.PlayerID) == "" || strings.TrimSpace(req.DisplayName) == "" {
		return model.RoomSnapshot{}, nil, model.SessionTicket{}, fmt.Errorf("%w: playerId and displayName are required", ErrInvalidInput)
	}

	s.mu.Lock()
	defer s.mu.Unlock()

	now := time.Now().UTC()
	s.cleanupInactiveRoomsLocked(now)

	room, ok := s.rooms[roomCode]
	if !ok {
		return model.RoomSnapshot{}, nil, model.SessionTicket{}, ErrNotFound
	}
	if strings.TrimSpace(req.PlayerID) == strings.TrimSpace(room.Snapshot.HostPlayerID) {
		return model.RoomSnapshot{}, nil, model.SessionTicket{}, fmt.Errorf("%w: o host não pode entrar como convidado", ErrInvalidInput)
	}

	guestDisplayName := strings.TrimSpace(req.DisplayName)
	hostDisplayName := strings.TrimSpace(room.HostDisplayName)
	if guestDisplayName != "" && hostDisplayName != "" && strings.EqualFold(guestDisplayName, hostDisplayName) {
		return model.RoomSnapshot{}, nil, model.SessionTicket{}, fmt.Errorf("%w: o nome do convidado não pode ser igual ao do host", ErrInvalidInput)
	}

	if room.Snapshot.GuestPlayerID != nil && *room.Snapshot.GuestPlayerID != req.PlayerID {
		return model.RoomSnapshot{}, nil, model.SessionTicket{}, fmt.Errorf("%w: sala já possui dois participantes", ErrConflict)
	}

	if room.Snapshot.GuestPlayerID == nil {
		guestID := req.PlayerID
		room.Snapshot.GuestPlayerID = &guestID
		room.GuestDisplayName = &guestDisplayName
		if room.Snapshot.Status != model.RoomStatePlaying {
			room.Snapshot.Status = model.RoomStateReady
		}
	} else {
		room.GuestDisplayName = &guestDisplayName
	}
	room.LastActivityAt = now

	if room.ActiveMatchID != nil {
		if rec, exists := s.matches[*room.ActiveMatchID]; exists && rec.Snapshot.Mode == model.MatchModePVPRemote {
			guestIndex := slices.IndexFunc(rec.Snapshot.Participants, func(p model.MatchParticipant) bool {
				return !p.IsHost && !p.IsBot
			})
			if guestIndex >= 0 {
				rec.Snapshot.Participants[guestIndex].PlayerID = req.PlayerID
				rec.Snapshot.Participants[guestIndex].DisplayName = guestDisplayName
				rec.Snapshot.Participants[guestIndex].IsConnected = true
			}
			if rec.Snapshot.State == model.MatchStateWaitingRoom {
				rec.Snapshot.State = model.MatchStateInProgress
			}
			room.Snapshot.Status = model.RoomStatePlaying
		}
	}

	ticket := newSessionTicket(req.PlayerID)
	s.sessions[ticket.SessionID] = &SessionRecord{
		Ticket:   ticket,
		RoomCode: &roomCode,
		LastSeen: now,
	}

	return cloneRoomSnapshot(room.Snapshot), cloneStringPtr(room.ActiveMatchID), ticket, nil
}

func (s *Store) CloseRoom(roomCode string, hostPlayerID string) (*string, error) {
	if strings.TrimSpace(roomCode) == "" || strings.TrimSpace(hostPlayerID) == "" {
		return nil, fmt.Errorf("%w: roomCode and hostPlayerId are required", ErrInvalidInput)
	}

	s.mu.Lock()
	defer s.mu.Unlock()

	room, ok := s.rooms[roomCode]
	if !ok {
		return nil, ErrNotFound
	}

	if strings.TrimSpace(room.Snapshot.HostPlayerID) != strings.TrimSpace(hostPlayerID) {
		return nil, ErrUnauthorized
	}

	activeMatchID := cloneStringPtr(room.ActiveMatchID)
	s.removeRoomLocked(roomCode)
	return activeMatchID, nil
}

func (s *Store) CreateMatch(req model.CreateMatchRequest) (model.MatchSnapshot, *model.RoomSnapshot, model.SessionTicket, error) {
	if strings.TrimSpace(req.HostPlayerID) == "" || strings.TrimSpace(req.HostDisplayName) == "" {
		return model.MatchSnapshot{}, nil, model.SessionTicket{}, fmt.Errorf("%w: hostPlayerId and hostDisplayName are required", ErrInvalidInput)
	}
	if req.Mode != model.MatchModeVSAI && req.Mode != model.MatchModePVPLocal && req.Mode != model.MatchModePVPRemote {
		return model.MatchSnapshot{}, nil, model.SessionTicket{}, fmt.Errorf("%w: invalid mode", ErrInvalidInput)
	}

	s.mu.Lock()
	defer s.mu.Unlock()

	now := time.Now().UTC()
	s.cleanupInactiveRoomsLocked(now)
	matchID := newID("match")
	protocolCode := ""
	var roomResp *model.RoomSnapshot
	var roomRecord *RoomRecord

	if req.RoomCode != nil {
		protocolCode = strings.ToUpper(strings.TrimSpace(*req.RoomCode))
		if protocolCode == "" {
			return model.MatchSnapshot{}, nil, model.SessionTicket{}, fmt.Errorf("%w: invalid room code", ErrInvalidInput)
		}
		r, ok := s.rooms[protocolCode]
		if !ok {
			return model.MatchSnapshot{}, nil, model.SessionTicket{}, ErrNotFound
		}
		roomRecord = r
	} else {
		protocolCode = s.generateUniqueRoomCodeLocked()
	}

	hostSide := model.PlayerSideX
	if req.PreferredSide != nil && *req.PreferredSide == model.PlayerSideO {
		hostSide = model.PlayerSideO
	}
	guestSide := game.OtherSide(hostSide)

	participants := []model.MatchParticipant{
		{
			PlayerID:    req.HostPlayerID,
			DisplayName: req.HostDisplayName,
			Side:        hostSide,
			IsBot:       false,
			IsHost:      true,
			IsConnected: true,
		},
	}

	var aiDifficulty *model.AiDifficulty
	state := model.MatchStateInProgress

	switch req.Mode {
	case model.MatchModeVSAI:
		difficulty := model.AiDifficultyPreAlmoco
		if req.AiDifficulty != nil {
			difficulty = *req.AiDifficulty
		}
		aiDifficulty = &difficulty
		participants = append(participants, model.MatchParticipant{
			PlayerID:    "geraldo-bot",
			DisplayName: "Sr. Geraldo",
			Side:        guestSide,
			IsBot:       true,
			IsHost:      false,
			IsConnected: true,
		})
	case model.MatchModePVPLocal:
		guestName := "Estagiário B"
		if req.GuestDisplayName != nil && strings.TrimSpace(*req.GuestDisplayName) != "" {
			guestName = *req.GuestDisplayName
		}
		participants = append(participants, model.MatchParticipant{
			PlayerID:    fmt.Sprintf("%s-local-2", req.HostPlayerID),
			DisplayName: guestName,
			Side:        guestSide,
			IsBot:       false,
			IsHost:      false,
			IsConnected: true,
		})
	case model.MatchModePVPRemote:
		if req.RoomCode == nil {
			return model.MatchSnapshot{}, nil, model.SessionTicket{}, fmt.Errorf("%w: roomCode is required for pvp_remote", ErrInvalidInput)
		}

		guestID := "guest-remote"
		guestName := "Convidado(a)"
		isConnected := false
		if roomRecord != nil && roomRecord.Snapshot.GuestPlayerID != nil {
			guestID = *roomRecord.Snapshot.GuestPlayerID
			isConnected = true
		}
		if req.GuestDisplayName != nil && strings.TrimSpace(*req.GuestDisplayName) != "" {
			guestName = *req.GuestDisplayName
		} else if roomRecord != nil && roomRecord.GuestDisplayName != nil {
			guestName = *roomRecord.GuestDisplayName
		}

		participants = append(participants, model.MatchParticipant{
			PlayerID:    guestID,
			DisplayName: guestName,
			Side:        guestSide,
			IsBot:       false,
			IsHost:      false,
			IsConnected: isConnected,
		})
		if !isConnected {
			state = model.MatchStateWaitingRoom
		}
	}

	turn := model.PlayerSideX
	roomCode := req.RoomCode

	snapshot := model.MatchSnapshot{
		MatchID:         matchID,
		ProtocolCode:    protocolCode,
		RoomCode:        roomCode,
		Mode:            req.Mode,
		AiDifficulty:    aiDifficulty,
		State:           state,
		Turn:            turn,
		MoveCount:       0,
		Board:           model.BoardSnapshot{Cells: game.MakeEmptyBoard(), WinningLine: nil},
		Participants:    participants,
		Result:          nil,
		StartedAt:       now,
		FinishedAt:      nil,
		DurationSeconds: nil,
	}

	s.matches[matchID] = &MatchRecord{
		Snapshot:      snapshot,
		Moves:         make([]model.MatchMove, 0, 9),
		Messages:      make([]model.ChatMessage, 0, 32),
		Announcements: make([]model.OfficeAnnouncement, 0, 8),
	}

	if roomRecord != nil {
		roomRecord.ActiveMatchID = &matchID
		if state == model.MatchStateWaitingRoom {
			roomRecord.Snapshot.Status = model.RoomStateReady
		} else {
			roomRecord.Snapshot.Status = model.RoomStatePlaying
		}
		roomRecord.LastActivityAt = now
		roomCopy := cloneRoomSnapshot(roomRecord.Snapshot)
		roomResp = &roomCopy
	}

	ticket := newSessionTicket(req.HostPlayerID)
	s.sessions[ticket.SessionID] = &SessionRecord{
		Ticket:   ticket,
		MatchID:  &matchID,
		RoomCode: cloneStringPtr(req.RoomCode),
		LastSeen: now,
	}

	return cloneMatchSnapshot(snapshot), roomResp, ticket, nil
}

func (s *Store) GetMatch(matchID string) (model.MatchSnapshot, error) {
	s.mu.RLock()
	defer s.mu.RUnlock()

	rec, ok := s.matches[matchID]
	if !ok {
		return model.MatchSnapshot{}, ErrNotFound
	}

	return cloneMatchSnapshot(rec.Snapshot), nil
}

func (s *Store) ApplyMove(matchID string, playerID string, cellIndex int) (model.MatchSnapshot, model.MatchMove, error) {
	s.mu.Lock()
	defer s.mu.Unlock()

	rec, ok := s.matches[matchID]
	if !ok {
		return model.MatchSnapshot{}, model.MatchMove{}, ErrNotFound
	}

	if rec.Snapshot.State != model.MatchStateInProgress {
		return model.MatchSnapshot{}, model.MatchMove{}, ErrInvalidState
	}

	participantIndex := slices.IndexFunc(rec.Snapshot.Participants, func(p model.MatchParticipant) bool {
		return p.PlayerID == playerID
	})
	if participantIndex < 0 {
		return model.MatchSnapshot{}, model.MatchMove{}, ErrUnauthorized
	}

	side := rec.Snapshot.Participants[participantIndex].Side
	if side != rec.Snapshot.Turn {
		return model.MatchSnapshot{}, model.MatchMove{}, ErrConflict
	}

	nextBoard, err := game.ApplyMove(rec.Snapshot.Board.Cells, side, cellIndex)
	if err != nil {
		if strings.Contains(err.Error(), "occupied") {
			return model.MatchSnapshot{}, model.MatchMove{}, ErrConflict
		}
		return model.MatchSnapshot{}, model.MatchMove{}, ErrInvalidInput
	}

	now := time.Now().UTC()
	move := model.MatchMove{
		MoveID:    newID("move"),
		PlayerID:  playerID,
		Side:      side,
		CellIndex: cellIndex,
		CreatedAt: now,
	}

	rec.Moves = append(rec.Moves, move)
	rec.Snapshot.Board.Cells = nextBoard
	rec.Snapshot.MoveCount++

	winner, line, draw := game.Resolve(nextBoard)
	if winner != nil {
		result := model.MatchOutcome(*winner)
		rec.Snapshot.Result = &result
		rec.Snapshot.Board.WinningLine = slices.Clone(line)
		rec.Snapshot.State = model.MatchStateFinished
		rec.Snapshot.FinishedAt = &now
		d := int(now.Sub(rec.Snapshot.StartedAt).Seconds())
		if d < 1 {
			d = 1
		}
		rec.Snapshot.DurationSeconds = &d
	} else if draw {
		result := model.MatchOutcomeDraw
		rec.Snapshot.Result = &result
		rec.Snapshot.Board.WinningLine = nil
		rec.Snapshot.State = model.MatchStateFinished
		rec.Snapshot.FinishedAt = &now
		d := int(now.Sub(rec.Snapshot.StartedAt).Seconds())
		if d < 1 {
			d = 1
		}
		rec.Snapshot.DurationSeconds = &d
	} else {
		rec.Snapshot.Turn = game.OtherSide(rec.Snapshot.Turn)
	}

	return cloneMatchSnapshot(rec.Snapshot), move, nil
}

func (s *Store) AddMessage(matchID string, message model.ChatMessage) (model.ChatMessage, error) {
	s.mu.Lock()
	defer s.mu.Unlock()

	rec, ok := s.matches[matchID]
	if !ok {
		return model.ChatMessage{}, ErrNotFound
	}

	if message.MessageID == "" {
		message.MessageID = newID("msg")
	}
	if message.CreatedAt.IsZero() {
		message.CreatedAt = time.Now().UTC()
	}
	if message.MatchID == "" {
		message.MatchID = matchID
	}
	if message.ProtocolCode == "" {
		message.ProtocolCode = rec.Snapshot.ProtocolCode
	}

	rec.Messages = append(rec.Messages, message)
	return message, nil
}

func (s *Store) ListMessages(matchID string, cursor *int, limit int) ([]model.ChatMessage, *int, error) {
	s.mu.RLock()
	defer s.mu.RUnlock()

	rec, ok := s.matches[matchID]
	if !ok {
		return nil, nil, ErrNotFound
	}

	if limit <= 0 {
		limit = 50
	}
	if limit > 200 {
		limit = 200
	}

	start := 0
	if cursor != nil {
		start = *cursor
		if start < 0 {
			start = 0
		}
	}
	if start >= len(rec.Messages) {
		return []model.ChatMessage{}, nil, nil
	}

	end := start + limit
	if end > len(rec.Messages) {
		end = len(rec.Messages)
	}

	items := make([]model.ChatMessage, end-start)
	copy(items, rec.Messages[start:end])

	var next *int
	if end < len(rec.Messages) {
		nextValue := end
		next = &nextValue
	}

	return items, next, nil
}

func (s *Store) AddAnnouncement(matchID string, announcement model.OfficeAnnouncement) (model.OfficeAnnouncement, error) {
	s.mu.Lock()
	defer s.mu.Unlock()

	rec, ok := s.matches[matchID]
	if !ok {
		return model.OfficeAnnouncement{}, ErrNotFound
	}

	if announcement.AnnouncementID == "" {
		announcement.AnnouncementID = newID("ann")
	}
	if announcement.CreatedAt.IsZero() {
		announcement.CreatedAt = time.Now().UTC()
	}
	if announcement.MatchID == "" {
		announcement.MatchID = matchID
	}

	rec.Announcements = append(rec.Announcements, announcement)
	return announcement, nil
}

func (s *Store) ValidateSession(matchID, playerID, sessionID, reconnectToken string) error {
	s.mu.Lock()
	defer s.mu.Unlock()

	session, ok := s.sessions[sessionID]
	if !ok {
		return ErrUnauthorized
	}
	if session.Ticket.PlayerID != playerID || session.Ticket.ReconnectToken != reconnectToken {
		return ErrUnauthorized
	}

	if session.MatchID != nil && *session.MatchID != matchID {
		return ErrUnauthorized
	}

	session.MatchID = &matchID
	session.LastSeen = time.Now().UTC()
	return nil
}

func (s *Store) TouchSession(sessionID string) {
	s.mu.Lock()
	defer s.mu.Unlock()

	if session, ok := s.sessions[sessionID]; ok {
		session.LastSeen = time.Now().UTC()
	}
}

func (s *Store) MatchParticipants(matchID string) ([]model.MatchParticipant, error) {
	s.mu.RLock()
	defer s.mu.RUnlock()

	rec, ok := s.matches[matchID]
	if !ok {
		return nil, ErrNotFound
	}

	participants := make([]model.MatchParticipant, len(rec.Snapshot.Participants))
	copy(participants, rec.Snapshot.Participants)
	return participants, nil
}

func (s *Store) ListRooms(onlyAvailable bool, limit int) []model.RoomListItem {
	s.mu.Lock()
	defer s.mu.Unlock()

	now := time.Now().UTC()
	s.cleanupInactiveRoomsLocked(now)

	if limit <= 0 {
		limit = 100
	}
	if limit > 300 {
		limit = 300
	}

	items := make([]model.RoomListItem, 0, len(s.rooms))
	for _, room := range s.rooms {
		if onlyAvailable {
			if room.Snapshot.Status != model.RoomStateWaitingGuest && room.Snapshot.Status != model.RoomStateReady {
				continue
			}
		}

		items = append(items, model.RoomListItem{
			RoomCode:        room.Snapshot.RoomCode,
			Status:          room.Snapshot.Status,
			HostDisplayName: room.HostDisplayName,
			ActiveMatchID:   cloneStringPtr(room.ActiveMatchID),
			CreatedAt:       room.Snapshot.CreatedAt,
			ExpiresAt:       room.Snapshot.ExpiresAt,
			LastActivityAt:  room.LastActivityAt,
		})
	}

	slices.SortFunc(items, func(a, b model.RoomListItem) int {
		if a.LastActivityAt.After(b.LastActivityAt) {
			return -1
		}
		if a.LastActivityAt.Before(b.LastActivityAt) {
			return 1
		}
		return strings.Compare(a.RoomCode, b.RoomCode)
	})

	if len(items) > limit {
		items = items[:limit]
	}
	return items
}

func (s *Store) generateUniqueRoomCodeLocked() string {
	for {
		n, _ := rand.Int(rand.Reader, big.NewInt(9000))
		code := fmt.Sprintf("DFGF-%04d", int(n.Int64())+1000)
		if _, exists := s.rooms[code]; !exists {
			return code
		}
	}
}

func newID(prefix string) string {
	buf := make([]byte, 8)
	_, _ = rand.Read(buf)
	return prefix + "_" + hex.EncodeToString(buf)
}

func newSessionTicket(playerID string) model.SessionTicket {
	return model.SessionTicket{
		SessionID:           newID("sess"),
		PlayerID:            playerID,
		ReconnectToken:      newID("recon"),
		HeartbeatIntervalMs: 15000,
	}
}

func cloneRoomSnapshot(in model.RoomSnapshot) model.RoomSnapshot {
	copy := in
	copy.GuestPlayerID = cloneStringPtr(in.GuestPlayerID)
	return copy
}

func (s *Store) cleanupInactiveRoomsLocked(now time.Time) {
	for roomCode, room := range s.rooms {
		if now.After(room.Snapshot.ExpiresAt) {
			s.removeRoomLocked(roomCode)
			continue
		}

		idleFor := now.Sub(room.LastActivityAt)
		if room.Snapshot.Status == model.RoomStatePlaying {
			if idleFor > roomPlayingIdleTTL {
				s.removeRoomLocked(roomCode)
			}
			continue
		}

		if idleFor > roomIdleTTL {
			s.removeRoomLocked(roomCode)
		}
	}
}

func (s *Store) removeRoomLocked(roomCode string) {
	room, ok := s.rooms[roomCode]
	if !ok {
		return
	}

	if room.ActiveMatchID != nil {
		delete(s.matches, *room.ActiveMatchID)
	}
	delete(s.rooms, roomCode)

	for sessionID, session := range s.sessions {
		if session.RoomCode != nil && *session.RoomCode == roomCode {
			delete(s.sessions, sessionID)
		}
	}
}

func cloneStringPtr(in *string) *string {
	if in == nil {
		return nil
	}
	v := *in
	return &v
}

func clonePlayerSidePtr(in *model.PlayerSide) *model.PlayerSide {
	if in == nil {
		return nil
	}
	v := *in
	return &v
}

func cloneMatchSnapshot(in model.MatchSnapshot) model.MatchSnapshot {
	out := in
	out.RoomCode = cloneStringPtr(in.RoomCode)
	if in.AiDifficulty != nil {
		v := *in.AiDifficulty
		out.AiDifficulty = &v
	}
	if in.Result != nil {
		v := *in.Result
		out.Result = &v
	}
	if in.FinishedAt != nil {
		v := *in.FinishedAt
		out.FinishedAt = &v
	}
	if in.DurationSeconds != nil {
		v := *in.DurationSeconds
		out.DurationSeconds = &v
	}
	out.Board = model.BoardSnapshot{
		Cells:       make([]*model.PlayerSide, len(in.Board.Cells)),
		WinningLine: slices.Clone(in.Board.WinningLine),
	}
	for i := range in.Board.Cells {
		out.Board.Cells[i] = clonePlayerSidePtr(in.Board.Cells[i])
	}
	out.Participants = make([]model.MatchParticipant, len(in.Participants))
	copy(out.Participants, in.Participants)
	return out
}
