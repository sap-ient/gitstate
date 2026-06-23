// Package invoicepdf renders a branded, print-friendly A4 PDF for a finalized
// billing invoice using github.com/go-pdf/fpdf.
//
// The renderer is intentionally self-contained and deterministic: it takes a
// flat InvoiceData value (all amounts/timestamps already resolved by the caller)
// and never reads the clock, the database, or the network. Given identical input
// it produces byte-identical output, which makes it trivial to test and cache.
//
// Branding: a teal "gitstate" wordmark + a thin teal→indigo gradient rule under
// the header (fpdf cannot gradient text, so the wordmark is a crisp vector/text
// mark — no raster logo is required and a missing logo never fails a render).
package invoicepdf

import (
	"bytes"
	"fmt"
	"time"

	"github.com/go-pdf/fpdf"
)

// Brand colors (RGB), matching the gitstate web theme.
var (
	brandTeal   = [3]int{45, 212, 191}  // #2DD4BF
	brandIndigo = [3]int{99, 102, 241}  // #6366F1
	inkColor    = [3]int{17, 24, 39}    // near-black body text
	mutedColor  = [3]int{100, 116, 139} // slate-500 secondary text
	faintColor  = [3]int{148, 163, 184} // slate-400 captions
	hairline    = [3]int{226, 232, 240} // slate-200 table rules
	zebraColor  = [3]int{248, 250, 252} // slate-50 row stripe
)

// LineItem is a single priced row on the invoice (a builder seat, a managed-LLM
// usage/overage line, etc.). AmountUSDCents is the USD amount for the line.
type LineItem struct {
	Description    string
	AmountUSDCents int
	Estimated      bool // surfaced with a "needs confirmation" marker
}

// InvoiceData is the complete, pre-resolved input to Render. The caller maps a
// store.Invoice (+ lines + org) onto this shape; the renderer adds no business
// logic and reads no ambient state.
type InvoiceData struct {
	// Identity / metadata.
	Number      string    // human invoice number (falls back to ID if empty)
	Status      string    // draft | open | paid | void
	IssueDate   time.Time // zero → omitted
	PeriodStart time.Time
	PeriodEnd   time.Time

	// Recipient.
	OrgName      string
	BillingEmail string

	// Money.
	Lines         []LineItem
	SubtotalCents int      // USD subtotal (sum of line amounts)
	FXRate        *float64 // locked USD→ZAR rate (nil when not yet charged)
	ZARCents      *int     // ZAR total actually charged (nil when not yet charged)

	// Payment / provenance.
	PaystackRef   string
	AppBillingURL string // optional link printed in the footer
}

// Render produces a finished A4 PDF for inv and returns its bytes. The result
// always begins with the "%PDF" magic. It returns an error only if fpdf itself
// fails to assemble the document.
func Render(inv InvoiceData) ([]byte, error) {
	pdf := fpdf.New("P", "mm", "A4", "")
	pdf.SetAutoPageBreak(true, 18)
	pdf.SetMargins(18, 16, 18)
	pdf.AddPage()

	header(pdf)
	metaBlock(pdf, inv)
	pdf.Ln(6)
	lineItemsTable(pdf, inv)
	totalsBlock(pdf, inv)
	footer(pdf, inv)

	var buf bytes.Buffer
	if err := pdf.Output(&buf); err != nil {
		return nil, fmt.Errorf("invoicepdf: render: %w", err)
	}
	return buf.Bytes(), nil
}

// ── Sections ─────────────────────────────────────────────────────────────────

// header draws the gitstate wordmark, tagline, and a thin teal→indigo gradient
// rule. No raster image is used, so a missing logo can never fail the render.
func header(pdf *fpdf.Fpdf) {
	x, y := pdf.GetX(), pdf.GetY()

	// Wordmark "gitstate" in teal.
	pdf.SetFont("Helvetica", "B", 26)
	setText(pdf, brandTeal)
	pdf.SetXY(x, y)
	pdf.CellFormat(60, 11, "gitstate", "", 0, "L", false, 0, "")

	// Tagline, right of the page, baseline-aligned under the mark.
	pdf.SetFont("Helvetica", "", 9)
	setText(pdf, mutedColor)
	pdf.SetXY(x, y+11)
	pdf.CellFormat(0, 5, "Git-native delivery tracking & invoicing", "", 1, "L", false, 0, "")

	// "INVOICE" label, right aligned on the wordmark row.
	pdf.SetFont("Helvetica", "B", 14)
	setText(pdf, faintColor)
	pdf.SetXY(x, y)
	pdf.CellFormat(0, 11, "INVOICE", "", 1, "R", false, 0, "")

	// Gradient rule: many thin vertical slices interpolating teal→indigo.
	pdf.Ln(4)
	gradientRule(pdf)
	pdf.Ln(6)
}

