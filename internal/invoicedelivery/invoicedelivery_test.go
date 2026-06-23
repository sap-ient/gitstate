package invoicedelivery

import (
	"bytes"
	"context"
	"fmt"
	"os"
	"testing"
	"time"

	"github.com/jackc/pgx/v5"

	"github.com/exo/gitstate/internal/config"
	"github.com/exo/gitstate/internal/db"
	"github.com/exo/gitstate/internal/email"
	"github.com/exo/gitstate/internal/store"
)

// fakeMailer captures the arguments of the last Send instead of sending.
type fakeMailer struct {
	called  bool
	to      []string
	subject string
	html    string
	atts    []email.Attachment
}

func (f *fakeMailer) Send(_ context.Context, to []string, subject, html string, atts []email.Attachment) error {
	f.called = true
	f.to, f.subject, f.html, f.atts = to, subject, html, atts
	return nil
}

func testDB(t *testing.T) *db.DB {
	t.Helper()
	url := os.Getenv("DATABASE_URL")
	if url == "" {
		t.Skip("DATABASE_URL not set — skipping invoicedelivery integration test")
	}
	ctx, cancel := context.WithTimeout(context.Background(), 30*time.Second)
	defer cancel()
	database, err := db.New(ctx, &config.Config{Database: config.DatabaseConfig{URL: url}})
	if err != nil {
		t.Fatalf("db.New: %v", err)
	}
	t.Cleanup(database.Close)
	return database
}

// TestEmailInvoiceToOwnersResolvesOwners seeds an org with two owners, an admin,
// and a member, creates an invoice, and verifies EmailInvoiceToOwners (via its
// injectable core) mails ONLY the owners, with the rendered PDF attached.
func TestEmailInvoiceToOwnersResolvesOwners(t *testing.T) {
	database := testDB(t)
	ctx := context.Background()
	ns := time.Now().UnixNano()

	// Seed org.
	var orgID string
	if err := database.Pool().QueryRow(ctx,
		`INSERT INTO organizations (slug, name) VALUES ($1,$2) RETURNING id`,
		fmt.Sprintf("deliver-%d", ns), "Delivery Test Org").Scan(&orgID); err != nil {
		t.Fatalf("create org: %v", err)
	}
	defer func() {
		_, _ = database.Pool().Exec(context.Background(), `DELETE FROM organizations WHERE id=$1`, orgID)
	}()

	ownerA := fmt.Sprintf("owner-a-%d@ex.io", ns)
	ownerB := fmt.Sprintf("owner-b-%d@ex.io", ns)
	mkMember(t, ctx, database, orgID, "owner", ownerA)
	mkMember(t, ctx, database, orgID, "owner", ownerB)
	mkMember(t, ctx, database, orgID, "admin", fmt.Sprintf("admin-%d@ex.io", ns))
	mkMember(t, ctx, database, orgID, "member", fmt.Sprintf("member-%d@ex.io", ns))

	// Create a finalized invoice with lines + ZAR charge.
	var invID string
	if err := database.WithOrg(ctx, orgID, func(tx pgx.Tx) error {
		start := time.Date(2026, 5, 1, 0, 0, 0, 0, time.UTC)
		end := time.Date(2026, 5, 31, 0, 0, 0, 0, time.UTC)
		inv, e := store.CreateInvoice(ctx, tx, orgID, 7800, start, end)
		if e != nil {
			return e
		}
		invID = inv.ID
		if e := store.AddInvoiceLine(ctx, tx, inv.ID, "Builder seat: alice (owner)", 3900, map[string]any{}, false); e != nil {
			return e
		}
		return store.AddInvoiceLine(ctx, tx, inv.ID, "Builder seat: bob (admin)", 3900, map[string]any{}, false)
	}); err != nil {
		t.Fatalf("seed invoice: %v", err)
	}

	fm := &fakeMailer{}
	if err := emailInvoice(ctx, database, &config.Config{App: config.AppConfig{PublicURL: "https://app.gitstate.dev"}}, orgID, invID, fm); err != nil {
		t.Fatalf("emailInvoice: %v", err)
	}

	if !fm.called {
		t.Fatal("mailer was not called")
	}
	if got := toSet(fm.to); !got[ownerA] || !got[ownerB] || len(fm.to) != 2 {
		t.Fatalf("recipients = %v, want exactly the two owners (%s, %s)", fm.to, ownerA, ownerB)
	}
	if len(fm.atts) != 1 {
		t.Fatalf("attachments = %d, want 1", len(fm.atts))
	}
	if fm.atts[0].ContentType != "application/pdf" {
		t.Errorf("attachment content-type = %q", fm.atts[0].ContentType)
	}
	if !bytes.HasPrefix(fm.atts[0].Data, []byte("%PDF")) {
		t.Error("attachment is not a PDF")
	}
	if fm.subject == "" || fm.html == "" {
		t.Error("subject or html body is empty")
	}
}

// TestOwnerEmailsFilters checks the pure owner-filter (no DB).
func TestOwnerEmailsFilters(t *testing.T) {
	in := []store.OrgMember{
		{Email: "a@x.io", Role: "owner"},
		{Email: "b@x.io", Role: "admin"},
		{Email: "a@x.io", Role: "owner"}, // dup
		{Email: "", Role: "owner"},       // empty
		{Email: "c@x.io", Role: "owner"},
	}
	got := ownerEmails(in)
	if len(got) != 2 || got[0] != "a@x.io" || got[1] != "c@x.io" {
		t.Errorf("ownerEmails = %v, want [a@x.io c@x.io]", got)
	}
}

// ── helpers ──────────────────────────────────────────────────────────────────

func mkMember(t *testing.T, ctx context.Context, database *db.DB, orgID, role, userEmail string) {
	t.Helper()
	var uid string
	if err := database.Pool().QueryRow(ctx, `INSERT INTO users (email, name) VALUES ($1,$2) RETURNING id`, userEmail, role).Scan(&uid); err != nil {
		t.Fatalf("create user: %v", err)
	}
	if _, err := database.Pool().Exec(ctx, `INSERT INTO org_members (org_id, user_id, role) VALUES ($1,$2,$3)`, orgID, uid, role); err != nil {
		t.Fatalf("add member: %v", err)
	}
}

func toSet(ss []string) map[string]bool {
	m := map[string]bool{}
	for _, s := range ss {
		m[s] = true
	}
	return m
}
