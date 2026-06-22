// Package metrics — cold-start guard for EstimateForPR.
package metrics

import (
	"context"
	"errors"
	"testing"

	"github.com/exo/gitstate/internal/llm"
)

// TestEstimateForPR_NilLLM_NoPanic asserts that a Service built with a nil
// *llm.Service (the post-sync metrics.New(db, nil) shape) returns the
// ErrLLMNotConfigured sentinel instead of panicking on a nil-pointer
// dereference. The guard fires before any DB access, so a nil db is fine.
//
// On the pre-fix code this panics (llmSvc := s.llm == nil →
// llmSvc.EstimateDifficulty dereferences s.provider on a nil *Service); the
// test recovers and fails so the regression is caught.
func TestEstimateForPR_NilLLM_NoPanic(t *testing.T) {
	svc := New(nil, nil) // nil db + nil llm

	defer func() {
		if r := recover(); r != nil {
			t.Fatalf("EstimateForPR panicked with nil llm.Service: %v", r)
		}
	}()

	_, err := svc.EstimateForPR(context.Background(), "org", "pr", "some diff")
	if !errors.Is(err, llm.ErrLLMNotConfigured) {
		t.Fatalf("want ErrLLMNotConfigured, got %v", err)
	}
}
