package llm

import (
	"context"
	"fmt"
)

// Complete exposes the underlying provider's raw Complete method on the Service,
// allowing callers (e.g. the report package) to make ad-hoc LLM calls with
// custom system and user prompts without needing to implement their own provider.
// Returns ErrLLMNotConfigured when no provider is available.
func (s *Service) Complete(ctx context.Context, system, user string) (string, error) {
	if s.provider == nil {
		return "", ErrLLMNotConfigured
	}
	text, err := s.provider.Complete(ctx, system, user)
	if err != nil {
		return "", fmt.Errorf("llm.Complete: %w", err)
	}
	return text, nil
}
