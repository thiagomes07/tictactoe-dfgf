package chat

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"strings"

	"github.com/aws/aws-sdk-go-v2/aws"
	"github.com/aws/aws-sdk-go-v2/service/bedrockruntime"
)

type bedrockInvoker interface {
	InvokeModel(ctx context.Context, params *bedrockruntime.InvokeModelInput, optFns ...func(*bedrockruntime.Options)) (*bedrockruntime.InvokeModelOutput, error)
}

type BedrockClient struct {
	client      bedrockInvoker
	modelID     string
	maxTokens   int
	temperature float64
}

func NewBedrockClient(client bedrockInvoker, modelID string, maxTokens int, temperature float64) *BedrockClient {
	return &BedrockClient{
		client:      client,
		modelID:     modelID,
		maxTokens:   maxTokens,
		temperature: temperature,
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

	output, err := c.client.InvokeModel(ctx, &bedrockruntime.InvokeModelInput{
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
