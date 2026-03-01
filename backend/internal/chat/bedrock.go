package chat

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"math/rand"
	"net"
	"strings"
	"time"

	"github.com/aws/aws-sdk-go-v2/aws"
	"github.com/aws/aws-sdk-go-v2/service/bedrockruntime"
	"github.com/aws/smithy-go"
)

type bedrockInvoker interface {
	InvokeModel(ctx context.Context, params *bedrockruntime.InvokeModelInput, optFns ...func(*bedrockruntime.Options)) (*bedrockruntime.InvokeModelOutput, error)
}

type BedrockClient struct {
	client      bedrockInvoker
	modelID     string
	maxTokens   int
	temperature float64
	rng         *rand.Rand
}

func NewBedrockClient(client bedrockInvoker, modelID string, maxTokens int, temperature float64) *BedrockClient {
	return &BedrockClient{
		client:      client,
		modelID:     modelID,
		maxTokens:   maxTokens,
		temperature: temperature,
		rng:         rand.New(rand.NewSource(time.Now().UnixNano())),
	}
}

func (c *BedrockClient) Generate(ctx context.Context, prompt string, maxTokensOverride int) (string, error) {
	if c == nil || c.client == nil {
		return "", errors.New("bedrock client unavailable")
	}

	maxTokens := c.maxTokens
	if maxTokensOverride > 0 {
		maxTokens = maxTokensOverride
	}
	if maxTokens <= 0 {
		maxTokens = defaultMaxTokens
	}

	requestPayload := map[string]any{
		"anthropic_version": "bedrock-2023-05-31",
		"max_tokens":        maxTokens,
		"temperature":       c.temperature,
		"messages": []map[string]any{
			{
				"role": "user",
				"content": []map[string]any{
					{
						"type": "text",
						"text": prompt,
					},
				},
			},
		},
	}

	body, err := json.Marshal(requestPayload)
	if err != nil {
		return "", fmt.Errorf("marshal invoke payload: %w", err)
	}

	output, err := c.invokeWithRetry(ctx, &bedrockruntime.InvokeModelInput{
		ModelId:     aws.String(c.modelID),
		ContentType: aws.String("application/json"),
		Accept:      aws.String("application/json"),
		Body:        body,
	})
	if err != nil {
		return "", err
	}

	text, err := extractAnthropicText(output.Body)
	if err != nil {
		return "", err
	}
	return text, nil
}

func extractAnthropicText(raw []byte) (string, error) {
	var envelope struct {
		Content []struct {
			Type string `json:"type"`
			Text string `json:"text"`
		} `json:"content"`
		Completion string `json:"completion"`
	}

	if err := json.Unmarshal(raw, &envelope); err != nil {
		return "", fmt.Errorf("unmarshal bedrock output: %w", err)
	}

	for _, block := range envelope.Content {
		if strings.TrimSpace(block.Type) == "text" && strings.TrimSpace(block.Text) != "" {
			return strings.TrimSpace(block.Text), nil
		}
	}

	if strings.TrimSpace(envelope.Completion) != "" {
		return strings.TrimSpace(envelope.Completion), nil
	}

	return "", errors.New("bedrock output has no text content")
}

func (c *BedrockClient) invokeWithRetry(ctx context.Context, input *bedrockruntime.InvokeModelInput) (*bedrockruntime.InvokeModelOutput, error) {
	const maxAttempts = 5
	baseDelay := 220 * time.Millisecond

	var lastErr error
	for attempt := 1; attempt <= maxAttempts; attempt++ {
		output, err := c.client.InvokeModel(ctx, input)
		if err == nil {
			return output, nil
		}

		lastErr = err
		if !isRetryableBedrockError(err) || attempt == maxAttempts {
			break
		}

		jitter := time.Duration(c.rng.Intn(170)) * time.Millisecond
		backoff := baseDelay * time.Duration(1<<(attempt-1))
		delay := minDuration(3*time.Second, backoff+jitter)

		timer := time.NewTimer(delay)
		select {
		case <-ctx.Done():
			timer.Stop()
			return nil, ctx.Err()
		case <-timer.C:
		}
	}

	return nil, lastErr
}

func isRetryableBedrockError(err error) bool {
	var apiErr smithy.APIError
	if errors.As(err, &apiErr) {
		code := strings.ToLower(strings.TrimSpace(apiErr.ErrorCode()))
		if strings.Contains(code, "throttl") || strings.Contains(code, "too") || strings.Contains(code, "timeout") {
			return true
		}
		if strings.Contains(code, "serviceunavailable") || strings.Contains(code, "internal") {
			return true
		}
	}

	var netErr net.Error
	if errors.As(err, &netErr) {
		return true
	}

	return false
}

func minDuration(a, b time.Duration) time.Duration {
	if a < b {
		return a
	}
	return b
}
