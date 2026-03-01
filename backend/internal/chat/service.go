package chat

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"math/rand"
	"os"
	"regexp"
	"strconv"
	"strings"
	"time"

	awsconfig "github.com/aws/aws-sdk-go-v2/config"
	"github.com/aws/aws-sdk-go-v2/service/bedrockruntime"

	"github.com/thiagogomes/tictactoe-dfgf/backend/internal/model"
)

const (
	defaultRegion      = "us-east-1"
	defaultModelID     = "anthropic.claude-3-5-sonnet-20240620-v1:0"
	defaultMaxTokens   = 4096
	defaultTemperature = 0.3
)

type Service struct {
	bedrock     *BedrockClient
	modelID     string
	maxTokens   int
	temperature float64
	enabled     bool
	rng         *rand.Rand
}

func NewService(ctx context.Context) *Service {
	region := strings.TrimSpace(getEnv("AWS_REGION", defaultRegion))
	modelID := strings.TrimSpace(getEnv("BEDROCK_MODEL_ID", defaultModelID))
	maxTokens := getEnvInt("BEDROCK_MAX_TOKENS", defaultMaxTokens)
	temperature := getEnvFloat("BEDROCK_TEMPERATURE", defaultTemperature)
	enabled := getEnvBool("BEDROCK_ENABLED", true)

	svc := &Service{
		modelID:     modelID,
		maxTokens:   maxTokens,
		temperature: temperature,
		enabled:     enabled,
		rng:         rand.New(rand.NewSource(time.Now().UnixNano())),
	}

	if !enabled {
		return svc
	}

	cfg, err := awsconfig.LoadDefaultConfig(ctx, awsconfig.WithRegion(region))
	if err != nil {
		svc.enabled = false
		return svc
	}

	svc.bedrock = NewBedrockClient(bedrockruntime.NewFromConfig(cfg), modelID, maxTokens, temperature)
	return svc
}

func (s *Service) Enabled() bool {
	return s.enabled && s.bedrock != nil
}

func (s *Service) GenerateReply(ctx context.Context, snapshot model.MatchSnapshot, recent []model.ChatMessage, userText string) (model.ActorID, string) {
	fallbackActor, fallbackBody := fallbackUserReply(s.rng, userText)
	if !s.Enabled() {
		return fallbackActor, fallbackBody
	}

	prompt := buildChatReplyPrompt(snapshot, recent, userText)
	response, err := s.bedrock.Generate(ctx, prompt, 320)
	if err != nil {
		return fallbackActor, fallbackBody
	}

	actorID, body, ok := parseReplyJSON(response)
	if !ok {
		return fallbackActor, fallbackBody
	}

	return actorID, body
}

func (s *Service) GenerateAnnouncement(ctx context.Context, snapshot model.MatchSnapshot, hint string) string {
	fallback := fallbackAnnouncement(s.rng)
	if !s.Enabled() {
		return fallback
	}

	prompt := buildAnnouncementPrompt(snapshot, hint)
	response, err := s.bedrock.Generate(ctx, prompt, 120)
	if err != nil {
		return fallback
	}

	text := strings.TrimSpace(response)
	if text == "" {
		return fallback
	}

	return text
}

func (s *Service) SuggestGeraldoMove(ctx context.Context, snapshot model.MatchSnapshot, available []int) (int, error) {
	if !s.Enabled() {
		return -1, errors.New("bedrock unavailable")
	}

	prompt := buildMovePrompt(snapshot, available)
	response, err := s.bedrock.Generate(ctx, prompt, 80)
	if err != nil {
		return -1, err
	}

	move, ok := parseMoveResponse(response)
	if !ok {
		return -1, errors.New("could not parse move response")
	}

	for _, candidate := range available {
		if candidate == move {
			return move, nil
		}
	}

	return -1, errors.New("bedrock move not available")
}

func parseReplyJSON(raw string) (model.ActorID, string, bool) {
	type reply struct {
		ActorID string `json:"actorId"`
		Body    string `json:"body"`
	}

	jsonCandidate := extractJSONObject(raw)
	var decoded reply
	if err := json.Unmarshal([]byte(jsonCandidate), &decoded); err != nil {
		return "", "", false
	}

	actor := model.ActorID(strings.TrimSpace(decoded.ActorID))
	if !isAllowedActor(actor) {
		return "", "", false
	}
	body := strings.TrimSpace(decoded.Body)
	if body == "" {
		return "", "", false
	}

	return actor, body, true
}

func parseMoveResponse(raw string) (int, bool) {
	candidate := extractJSONObject(raw)
	if candidate != "" {
		var decoded struct {
			CellIndex *int `json:"cellIndex"`
		}
		if err := json.Unmarshal([]byte(candidate), &decoded); err == nil && decoded.CellIndex != nil {
			return *decoded.CellIndex, true
		}
	}

	re := regexp.MustCompile(`\b([0-8])\b`)
	match := re.FindStringSubmatch(raw)
	if len(match) < 2 {
		return 0, false
	}
	value, err := strconv.Atoi(match[1])
	if err != nil {
		return 0, false
	}
	return value, true
}

func extractJSONObject(raw string) string {
	trimmed := strings.TrimSpace(raw)
	if trimmed == "" {
		return ""
	}
	start := strings.Index(trimmed, "{")
	end := strings.LastIndex(trimmed, "}")
	if start < 0 || end <= start {
		return trimmed
	}
	return trimmed[start : end+1]
}