// gradientRule paints a 1.4mm-tall bar that fades from brand teal to brand
// indigo across the content width — a tasteful stand-in for a gradient mark.
func gradientRule(pdf *fpdf.Fpdf) {
	left, _, right, _ := pdf.GetMargins()
	pageW, _ := pdf.GetPageSize()
	width := pageW - left - right
	y := pdf.GetY()
	const slices = 120
	sliceW := width / slices
	for i := 0; i < slices; i++ {
		t := float64(i) / float64(slices-1)
		r := lerp(brandTeal[0], brandIndigo[0], t)
		g := lerp(brandTeal[1], brandIndigo[1], t)
		b := lerp(brandTeal[2], brandIndigo[2], t)
		pdf.SetFillColor(r, g, b)
		pdf.Rect(left+float64(i)*sliceW, y, sliceW+0.2, 1.4, "F")
	}
	pdf.SetY(y + 1.4)
}

// metaBlock prints invoice number/dates on the left and the bill-to org on the
// right.
func metaBlock(pdf *fpdf.Fpdf, inv InvoiceData) {
	startY := pdf.GetY()
	left, _, _, _ := pdf.GetMargins()
	pageW, _ := pdf.GetPageSize()
	colW := (pageW - left*2) / 2

	num := inv.Number
	if num == "" {
		num = "—"
	}

	// Left column: invoice meta.
	pdf.SetXY(left, startY)
	label(pdf, "Invoice number")
	value(pdf, num)
	if !inv.IssueDate.IsZero() {
		label(pdf, "Issue date")
		value(pdf, inv.IssueDate.Format("2 January 2006"))
	}
	if !inv.PeriodStart.IsZero() || !inv.PeriodEnd.IsZero() {
		label(pdf, "Billing period")
		value(pdf, periodLabel(inv.PeriodStart, inv.PeriodEnd))
	}
	leftEndY := pdf.GetY()

	// Right column: bill-to.
	pdf.SetXY(left+colW, startY)
	rightLabel(pdf, colW, "Billed to")
	rightValue(pdf, colW, fallback(inv.OrgName, "—"))
	if inv.BillingEmail != "" {
		rightValueMuted(pdf, colW, inv.BillingEmail)
	}
	rightLabel(pdf, colW, "Status")
	rightValue(pdf, colW, statusLabel(inv.Status))
	rightEndY := pdf.GetY()

	pdf.SetXY(left, maxF(leftEndY, rightEndY))
}

// lineItemsTable renders the priced lines with a header row and zebra striping.
func lineItemsTable(pdf *fpdf.Fpdf, inv InvoiceData) {
	left, _, _, _ := pdf.GetMargins()
	pageW, _ := pdf.GetPageSize()
	full := pageW - left*2
	amountW := 34.0
	descW := full - amountW

	// Header row.
	pdf.SetFont("Helvetica", "B", 8.5)
	pdf.SetFillColor(brandTeal[0], brandTeal[1], brandTeal[2])
	setText(pdf, [3]int{255, 255, 255})
	pdf.CellFormat(descW, 8, "  Description", "", 0, "L", true, 0, "")
	pdf.CellFormat(amountW, 8, "Amount (USD)  ", "", 1, "R", true, 0, "")

	pdf.SetFont("Helvetica", "", 9.5)
	if len(inv.Lines) == 0 {
		setText(pdf, faintColor)
		pdf.CellFormat(full, 9, "  No line items on this invoice.", "", 1, "L", false, 0, "")
	}
	for i, l := range inv.Lines {
		stripe := i%2 == 1
		if stripe {
			pdf.SetFillColor(zebraColor[0], zebraColor[1], zebraColor[2])
		}
		desc := "  " + l.Description
		if l.Estimated {
			desc += "  (needs confirmation)"
		}
		setText(pdf, inkColor)
		// Description (truncated by fpdf's cell clipping if very long).
		pdf.CellFormat(descW, 8, desc, "", 0, "L", stripe, 0, "")
		pdf.CellFormat(amountW, 8, usd(l.AmountUSDCents)+"  ", "", 1, "R", stripe, 0, "")
	}

	// Bottom hairline under the table.
	y := pdf.GetY()
	pdf.SetDrawColor(hairline[0], hairline[1], hairline[2])
	pdf.SetLineWidth(0.2)
	pdf.Line(left, y, left+full, y)
	pdf.Ln(2)
}

