package invoicedelivery

import (
	"fmt"
	"html"
	"strings"

	"github.com/exo/gitstate/internal/invoicepdf"
)

// renderEmailHTML builds a clean, brand-styled HTML body for the invoice email.
// It mirrors the PDF: amount, period, due/paid status, and a link to the app
// billing page. All interpolated values are HTML-escaped.
func renderEmailHTML(d invoicepdf.InvoiceData) string {
	var b strings.Builder

	amount := usdString(d.SubtotalCents)
	if d.ZARCents != nil {
		amount = zarString(*d.ZARCents)
	}

	b.WriteString(`<!DOCTYPE html><html><body style="margin:0;background:#f1f5f9;font-family:Arial,Helvetica,sans-serif;color:#0f172a;">`)
	b.WriteString(`<div style="max-width:560px;margin:0 auto;padding:24px;">`)

	// Header / wordmark.
	b.WriteString(`<div style="padding:8px 0 16px;">`)
	b.WriteString(`<span style="font-size:22px;font-weight:bold;color:#2DD4BF;letter-spacing:-0.5px;">gitstate</span>`)
	b.WriteString(`<div style="height:3px;width:100%;margin-top:10px;background:linear-gradient(90deg,#2DD4BF,#6366F1);border-radius:2px;"></div>`)
	b.WriteString(`</div>`)

	// Card.
	b.WriteString(`<div style="background:#ffffff;border:1px solid #e2e8f0;border-radius:12px;padding:24px;">`)
	b.WriteString(`<p style="margin:0 0 4px;font-size:12px;text-transform:uppercase;letter-spacing:1px;color:#94a3b8;">Invoice ` + esc(d.Number) + `</p>`)
	fmt.Fprintf(&b, `<p style="margin:0 0 16px;font-size:28px;font-weight:bold;color:#0f172a;">%s</p>`, esc(amount))

	b.WriteString(`<table style="width:100%;font-size:14px;color:#475569;border-collapse:collapse;">`)
	row(&b, "Status", statusText(d.Status))
	if !d.PeriodStart.IsZero() || !d.PeriodEnd.IsZero() {
		row(&b, "Billing period", periodText(d))
	}
	if d.ZARCents != nil {
		row(&b, "Billed (USD)", usdString(d.SubtotalCents))
		if d.FXRate != nil {
			row(&b, "FX rate (USD→ZAR)", fmt.Sprintf("%.4f", *d.FXRate))
		}
	}
	b.WriteString(`</table>`)

	// CTA.
	if d.AppBillingURL != "" {
		fmt.Fprintf(&b, `<div style="margin-top:20px;"><a href="%s" style="display:inline-block;background:#6366F1;color:#ffffff;text-decoration:none;font-weight:bold;font-size:14px;padding:10px 18px;border-radius:8px;">View billing</a></div>`, esc(d.AppBillingURL))
	}
	b.WriteString(`</div>`) // card

	b.WriteString(`<p style="margin:16px 4px 0;font-size:13px;color:#64748b;">Your full invoice is attached as a PDF.</p>`)
	b.WriteString(`<p style="margin:18px 4px 0;font-size:11px;color:#94a3b8;">Powered by gitstate — every line backed by git.</p>`)

	b.WriteString(`</div></body></html>`)
	return b.String()
}

func row(b *strings.Builder, label, value string) {
	fmt.Fprintf(b, `<tr><td style="padding:6px 0;color:#94a3b8;">%s</td><td style="padding:6px 0;text-align:right;font-weight:bold;color:#0f172a;">%s</td></tr>`, esc(label), esc(value))
}

func statusText(s string) string {
	switch s {
	case "paid":
		return "Paid"
	case "void":
		return "Void"
	case "draft":
		return "Draft"
	default:
		return "Payment due"
	}
}

func periodText(d invoicepdf.InvoiceData) string {
	switch {
	case d.PeriodStart.IsZero():
		return "through " + d.PeriodEnd.Format("2 Jan 2006")
	case d.PeriodEnd.IsZero():
		return "from " + d.PeriodStart.Format("2 Jan 2006")
	default:
		return d.PeriodStart.Format("2 Jan 2006") + " – " + d.PeriodEnd.Format("2 Jan 2006")
	}
}

func usdString(cents int) string { return "$" + centsString(cents) }
func zarString(cents int) string { return "R " + centsString(cents) }

func centsString(cents int) string {
	neg := cents < 0
	if neg {
		cents = -cents
	}
	s := fmt.Sprintf("%d.%02d", cents/100, cents%100)
	if neg {
		s = "-" + s
	}
	return s
}

func esc(s string) string { return html.EscapeString(s) }