func isAllowedActor(actor model.ActorID) bool {
	switch actor {
	case model.ActorMarlene, model.ActorTulio, model.ActorPatricia, model.ActorSistemaDFGF, model.ActorGeraldo:
		return true
	default:
		return false
	}
}

func getEnv(key, fallback string) string {
	value := strings.TrimSpace(os.Getenv(key))
	if value == "" {
		return fallback
	}
	return value
}

func getEnvInt(key string, fallback int) int {
	value := strings.TrimSpace(os.Getenv(key))
	if value == "" {
		return fallback
	}
	parsed, err := strconv.Atoi(value)
	if err != nil {
		return fallback
	}
	return parsed
}

func getEnvFloat(key string, fallback float64) float64 {
	value := strings.TrimSpace(os.Getenv(key))
	if value == "" {
		return fallback
	}
	parsed, err := strconv.ParseFloat(value, 64)
	if err != nil {
		return fallback
	}
	return parsed
}

func getEnvBool(key string, fallback bool) bool {
	value := strings.TrimSpace(os.Getenv(key))
	if value == "" {
		return fallback
	}
	switch strings.ToLower(value) {
	case "1", "true", "yes", "y", "on":
		return true
	case "0", "false", "no", "n", "off":
		return false
	default:
		return fallback
	}
}

func pickRandom(rng *rand.Rand, values []string) string {
	if len(values) == 0 {
		return ""
	}
	return values[rng.Intn(len(values))]
}

func fallbackUserReply(rng *rand.Rand, userText string) (model.ActorID, string) {
	text := strings.ToLower(userText)
	if strings.Contains(text, "cafe") {
		return model.ActorPatricia, "Atualizacao de RH: chamado do cafe foi priorizado e escalado."
	}
	if strings.Contains(text, "geraldo") {
		return model.ActorMarlene, "Excelente referencia ao Sr. Geraldo. Lideranca reconhece postura proativa."
	}
	if strings.Contains(text, "promoc") {
		return model.ActorTulio, "Promocao depende de KPI, comite e alinhamento cosmico da semana."
	}

	pool := []struct {
		actor model.ActorID
		body  string
	}{
		{model.ActorMarlene, "Se o Sr. Geraldo concordar, ja considero essa rodada historica."},
		{model.ActorTulio, "Tudo sob controle, segundo o relatorio que ninguem leu inteiro."},
		{model.ActorPatricia, "Registrado. RH agradece sua colaboracao com o clima organizacional."},
		{model.ActorSistemaDFGF, "MENSAGEM RECEBIDA. RETORNO FORMAL PREVISTO EM 12 DIAS UTEIS."},
	}

	selected := pool[rng.Intn(len(pool))]
	return selected.actor, selected.body
}

func fallbackAnnouncement(rng *rand.Rand) string {
	messages := []string{
		"Sr. Geraldo informa: esta rodada esta sob controle estrategico integral.",
		"Sr. Geraldo informa: desempenho em linha com o plano mestre de 2009.",
		"Sr. Geraldo informa: resultados adversos tambem sao parte da lideranca moderna.",
	}
	return pickRandom(rng, messages)
}

func buildChatReplyPrompt(snapshot model.MatchSnapshot, recent []model.ChatMessage, userText string) string {
	lastMessages := make([]string, 0, 6)
	start := max(0, len(recent)-6)
	for _, msg := range recent[start:] {
		lastMessages = append(lastMessages, fmt.Sprintf("- %s: %s", msg.ActorID, msg.Body))
	}

	return fmt.Sprintf(
		"Voce e um gerador de falas para um chat corporativo satirico em portugues.\n"+
			"Contexto do jogo: modo=%s, protocolo=%s, turno=%s.\n"+
			"Personagens validos para responder: marlene, tulio, patricia, sistema_dfgf, geraldo.\n"+
			"Mensagem do usuario: %q\n"+
			"Historico recente:\n%s\n"+
			"Responda EXCLUSIVAMENTE JSON no formato: {\"actorId\":\"marlene\",\"body\":\"...\"}.\n"+
			"Texto curto (max 180 chars), sem markdown.",
		snapshot.Mode,
		snapshot.ProtocolCode,
		snapshot.Turn,
		userText,
		strings.Join(lastMessages, "\n"),
	)
}

func buildMovePrompt(snapshot model.MatchSnapshot, available []int) string {
	board := make([]string, len(snapshot.Board.Cells))
	for i, c := range snapshot.Board.Cells {
		if c == nil {
			board[i] = "_"
		} else {
			board[i] = string(*c)
		}
	}

	return fmt.Sprintf(
		"Voce decide jogadas de jogo da velha 3x3 para o personagem Sr. Geraldo.\n"+
			"Tabuleiro indices 0..8: %v\n"+
			"Turno atual: %s\n"+
			"Movimentos disponiveis: %v\n"+
			"Retorne SOMENTE JSON: {\"cellIndex\":N} onde N e um indice valido.",
		board,
		snapshot.Turn,
		available,
	)
}

func buildAnnouncementPrompt(snapshot model.MatchSnapshot, hint string) string {
	return fmt.Sprintf(
		"Gere UMA frase curta em portugues como se fosse o Sr. Geraldo falando em tom confiante e burocratico.\n"+
			"Contexto: protocolo=%s, modo=%s, status=%s, dica=%s.\n"+
			"Sem aspas, sem markdown, max 150 caracteres.",
		snapshot.ProtocolCode,
		snapshot.Mode,
		snapshot.State,
		hint,
	)
}