// totalsBlock prints the USD subtotal, the locked FX rate, and the ZAR total
// charged (when present) in a right-aligned summary.
func totalsBlock(pdf *fpdf.Fpdf, inv InvoiceData) {
	left, _, _, _ := pdf.GetMargins()
	pageW, _ := pdf.GetPageSize()
	full := pageW - left*2
	labelW := full - 60
	valW := 60.0

	row := func(lbl, val string, bold bool, color [3]int) {
		if bold {
			pdf.SetFont("Helvetica", "B", 10.5)
		} else {
			pdf.SetFont("Helvetica", "", 9.5)
		}
		setText(pdf, mutedColor)
		pdf.CellFormat(labelW, 7, lbl, "", 0, "R", false, 0, "")
		setText(pdf, color)
		pdf.CellFormat(valW, 7, val+"  ", "", 1, "R", false, 0, "")
	}

	pdf.Ln(2)
	row("Subtotal (USD)", usd(inv.SubtotalCents), false, inkColor)

	if inv.FXRate != nil {
		row(fmt.Sprintf("Locked FX rate (USD→ZAR)"), fmt.Sprintf("%.4f", *inv.FXRate), false, mutedColor)
	}

	// Emphasised grand total: ZAR charged when available, else USD subtotal.
	if inv.ZARCents != nil {
		// Thin separator above the grand total.
		y := pdf.GetY() + 1
		pdf.SetDrawColor(hairline[0], hairline[1], hairline[2])
		pdf.Line(left+labelW-20, y, left+full, y)
		pdf.Ln(2)
		row("Total charged (ZAR)", zar(*inv.ZARCents), true, brandIndigo)
	} else {
		y := pdf.GetY() + 1
		pdf.SetDrawColor(hairline[0], hairline[1], hairline[2])
		pdf.Line(left+labelW-20, y, left+full, y)
		pdf.Ln(2)
		row("Total due (USD)", usd(inv.SubtotalCents), true, brandIndigo)
	}
}

// footer prints the payment status, Paystack reference, app link, and a
// "Powered by gitstate" line near the bottom of the page.
func footer(pdf *fpdf.Fpdf, inv InvoiceData) {
	left, _, _, _ := pdf.GetMargins()
	pageW, pageH := pdf.GetPageSize()
	full := pageW - left*2

	// Position the footer block near the page bottom.
	pdf.SetY(pageH - 34)
	pdf.SetDrawColor(hairline[0], hairline[1], hairline[2])
	pdf.SetLineWidth(0.2)
	pdf.Line(left, pdf.GetY(), left+full, pdf.GetY())
	pdf.Ln(3)

	pdf.SetFont("Helvetica", "B", 9)
	setText(pdf, paymentColor(inv.Status))
	pdf.CellFormat(0, 5, paymentLine(inv.Status), "", 1, "L", false, 0, "")

	pdf.SetFont("Helvetica", "", 8)
	setText(pdf, mutedColor)
	if inv.PaystackRef != "" {
		pdf.CellFormat(0, 4.5, "Paystack reference: "+inv.PaystackRef, "", 1, "L", false, 0, "")
	}
	if inv.AppBillingURL != "" {
		pdf.CellFormat(0, 4.5, "Manage billing: "+inv.AppBillingURL, "", 1, "L", false, 0, "")
	}

	pdf.Ln(1)
	pdf.SetFont("Helvetica", "", 7.5)
	setText(pdf, faintColor)
	pdf.CellFormat(0, 4, "Powered by gitstate — every line backed by git.", "", 0, "L", false, 0, "")
}

// ── Small text helpers ───────────────────────────────────────────────────────

func label(pdf *fpdf.Fpdf, s string) {
	pdf.SetFont("Helvetica", "", 7.5)
	setText(pdf, faintColor)
	pdf.CellFormat(0, 4.5, s, "", 1, "L", false, 0, "")
}

