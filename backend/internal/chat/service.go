package chat

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"log"
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
	defaultModelID     = "us.anthropic.claude-sonnet-4-20250514-v1:0"
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

type ReplyOptions struct {
	AllowedActors []model.ActorID
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
		log.Printf("chat: bedrock disabled via BEDROCK_ENABLED=false")
		return svc
	}

	cfg, err := awsconfig.LoadDefaultConfig(ctx, awsconfig.WithRegion(region))
	if err != nil {
		svc.enabled = false
		log.Printf("chat: failed to load AWS config (region=%s): %v", region, err)
		return svc
	}

	svc.bedrock = NewBedrockClient(bedrockruntime.NewFromConfig(cfg), modelID, maxTokens, temperature)
	log.Printf(
		"chat: bedrock enabled (region=%s, model=%s, maxTokens=%d, temperature=%.2f)",
		region,
		modelID,
		maxTokens,
		temperature,
	)
	return svc
}

func (s *Service) Enabled() bool {
	return s.enabled && s.bedrock != nil
}

func (s *Service) GenerateReply(
	ctx context.Context,
	snapshot model.MatchSnapshot,
	recent []model.ChatMessage,
	userText string,
	options ReplyOptions,
) (model.ActorID, string) {
	fallbackActor, fallbackBody := fallbackUserReply(s.rng, userText, options.AllowedActors)
	if !s.Enabled() {
		log.Printf("chat: bedrock disabled, using fallback reply (match=%s)", snapshot.MatchID)
		return fallbackActor, fallbackBody
	}

	prompt := buildChatReplyPrompt(snapshot, recent, userText, options.AllowedActors)
	response, err := s.bedrock.Generate(ctx, prompt, 320)
	if err != nil {
		log.Printf("chat: bedrock reply error (match=%s): %v; using fallback", snapshot.MatchID, err)
		return fallbackActor, fallbackBody
	}

	actorID, body, ok := parseReplyJSON(response)
	if !ok || !actorAllowed(actorID, options.AllowedActors) {
		log.Printf("chat: invalid bedrock reply (match=%s), using fallback. payload=%q", snapshot.MatchID, response)
		return fallbackActor, fallbackBody
	}

	return actorID, body
}

