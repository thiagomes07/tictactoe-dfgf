package main

import (
	"log"
	"net/http"
	"os"

	"github.com/thiagogomes/tictactoe-dfgf/backend/internal/httpapi"
)

func main() {
	port := os.Getenv("PORT")
	if port == "" {
		port = "8080"
	}

	mux := http.NewServeMux()
	httpapi.RegisterRoutes(mux)

	addr := ":" + port
	log.Printf("backend listening on %s", addr)
	if err := http.ListenAndServe(addr, mux); err != nil {
		log.Fatal(err)
	}
}
