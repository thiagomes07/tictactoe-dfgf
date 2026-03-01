FROM golang:1.23-alpine AS builder
WORKDIR /app

COPY go.mod ./
RUN go mod download

COPY . .
RUN CGO_ENABLED=0 GOOS=linux GOARCH=amd64 go build -o /bin/server ./cmd/server

FROM alpine:3.21
WORKDIR /app
COPY --from=builder /bin/server /usr/local/bin/server
EXPOSE 8080
ENV PORT=8080
ENTRYPOINT ["/usr/local/bin/server"]
