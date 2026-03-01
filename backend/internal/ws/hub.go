package ws

import (
	"encoding/json"
	"net/http"
	"strings"
	"sync"
	"time"

	"github.com/gorilla/websocket"

	"github.com/thiagogomes/tictactoe-dfgf/backend/internal/model"
	"github.com/thiagogomes/tictactoe-dfgf/backend/internal/store"
)

type Hub struct {
	store *store.Store

	upgrader websocket.Upgrader

	mu      sync.RWMutex
	clients map[string]map[*client]struct{}
}

type client struct {
	conn      *websocket.Conn
	hub       *Hub
	matchID   string
	sessionID string
	send      chan []byte
}

func NewHub(store *store.Store) *Hub {
	return &Hub{
		store: store,
		upgrader: websocket.Upgrader{
			ReadBufferSize:  1024,
			WriteBufferSize: 1024,
			CheckOrigin: func(r *http.Request) bool {
				return true
			},
		},
		clients: make(map[string]map[*client]struct{}),
	}
}

func (h *Hub) ServeMatchSocket(w http.ResponseWriter, r *http.Request, matchID string) {
	playerID := strings.TrimSpace(r.URL.Query().Get("playerId"))
	sessionID := strings.TrimSpace(r.URL.Query().Get("sessionId"))
	reconnectToken := strings.TrimSpace(r.URL.Query().Get("reconnectToken"))

	if playerID == "" || sessionID == "" || reconnectToken == "" {
		http.Error(w, "missing ws auth params", http.StatusUnauthorized)
		return
	}

	if err := h.store.ValidateSession(matchID, playerID, sessionID, reconnectToken); err != nil {
		http.Error(w, "invalid session", http.StatusUnauthorized)
		return
	}

	conn, err := h.upgrader.Upgrade(w, r, nil)
	if err != nil {
		return
	}

	c := &client{
		conn:      conn,
		hub:       h,
		matchID:   matchID,
		sessionID: sessionID,
		send:      make(chan []byte, 32),
	}

	h.register(c)
	if snapshot, err := h.store.GetMatch(matchID); err == nil {
		h.sendToClient(c, "match.snapshot", map[string]any{"match": snapshot})
	}

	go c.writePump()
	c.readPump()
}

func (h *Hub) Broadcast(matchID, eventType string, payload any) {
	envelope := model.WsEnvelope[any]{
		Type:      eventType,
		Payload:   payload,
		EmittedAt: time.Now().UTC(),
	}

	encoded, err := json.Marshal(envelope)
	if err != nil {
		return
	}

	h.mu.RLock()
	defer h.mu.RUnlock()

	for c := range h.clients[matchID] {
		select {
		case c.send <- encoded:
		default:
			// Slow client, drop the frame instead of blocking hub.
		}
	}
}

func (h *Hub) register(c *client) {
	h.mu.Lock()
	defer h.mu.Unlock()

	if h.clients[c.matchID] == nil {
		h.clients[c.matchID] = make(map[*client]struct{})
	}
	h.clients[c.matchID][c] = struct{}{}
}

func (h *Hub) unregister(c *client) {
	h.mu.Lock()
	defer h.mu.Unlock()

	set := h.clients[c.matchID]
	if set == nil {
		return
	}
	delete(set, c)
	if len(set) == 0 {
		delete(h.clients, c.matchID)
	}
}

func (h *Hub) sendToClient(c *client, eventType string, payload any) {
	envelope := model.WsEnvelope[any]{
		Type:      eventType,
		Payload:   payload,
		EmittedAt: time.Now().UTC(),
	}

	encoded, err := json.Marshal(envelope)
	if err != nil {
		return
	}

	select {
	case c.send <- encoded:
	default:
	}
}

func (c *client) readPump() {
	defer func() {
		c.hub.unregister(c)
		close(c.send)
		_ = c.conn.Close()
	}()

	_ = c.conn.SetReadDeadline(time.Now().Add(65 * time.Second))
	c.conn.SetPongHandler(func(string) error {
		_ = c.conn.SetReadDeadline(time.Now().Add(65 * time.Second))
		return nil
	})

	for {
		_, payload, err := c.conn.ReadMessage()
		if err != nil {
			return
		}

		var event model.MatchClientEvent
		if err := json.Unmarshal(payload, &event); err != nil {
			continue
		}

		switch event.Type {
		case "presence.ping":
			c.hub.store.TouchSession(c.sessionID)
		case "match.request_snapshot":
			if snapshot, err := c.hub.store.GetMatch(c.matchID); err == nil {
				c.hub.sendToClient(c, "match.snapshot", map[string]any{"match": snapshot})
			}
		case "chat.typing":
			// Typing signal is accepted but not persisted.
		default:
			c.hub.sendToClient(c, "error", map[string]any{"code": "UNSUPPORTED_EVENT", "message": "evento não suportado"})
		}
	}
}

func (c *client) writePump() {
	ticker := time.NewTicker(25 * time.Second)
	defer func() {
		ticker.Stop()
		_ = c.conn.Close()
	}()

	for {
		select {
		case message, ok := <-c.send:
			_ = c.conn.SetWriteDeadline(time.Now().Add(10 * time.Second))
			if !ok {
				_ = c.conn.WriteMessage(websocket.CloseMessage, []byte{})
				return
			}
			if err := c.conn.WriteMessage(websocket.TextMessage, message); err != nil {
				return
			}
		case <-ticker.C:
			_ = c.conn.SetWriteDeadline(time.Now().Add(10 * time.Second))
			if err := c.conn.WriteMessage(websocket.PingMessage, nil); err != nil {
				return
			}
		}
	}
}