func value(pdf *fpdf.Fpdf, s string) {
	pdf.SetFont("Helvetica", "B", 10)
	setText(pdf, inkColor)
	pdf.CellFormat(0, 5.5, s, "", 1, "L", false, 0, "")
	pdf.Ln(1.5)
}

func rightLabel(pdf *fpdf.Fpdf, w float64, s string) {
	left, _, _, _ := pdf.GetMargins()
	pageW, _ := pdf.GetPageSize()
	x := pageW - left - w
	pdf.SetX(x)
	pdf.SetFont("Helvetica", "", 7.5)
	setText(pdf, faintColor)
	pdf.CellFormat(w, 4.5, s, "", 1, "R", false, 0, "")
}

func rightValue(pdf *fpdf.Fpdf, w float64, s string) {
	left, _, _, _ := pdf.GetMargins()
	pageW, _ := pdf.GetPageSize()
	x := pageW - left - w
	pdf.SetX(x)
	pdf.SetFont("Helvetica", "B", 10)
	setText(pdf, inkColor)
	pdf.CellFormat(w, 5.5, s, "", 1, "R", false, 0, "")
	pdf.Ln(1.5)
}

func rightValueMuted(pdf *fpdf.Fpdf, w float64, s string) {
	left, _, _, _ := pdf.GetMargins()
	pageW, _ := pdf.GetPageSize()
	x := pageW - left - w
	pdf.SetX(x)
	pdf.SetFont("Helvetica", "", 8.5)
	setText(pdf, mutedColor)
	pdf.CellFormat(w, 4.5, s, "", 1, "R", false, 0, "")
	pdf.Ln(1.5)
}

func setText(pdf *fpdf.Fpdf, c [3]int) { pdf.SetTextColor(c[0], c[1], c[2]) }

// ── Formatting ───────────────────────────────────────────────────────────────

// usd formats integer cents as "$1,234.56".
func usd(cents int) string { return "$" + commaCents(cents) }

// zar formats integer cents as "R 1,234.56".
func zar(cents int) string { return "R " + commaCents(cents) }

// commaCents renders integer cents with thousands separators and two decimals.
func commaCents(cents int) string {
	neg := cents < 0
	if neg {
		cents = -cents
	}
	whole := cents / 100
	frac := cents % 100
	s := groupThousands(whole) + fmt.Sprintf(".%02d", frac)
	if neg {
		s = "-" + s
	}
	return s
}

// groupThousands inserts commas into a non-negative integer.
func groupThousands(n int) string {
	digits := fmt.Sprintf("%d", n)
	if len(digits) <= 3 {
		return digits
	}
	var out []byte
	lead := len(digits) % 3
	if lead > 0 {
		out = append(out, digits[:lead]...)
		if len(digits) > lead {
			out = append(out, ',')
		}
	}
	for i := lead; i < len(digits); i += 3 {
		out = append(out, digits[i:i+3]...)
		if i+3 < len(digits) {
			out = append(out, ',')
		}
	}
	return string(out)
}

func periodLabel(start, end time.Time) string {
	switch {
	case start.IsZero() && end.IsZero():
		return "—"
	case start.IsZero():
		return "through " + end.Format("2 Jan 2006")
	case end.IsZero():
		return "from " + start.Format("2 Jan 2006")
	default:
		return start.Format("2 Jan 2006") + " – " + end.Format("2 Jan 2006")
	}
}

func statusLabel(s string) string {
	switch s {
	case "paid":
		return "Paid"
	case "open":
		return "Open / due"
	case "void":
		return "Void"
	case "draft", "":
		return "Draft"
	default:
		return s
	}
}

// paymentLine is the prominent footer status line.
func paymentLine(status string) string {
	switch status {
	case "paid":
		return "PAID — thank you."
	case "void":
		return "VOID — this invoice has been cancelled."
	case "draft":
		return "DRAFT — not yet issued."
	default:
		return "PAYMENT DUE"
	}
}

func paymentColor(status string) [3]int {
	switch status {
	case "paid":
		return [3]int{22, 163, 74} // green
	case "void":
		return mutedColor
	default:
		return brandIndigo
	}
}

// ── numeric helpers ──────────────────────────────────────────────────────────

func lerp(a, b int, t float64) int {
	return int(float64(a) + (float64(b)-float64(a))*t)
}

func maxF(a, b float64) float64 {
	if a > b {
		return a
	}
	return b
}

func fallback(s, def string) string {
	if s == "" {
		return def
	}
	return s
}
