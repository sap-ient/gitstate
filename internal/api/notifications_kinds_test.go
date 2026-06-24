package api

import "testing"

func TestValidChannelKind(t *testing.T) {
	valid := []string{"slack", "webhook", "discord", "google_chat", "teams", "email"}
	for _, k := range valid {
		if !validChannelKind(k) {
			t.Errorf("validChannelKind(%q) = false, want true", k)
		}
	}
	invalid := []string{"", "Slack", "discordd", "msteams", "googlechat", "sms"}
	for _, k := range invalid {
		if validChannelKind(k) {
			t.Errorf("validChannelKind(%q) = true, want false", k)
		}
	}
}

func TestIsWebhookKind(t *testing.T) {
	webhook := []string{"slack", "webhook", "discord", "google_chat", "teams"}
	for _, k := range webhook {
		if !isWebhookKind(k) {
			t.Errorf("isWebhookKind(%q) = false, want true", k)
		}
	}
	// email is a valid kind but not a webhook kind.
	if isWebhookKind("email") {
		t.Error("isWebhookKind(email) = true, want false")
	}
	if isWebhookKind("nope") {
		t.Error("isWebhookKind(nope) = true, want false")
	}
}
