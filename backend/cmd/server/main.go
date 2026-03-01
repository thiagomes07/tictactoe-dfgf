package main

import (
	"context"
	"log"
	"net/http"
	"os"
	"time"

	"github.com/thiagogomes/tictactoe-dfgf/backend/internal/api"
	"github.com/thiagogomes/tictactoe-dfgf/backend/internal/chat"
	"github.com/thiagogomes/tictactoe-dfgf/backend/internal/store"
	"github.com/thiagogomes/tictactoe-dfgf/backend/internal/ws"
)

func main() {
	port := os.Getenv("PORT")
	if port == "" {
		port = "8080"
	}

	version := os.Getenv("APP_VERSION")
	mux := http.NewServeMux()
	memStore := store.New()
	chatService := chat.NewService(context.Background())
	hub := ws.NewHub(memStore)
	server := api.NewServer(memStore, chatService, hub, version)
	server.RegisterRoutes(mux)

	addr := ":" + port
	log.Printf("backend listening on %s", addr)
	httpServer := &http.Server{
		Addr:              addr,
		Handler:           api.WithCORS(mux),
		ReadHeaderTimeout: 10 * time.Second,
	}

	if err := httpServer.ListenAndServe(); err != nil {
		log.Fatal(err)
	}
}
