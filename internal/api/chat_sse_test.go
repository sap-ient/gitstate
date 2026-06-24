// Package api — chat_sse_test.go
// Unit test for the SSE event encoding the chat endpoint emits. No DB or LLM
// needed: it drives writeSSE directly and asserts each chat event type
// round-trips through the SSE frame format the UI parses.
package api

import (
	"bufio"
	"encoding/json"
	"net/http/httptest"
	"strings"
	"testing"

	"github.com/exo/gitstate/internal/chat"
)

func TestSSEEventEncodingRoundTrips(t *testing.T) {
	rec := httptest.NewRecorder()

	events := []chat.Event{
		{Type: chat.EventToken, Data: map[string]any{"text": "Hello "}},
		{Type: chat.EventToolCall, Data: map[string]any{"id": "c1", "name": "list_repos", "args": map[string]any{}}},
		{Type: chat.EventToolResult, Data: map[string]any{"id": "c1", "name": "list_repos", "result": []any{}}},
		{Type: chat.EventAction, Data: &chat.Action{
			Type: "plan_upgrade", Label: "Upgrade to Pro", Endpoint: "/api/billing/checkout",
			Method: "POST", Payload: map[string]any{"plan": "pro"}, Confirm: true,
		}},
		{Type: chat.EventDone, Data: map[string]any{"content": "done"}},
		{Type: chat.EventError, Data: map[string]any{"error": "boom"}},
	}

	for _, ev := range events {
		if err := writeSSE(rec, string(ev.Type), ev.Data); err != nil {
			t.Fatalf("writeSSE(%s): %v", ev.Type, err)
		}
	}

	// Parse the SSE stream back into (event, data-json) pairs.
	type frame struct {
		event string
		data  string
	}
	var frames []frame
	sc := bufio.NewScanner(strings.NewReader(rec.Body.String()))
	var cur frame
	for sc.Scan() {
		line := sc.Text()
		switch {
		case strings.HasPrefix(line, "event: "):
			cur.event = strings.TrimPrefix(line, "event: ")
		case strings.HasPrefix(line, "data: "):
			cur.data = strings.TrimPrefix(line, "data: ")
		case line == "":
			if cur.event != "" {
				frames = append(frames, cur)
				cur = frame{}
			}
		}
	}

	if len(frames) != len(events) {
		t.Fatalf("parsed %d frames, want %d; body=%q", len(frames), len(events), rec.Body.String())
	}

	for i, f := range frames {
		if f.event != string(events[i].Type) {
			t.Errorf("frame %d event = %q, want %q", i, f.event, events[i].Type)
		}
		// data must be valid single-line JSON.
		var back map[string]any
		if err := json.Unmarshal([]byte(f.data), &back); err != nil {
			t.Errorf("frame %d data not JSON: %v (%q)", i, err, f.data)
		}
		if strings.Contains(f.data, "\n") {
			t.Errorf("frame %d data contains a newline; SSE data must be one line", i)
		}
	}

	// Spot-check the action frame carries the full Action contract.
	var act chat.Action
	if err := json.Unmarshal([]byte(frames[3].data), &act); err != nil {
		t.Fatalf("decode action frame: %v", err)
	}
	if act.Endpoint != "/api/billing/checkout" || act.Method != "POST" || !act.Confirm {
		t.Errorf("action frame contract wrong: %+v", act)
	}
	if act.Payload["plan"] != "pro" {
		t.Errorf("action payload plan = %v", act.Payload["plan"])
	}
}
