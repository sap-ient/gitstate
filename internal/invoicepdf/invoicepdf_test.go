package invoicepdf

import (
	"bytes"
	"testing"
	"time"
)

// TestRenderProducesPDF verifies Render returns a non-empty buffer that begins
// with the %PDF magic, for a fully-populated (charged, paid) invoice.
func TestRenderProducesPDF(t *testing.T) {
	rate := 18.5421
	zar := 1_852_100 // R 18,521.00
	d := InvoiceData{
		Number:        "INV-2026-014",
		Status:        "paid",
		IssueDate:     time.Date(2026, 6, 1, 0, 0, 0, 0, time.UTC),
		PeriodStart:   time.Date(2026, 5, 1, 0, 0, 0, 0, time.UTC),
		PeriodEnd:     time.Date(2026, 5, 31, 0, 0, 0, 0, time.UTC),
		OrgName:       "Acme Robotics",
		BillingEmail:  "billing@acme.test",
		SubtotalCents: 100_000, // $1,000.00
		FXRate:        &rate,
		ZARCents:      &zar,
		PaystackRef:   "PSK_test_123",
		AppBillingURL: "https://app.gitstate.dev/billing",
		Lines: []LineItem{
			{Description: "Builder seat: alice@acme.test (owner)", AmountUSDCents: 39_00},
			{Description: "Builder seat: bob@acme.test (member)", AmountUSDCents: 39_00},
			{Description: "Managed LLM overage (2 builders × $5.00 allowance, ×1.30 markup)", AmountUSDCents: 22_00},
			{Description: "Adjustment (no git activity found)", AmountUSDCents: 0, Estimated: true},
		},
	}

	out, err := Render(d)
	if err != nil {
		t.Fatalf("Render: %v", err)
	}
	if len(out) == 0 {
		t.Fatal("Render returned an empty buffer")
	}
	if !bytes.HasPrefix(out, []byte("%PDF")) {
		t.Fatalf("output does not start with %%PDF magic; got %q", out[:min(8, len(out))])
	}
}

// TestRenderMinimalDraft covers the uncharged path (no FX rate / no ZAR / no
// issue date) so the totals + footer fall back to USD without panicking.
func TestRenderMinimalDraft(t *testing.T) {
	out, err := Render(InvoiceData{
		Number:        "INV-2026-001",
		Status:        "draft",
		OrgName:       "Solo Dev",
		SubtotalCents: 3900,
		Lines:         []LineItem{{Description: "Builder seat: solo@dev.test (owner)", AmountUSDCents: 3900}},
	})
	if err != nil {
		t.Fatalf("Render: %v", err)
	}
	if !bytes.HasPrefix(out, []byte("%PDF")) {
		t.Fatal("draft output does not start with %PDF magic")
	}
}

// TestRenderEmptyLines ensures an invoice with no line items still renders.
func TestRenderEmptyLines(t *testing.T) {
	out, err := Render(InvoiceData{Number: "INV-2026-099", Status: "open"})
	if err != nil {
		t.Fatalf("Render: %v", err)
	}
	if !bytes.HasPrefix(out, []byte("%PDF")) {
		t.Fatal("empty-lines output does not start with %PDF magic")
	}
}

// TestCommaCents checks the money formatter's grouping + decimals.
func TestCommaCents(t *testing.T) {
	cases := map[int]string{
		0:         "0.00",
		5:         "0.05",
		99:        "0.99",
		100:       "1.00",
		123456:    "1,234.56",
		100000000: "1,000,000.00",
		-2550:     "-25.50",
	}
	for in, want := range cases {
		if got := commaCents(in); got != want {
			t.Errorf("commaCents(%d) = %q, want %q", in, got, want)
		}
	}
}

func min(a, b int) int {
	if a < b {
		return a
	}
	return b
}