func (s *Service) GenerateAnnouncement(ctx context.Context, snapshot model.MatchSnapshot, hint string) string {
	fallback := fallbackAnnouncement(s.rng)
	if !s.Enabled() {
		log.Printf("chat: bedrock disabled for announcement (match=%s), using fallback", snapshot.MatchID)
		return fallback
	}

	prompt := buildAnnouncementPrompt(snapshot, hint)
	response, err := s.bedrock.Generate(ctx, prompt, 120)
	if err != nil {
		log.Printf("chat: announcement generation error (match=%s): %v; using fallback", snapshot.MatchID, err)
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
		log.Printf("chat: bedrock move suggestion error (match=%s): %v", snapshot.MatchID, err)
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

func actorAllowed(actor model.ActorID, allowedActors []model.ActorID) bool {
	if len(allowedActors) == 0 {
		return true
	}
	for _, allowed := range allowedActors {
		if actor == allowed {
			return true
		}
	}
	return false
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

func fallbackUserReply(rng *rand.Rand, userText string, allowedActors []model.ActorID) (model.ActorID, string) {
	text := strings.ToLower(userText)
	if (strings.Contains(text, "cafe") || strings.Contains(text, "café")) && actorAllowed(model.ActorPatricia, allowedActors) {
		return model.ActorPatricia, "Atualização de RH: chamado do café foi priorizado e encaminhado com urgência moderada."
	}
	if strings.Contains(text, "geraldo") && actorAllowed(model.ActorMarlene, allowedActors) {
		return model.ActorMarlene, "Excelente referência ao Sr. Geraldo. A liderança reconhece sua postura proativa."
	}
	if strings.Contains(text, "promoc") && actorAllowed(model.ActorTulio, allowedActors) {
		return model.ActorTulio, "Promoção depende de KPI, comitê, orçamento e alinhamento cósmico da semana."
	}
	if strings.Contains(text, "prazo") && actorAllowed(model.ActorSistemaDFGF, allowedActors) {
		return model.ActorSistemaDFGF, "PRAZO REVISADO. NOVO CENÁRIO: 12 DIAS ÚTEIS, SUJEITO A REAVALIAÇÃO DO RITO."
	}
	if strings.Contains(text, "rh") && actorAllowed(model.ActorPatricia, allowedActors) {
		return model.ActorPatricia, "RH registra sua solicitação. Se necessário, abrimos mediação com ata e café."
	}

	pool := []struct {
		actor model.ActorID
		body  string
	}{
		{model.ActorMarlene, "Se o Sr. Geraldo concordar, já considero essa rodada histórica para o departamento."},
		{model.ActorMarlene, "Excelente colocação. A chefia comentou algo parecido no corredor hoje cedo."},
		{model.ActorTulio, "Tudo sob controle, segundo o relatório que ninguém leu até o fim."},
		{model.ActorTulio, "Boa ideia. Agora falta apenas sobreviver à interpretação da chefia."},
		{model.ActorPatricia, "Registrado. RH agradece sua colaboração com o clima organizacional."},
		{model.ActorPatricia, "Anotado. Se o diálogo escalar, abrimos um fluxo formal de acompanhamento."},
		{model.ActorSistemaDFGF, "MENSAGEM RECEBIDA. RETORNO FORMAL PREVISTO EM 12 DIAS ÚTEIS."},
		{model.ActorGeraldo, "Perfeito. Era exatamente essa diretriz que eu estava prestes a oficializar."},
	}

	filteredPool := make([]struct {
		actor model.ActorID
		body  string
	}, 0, len(pool))
	for _, item := range pool {
		if actorAllowed(item.actor, allowedActors) {
			filteredPool = append(filteredPool, item)
		}
	}
	if len(filteredPool) == 0 {
		filteredPool = pool
	}

	selected := filteredPool[rng.Intn(len(filteredPool))]
	return selected.actor, selected.body
}

func fallbackAnnouncement(rng *rand.Rand) string {
	messages := []string{
		"Sr. Geraldo informa: esta rodada está sob controle estratégico integral.",
		"Sr. Geraldo informa: desempenho em linha com o plano mestre de 2009.",
		"Sr. Geraldo informa: resultados adversos também fazem parte da liderança moderna.",
		"Sr. Geraldo informa: mantenham a calma, o método existe mesmo quando não parece.",
		"Sr. Geraldo informa: produtividade alta e coerência opcional, conforme diretriz vigente.",
	}
	return pickRandom(rng, messages)
}

func buildChatReplyPrompt(snapshot model.MatchSnapshot, recent []model.ChatMessage, userText string, allowedActors []model.ActorID) string {
	lastMessages := make([]string, 0, 6)
	start := max(0, len(recent)-6)
	for _, msg := range recent[start:] {
		lastMessages = append(lastMessages, fmt.Sprintf("- %s: %s", msg.ActorID, msg.Body))
	}
	if len(lastMessages) == 0 {
		lastMessages = append(lastMessages, "- sistema_dfgf: PROCESSO ABERTO. AGUARDANDO PREENCHIMENTO.")
	}

	allowed := []string{"marlene", "tulio", "patricia", "sistema_dfgf", "geraldo"}
	if len(allowedActors) > 0 {
		allowed = make([]string, 0, len(allowedActors))
		for _, actor := range allowedActors {
			allowed = append(allowed, string(actor))
		}
	}

	modeContext := "Partida em andamento no Formulário 3x3-B."
	switch snapshot.Mode {
	case model.MatchModeVSAI:
		modeContext = "Modo Estagiário vs Sr. Geraldo. Ambiente competitivo entre estagiário e chefia."
	case model.MatchModePVPLocal:
		modeContext = "Modo Player vs Player Local. Dois estagiários na mesma máquina."
	case model.MatchModePVPRemote:
		modeContext = "Modo Player vs Player Remoto. Sala compartilhada com protocolo oficial."
	}

	boardSummary := summarizeBoard(snapshot)

	return fmt.Sprintf(
		"Você é roteirista de chat corporativo satírico em português brasileiro para o universo Burocracia S.A.\n"+
			"%s\n"+
			"Contexto do jogo: modo=%s, protocolo=%s, turno=%s, status=%s, resultado=%v.\n"+
			"Resumo do tabuleiro: %s\n"+
			"Atores permitidos nesta resposta: %s\n"+
			"PERSONALIDADES OBRIGATORIAS:\n"+
			"- marlene: bajuladora da chefia, puxa-saco do Geraldo, exagera elogios.\n"+
			"- tulio: sarcástico, ironia seca, comentário passivo-agressivo inteligente.\n"+
			"- patricia: RH cordial, lembra regras/processos/clima e temas fora de contexto.\n"+
			"- sistema_dfgf: tom robótico em CAIXA ALTA, burocrático, quase sem emoção.\n"+
			"- geraldo: confiante, autoritário, fala como gênio mesmo quando erra.\n"+
			"Mensagem do usuario: %q\n"+
			"Historico recente:\n%s\n"+
			"Responda com humor sutil e natural, sem repetir frases prontas.\n"+
			"Responda EXCLUSIVAMENTE JSON no formato: {\"actorId\":\"marlene\",\"body\":\"...\"}.\n"+
			"Escolha EXATAMENTE UM ator da lista permitida.\n"+
			"Use português brasileiro com acentuação correta.\n"+
			"Texto curto (max. 220 caracteres), sem markdown e sem emojis.",
		modeContext,
		snapshot.Mode,
		snapshot.ProtocolCode,
		snapshot.Turn,
		snapshot.State,
		snapshot.Result,
		boardSummary,
		strings.Join(allowed, ", "),
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
		"Você decide jogadas de jogo da velha 3x3 para o personagem Sr. Geraldo.\n"+
			"Tabuleiro índices 0..8: %v\n"+
			"Turno atual: %s\n"+
			"Movimentos disponíveis: %v\n"+
			"Retorne SOMENTE JSON: {\"cellIndex\":N} onde N é um índice válido.",
		board,
		snapshot.Turn,
		available,
	)
}

func buildAnnouncementPrompt(snapshot model.MatchSnapshot, hint string) string {
	return fmt.Sprintf(
		"Gere UMA frase curta em português como se fosse o Sr. Geraldo falando em tom confiante e burocrático.\n"+
			"Contexto: protocolo=%s, modo=%s, status=%s, dica=%s.\n"+
			"Sem aspas, sem markdown, max 150 caracteres.",
		snapshot.ProtocolCode,
		snapshot.Mode,
		snapshot.State,
		hint,
	)
}

func summarizeBoard(snapshot model.MatchSnapshot) string {
	if len(snapshot.Board.Cells) == 0 {
		return "tabuleiro vazio"
	}
	cells := make([]string, len(snapshot.Board.Cells))
	for i, cell := range snapshot.Board.Cells {
		if cell == nil {
			cells[i] = "_"
			continue
		}
		cells[i] = string(*cell)
	}
	return strings.Join(cells, "")
}
