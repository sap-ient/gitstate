// Package invoicedelivery wires together the billing invoice, the org, the PDF
// renderer (internal/invoicepdf) and the SMTP mailer (internal/email) to deliver
// a finalized invoice to an org's owners.
//
// EmailInvoiceToOwners is the single entry point the billing scheduler calls
// after finalizing an invoice. It is deliberately decoupled from the billing
// lifecycle: it only reads the invoice + org + owners and sends mail, so it can
// be invoked from a scheduler, a webhook, or a manual "resend" action.
package invoicedelivery

import (
	"context"
	"fmt"
	"strings"

	"github.com/jackc/pgx/v5"

	"github.com/exo/gitstate/internal/config"
	"github.com/exo/gitstate/internal/db"
	"github.com/exo/gitstate/internal/email"
	"github.com/exo/gitstate/internal/invoicepdf"
	"github.com/exo/gitstate/internal/store"
)

// Mailer is the subset of *email.Mailer this package needs. It is an interface so
// the scheduler can inject a real mailer and tests can inject a fake.
type Mailer interface {
	Send(ctx context.Context, to []string, subject, htmlBody string, attachments []email.Attachment) error
}

// EmailInvoiceToOwners loads the billing invoice + its org, renders a branded PDF,
// resolves the org's owner email addresses, and emails them the invoice with the
// PDF attached. It is a no-op (returns nil) when the org has no owners with an
// email — there is nobody to bill.
//
// The mailer is read from the environment via email.New(); when SMTP is not
// configured the underlying Send is a logged no-op, so this never crashes in dev.
func EmailInvoiceToOwners(ctx context.Context, database *db.DB, cfg *config.Config, orgID, invoiceID string) error {
	return emailInvoice(ctx, database, cfg, orgID, invoiceID, email.New())
}

// emailInvoice is the testable core: it takes an explicit Mailer so tests can
// assert on the composed message without sending.
func emailInvoice(ctx context.Context, database *db.DB, cfg *config.Config, orgID, invoiceID string, mailer Mailer) error {
	var (
		inv    *store.Invoice
		lines  []store.InvoiceLine
		org    *store.Org
		owners []string
	)

	if err := database.WithOrg(ctx, orgID, func(tx pgx.Tx) error {
		i, ls, err := store.GetInvoice(ctx, tx, orgID, invoiceID)
		if err != nil {
			return fmt.Errorf("load invoice: %w", err)
		}
		inv, lines = i, ls

		o, err := store.GetOrg(ctx, tx, orgID)
		if err != nil {
			return fmt.Errorf("load org: %w", err)
		}
		org = o

		members, err := store.ListMembers(ctx, tx, orgID)
		if err != nil {
			return fmt.Errorf("list members: %w", err)
		}
		owners = ownerEmails(members)
		return nil
	}); err != nil {
		return fmt.Errorf("invoicedelivery: %w", err)
	}

	if len(owners) == 0 {
		// Nobody to bill — not an error; the scheduler keeps going.
		return nil
	}

	data := BuildInvoiceData(inv, lines, org, billingURL(cfg))
	pdfBytes, err := invoicepdf.Render(data)
	if err != nil {
		return fmt.Errorf("invoicedelivery: render pdf: %w", err)
	}

	subject := fmt.Sprintf("Your gitstate invoice %s", data.Number)
	htmlBody := renderEmailHTML(data)
	att := []email.Attachment{{
		Filename:    pdfFilename(data.Number),
		ContentType: "application/pdf",
		Data:        pdfBytes,
	}}

	if err := mailer.Send(ctx, owners, subject, htmlBody, att); err != nil {
		return fmt.Errorf("invoicedelivery: send: %w", err)
	}
	return nil
}

// BuildInvoiceData maps a billing store.Invoice (+ lines + org) onto the flat,
// renderer-ready invoicepdf.InvoiceData. Exported so the PDF endpoint can reuse
// the exact same mapping.
func BuildInvoiceData(inv *store.Invoice, lines []store.InvoiceLine, org *store.Org, appBillingURL string) invoicepdf.InvoiceData {
	d := invoicepdf.InvoiceData{
		Number:        inv.ID,
		Status:        inv.Status,
		SubtotalCents: inv.USDCents,
		FXRate:        inv.FXRate,
		ZARCents:      inv.ZARCents,
		PaystackRef:   inv.PaystackRef,
		AppBillingURL: appBillingURL,
	}
	if inv.IssuedAt != nil {
		d.IssueDate = *inv.IssuedAt
	}
	if inv.PeriodStart != nil {
		d.PeriodStart = *inv.PeriodStart
	}
	if inv.PeriodEnd != nil {
		d.PeriodEnd = *inv.PeriodEnd
	}
	if org != nil {
		d.OrgName = org.Name
	}
	for _, l := range lines {
		d.Lines = append(d.Lines, invoicepdf.LineItem{
			Description:    l.Description,
			AmountUSDCents: l.USDCents,
			Estimated:      l.IsEstimated,
		})
	}
	return d
}

// ownerEmails returns the de-duplicated, non-empty email addresses of org members
// whose role is "owner".
func ownerEmails(members []store.OrgMember) []string {
	seen := map[string]bool{}
	var out []string
	for _, m := range members {
		if m.Role != "owner" {
			continue
		}
		e := strings.TrimSpace(m.Email)
		if e == "" || seen[e] {
			continue
		}
		seen[e] = true
		out = append(out, e)
	}
	return out
}

// billingURL returns the app's billing page URL from PublicURL, if set.
func billingURL(cfg *config.Config) string {
	if cfg == nil {
		return ""
	}
	base := strings.TrimRight(cfg.App.PublicURL, "/")
	if base == "" {
		return ""
	}
	return base + "/billing"
}

// pdfFilename builds a tidy attachment filename from the invoice number/id.
func pdfFilename(number string) string {
	safe := strings.Map(func(r rune) rune {
		switch {
		case r >= 'a' && r <= 'z', r >= 'A' && r <= 'Z', r >= '0' && r <= '9', r == '-', r == '_':
			return r
		default:
			return '-'
		}
	}, number)
	if safe == "" {
		safe = "invoice"
	}
	return "gitstate-invoice-" + safe + ".pdf"
}
