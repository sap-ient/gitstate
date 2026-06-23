package email

import (
	"context"
	"encoding/base64"
	"mime"
	"mime/multipart"
	"net/smtp"
	"strings"
	"testing"
)

// TestBuildMIMEWithAttachment verifies the composed message is a valid
// multipart/mixed with an HTML part and a decodable base64 PDF attachment.
func TestBuildMIMEWithAttachment(t *testing.T) {
	pdf := []byte("%PDF-1.7\nfake invoice bytes\n%%EOF")
	msg, err := BuildMIME(
		"billing@gitstate.dev",
		[]string{"owner@acme.test", "second@acme.test"},
		"Your gitstate invoice INV-2026-014",
		"<html><body><h1>Invoice</h1></body></html>",
		[]Attachment{{Filename: "invoice.pdf", ContentType: "application/pdf", Data: pdf}},
	)
	if err != nil {
		t.Fatalf("BuildMIME: %v", err)
	}

	// Split headers from body.
	raw := string(msg)
	if !strings.Contains(raw, "To: owner@acme.test, second@acme.test\r\n") {
		t.Errorf("To header missing/joined wrong:\n%s", headOf(raw))
	}
	if !strings.Contains(raw, "Subject: Your gitstate invoice INV-2026-014\r\n") {
		t.Error("Subject header missing")
	}

	mediaType, params, err := mime.ParseMediaType(headerValue(raw, "Content-Type"))
	if err != nil {
		t.Fatalf("parse top Content-Type: %v", err)
	}
	if mediaType != "multipart/mixed" {
		t.Fatalf("top media type = %q, want multipart/mixed", mediaType)
	}
	boundary := params["boundary"]
	if boundary == "" {
		t.Fatal("no boundary in Content-Type")
	}

	// Walk the parts.
	body := raw[strings.Index(raw, "\r\n\r\n")+4:]
	mr := multipart.NewReader(strings.NewReader(body), boundary)
	var sawHTML, sawPDF bool
	for {
		p, err := mr.NextPart()
		if err != nil {
			break
		}
		ct := p.Header.Get("Content-Type")
		switch {
		case strings.HasPrefix(ct, "text/html"):
			sawHTML = true
		case strings.HasPrefix(ct, "application/pdf"):
			sawPDF = true
			if disp := p.Header.Get("Content-Disposition"); !strings.Contains(disp, `filename="invoice.pdf"`) {
				t.Errorf("attachment disposition = %q", disp)
			}
			// Decode the base64 body back to the original PDF bytes.
			var sb strings.Builder
			buf := make([]byte, 1024)
			for {
				n, e := p.Read(buf)
				sb.Write(buf[:n])
				if e != nil {
					break
				}
			}
			decoded, e := base64.StdEncoding.DecodeString(strings.ReplaceAll(strings.TrimSpace(sb.String()), "\r\n", ""))
			if e != nil {
				t.Fatalf("decode attachment base64: %v", e)
			}
			if string(decoded) != string(pdf) {
				t.Errorf("attachment round-trip mismatch: got %q", decoded)
			}
		}
	}
	if !sawHTML {
		t.Error("no text/html part found")
	}
	if !sawPDF {
		t.Error("no application/pdf attachment part found")
	}
}

// TestSendUsesInjectedSender confirms Send composes a message and hands it to the
// injected sender (no real socket) when SMTP is configured.
func TestSendUsesInjectedSender(t *testing.T) {
	var gotTo []string
	var gotMsg []byte
	var gotFrom string
	fake := func(addr string, a smtp.Auth, from string, to []string, msg []byte) error {
		gotFrom, gotTo, gotMsg = from, to, msg
		return nil
	}
	m := NewWithSender(Config{Host: "smtp.test", Port: "587", From: "billing@gitstate.dev"}, fake)

	err := m.Send(context.Background(), []string{"owner@acme.test", " owner@acme.test ", ""},
		"Invoice", "<p>hi</p>", []Attachment{{Filename: "x.pdf", ContentType: "application/pdf", Data: []byte("%PDF-")}})
	if err != nil {
		t.Fatalf("Send: %v", err)
	}
	if gotFrom != "billing@gitstate.dev" {
		t.Errorf("from = %q", gotFrom)
	}
	// Duplicate + empty recipients should have been collapsed to one.
	if len(gotTo) != 1 || gotTo[0] != "owner@acme.test" {
		t.Errorf("recipients = %v, want [owner@acme.test]", gotTo)
	}
	if !strings.Contains(string(gotMsg), "multipart/mixed") {
		t.Error("composed message is not multipart/mixed")
	}
}

// TestSendNoOpWhenUnconfigured verifies the dev no-op: with no SMTP_HOST, Send
// returns nil and never calls the sender.
func TestSendNoOpWhenUnconfigured(t *testing.T) {
	called := false
	fake := func(addr string, a smtp.Auth, from string, to []string, msg []byte) error {
		called = true
		return nil
	}
	m := NewWithSender(Config{}, fake) // Host empty → not configured

	if err := m.Send(context.Background(), []string{"owner@acme.test"}, "Invoice", "<p>hi</p>", nil); err != nil {
		t.Fatalf("Send should no-op without error, got %v", err)
	}
	if called {
		t.Error("sender was called despite SMTP being unconfigured")
	}
}

// TestSendRejectsNoRecipients ensures an empty recipient list is an error.
func TestSendRejectsNoRecipients(t *testing.T) {
	m := NewWithSender(Config{Host: "smtp.test", From: "x@y.z"}, func(string, smtp.Auth, string, []string, []byte) error { return nil })
	if err := m.Send(context.Background(), []string{"  ", ""}, "s", "b", nil); err == nil {
		t.Error("expected error for empty recipients")
	}
}

// ── helpers ──────────────────────────────────────────────────────────────────

func headOf(raw string) string {
	if i := strings.Index(raw, "\r\n\r\n"); i >= 0 {
		return raw[:i]
	}
	return raw
}

func headerValue(raw, key string) string {
	head := headOf(raw)
	for _, line := range strings.Split(head, "\r\n") {
		if strings.HasPrefix(line, key+": ") {
			return strings.TrimPrefix(line, key+": ")
		}
	}
	return ""
}
