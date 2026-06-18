// cmd/billsim — gitstate billing viability simulator.
//
// Usage:
//
//	go run ./cmd/billsim [flags]
//
// Prints a profitability table across the plan ladder, then loops over
// three customer-base scenarios (100 / 1 000 / 10 000 orgs).
//
// Key assumptions:
//   - Steady-state model: churn is already baked into the active paid count.
//   - Free orgs incur 40% of paid LLM token usage (exploration, not full reports).
//   - Paystack fee applied per org per month on the ZAR charge.
//   - Enterprise ($0 listed) is excluded — custom deals, not in the funnel model.
//   - Break-even is per-variable-unit (pure variable cost model, no fixed overhead).
//
// Flags:
//
//	-orgs N          Total orgs to simulate (default 1000)
//	-conv N          Free→paid conversion % (default 8)
//	-churn N         Monthly paid churn % (default 3)
//	-fx N            USD→ZAR FX rate (default 18.5)
//	-llm-tokens N    Tokens per org per month — paid tier (default 200000)
//	-llm-cost N      LLM cost per 1M tokens USD blended input+output (default 5.0)
//	-scenarios       Run 100/1k/10k scenario sweep (default true)

package main

import (
	"flag"
	"fmt"
	"os"
	"text/tabwriter"
)

func main() {
	// --- Flags ---
	orgs := flag.Int("orgs", 1000, "total organisations to simulate")
	conv := flag.Float64("conv", 8.0, "free→paid conversion % (0–100)")
	churn := flag.Float64("churn", 3.0, "monthly paid churn % (0–100)")
	fx := flag.Float64("fx", 18.5, "USD→ZAR FX rate")
	llmTokens := flag.Float64("llm-tokens", 200_000, "tokens per org/month (paid tier)")
	llmCost := flag.Float64("llm-cost", 5.0, "LLM cost per 1M tokens USD (blended input+output)")
	scenarios := flag.Bool("scenarios", true, "run 100/1k/10k scenario sweep after main table")
	flag.Parse()

	// Build params with defaults.
	base := SimParams{
		TotalOrgs:  *orgs,
		ConvPct:    *conv,
		ChurnPctMo: *churn,

		FXRate:         *fx,
		PaystackPctFee: 2.9,  // Paystack standard rate
		PaystackFlat:   1.50, // ZAR flat fee per charge

		LLMTokensPerOrg:  *llmTokens,
		LLMCostPerMToken: *llmCost,

		// Hosting: fly.io + Neon + Tigris per org/month.
		// Free orgs: minimal — shared small instance, low DB usage.
		// Paid orgs: dedicated resources, more DB calls, storage.
		HostingFreeUSD: 0.40,
		HostingPaidUSD: 1.60,

		// Support cost per org/month.
		// Free: essentially zero (self-serve, community only).
		// Paid: ~$2/org blended across tiers (scales with plan complexity).
		SupportFreeUSD: 0.10,
		SupportPaidUSD: 2.00,

		// Background sync workers + GitHub/GitLab API quota (amortised).
		SyncComputeUSD: 0.30,

		// Paid plan distribution: Hobby, Pro, Team, Scale.
		// Assumption: top-of-funnel skews heavily Hobby; Pro is the sweet spot;
		// Team/Scale are small but high-value.
		//   Hobby 50% · Pro 35% · Team 10% · Scale 5%
		PaidMix: [4]float64{0.50, 0.35, 0.10, 0.05},
	}

	if *scenarios {
		for _, n := range []int{100, 1_000, 10_000} {
			p := base
			p.TotalOrgs = n
			r := Simulate(p)
			printTable(r, p, n)
			fmt.Println()
		}
	} else {
		r := Simulate(base)
		printTable(r, base, *orgs)
	}
}

// printTable renders the results using text/tabwriter.
func printTable(r SimResult, p SimParams, totalOrgs int) {
	w := tabwriter.NewWriter(os.Stdout, 0, 0, 2, ' ', 0)

	fmt.Fprintf(w, "\n=== gitstate Billing Viability — %d orgs (conv %.0f%% | churn %.0f%%/mo | FX %.2f | LLM $%.2f/1M tok) ===\n",
		totalOrgs, p.ConvPct, p.ChurnPctMo, p.FXRate, p.LLMCostPerMToken)
	fmt.Fprintln(w, "")

	// Header
	fmt.Fprintln(w, "Plan\tOrgs\tMRR USD\tMRR ZAR(gross)\tPaystack fees\tMRR ZAR(net)\tMRR USD(net)\tCOGS USD\tLLM COGS\tGross Margin\tContribution USD")
	fmt.Fprintln(w, "----\t----\t-------\t--------------\t-------------\t------------\t------------\t--------\t--------\t------------\t----------------")

	for _, pr := range r.Plans {
		uwFlag := ""
		if pr.Underwater {
			uwFlag = " ⚠ LLM>rev"
		}

		var marginStr string
		if pr.Plan.PriceUSD == 0 {
			marginStr = "  —"
		} else {
			marginStr = fmt.Sprintf("%+.1f%%", pr.GrossMargin)
			if pr.GrossMargin < 0 {
				marginStr += " ⚠"
			}
		}

		fmt.Fprintf(w, "%s%s\t%d\t$%.0f\tR%.0f\tR%.0f\tR%.0f\t$%.0f\t$%.0f\t$%.0f\t%s\t$%.0f\n",
			pr.Plan.Name,
			uwFlag,
			pr.Orgs,
			pr.MRR_USD,
			pr.MRR_ZAR_Gross,
			pr.PaystackFees,
			pr.MRR_ZAR_Net,
			pr.MRR_USD_Net,
			pr.COGS_USD,
			pr.LLMShare,
			marginStr,
			pr.Contribution,
		)
	}

	fmt.Fprintln(w, "----\t----\t-------\t--------------\t-------------\t------------\t------------\t--------\t--------\t------------\t----------------")

	overallContrib := r.TotalNetMRR - r.TotalCOGS
	fmt.Fprintf(w, "TOTAL\t%d\t$%.0f\t—\t—\t—\t$%.0f\t$%.0f\t—\t%+.1f%%\t$%.0f\n",
		r.TotalOrgs,
		r.TotalMRR,
		r.TotalNetMRR,
		r.TotalCOGS,
		r.GrossMargin,
		overallContrib,
	)

	w.Flush()

	// Summary notes
	fmt.Printf("\n  Gross MRR (USD):        $%.2f\n", r.TotalMRR)
	fmt.Printf("  Net MRR after FX+fees:  $%.2f\n", r.TotalNetMRR)
	fmt.Printf("  Total COGS:             $%.2f\n", r.TotalCOGS)
	fmt.Printf("  Gross margin:           %.1f%%\n", r.GrossMargin)
	if r.BreakEven > 0 {
		fmt.Printf("  Break-even paid orgs:   %d\n", r.BreakEven)
	} else {
		fmt.Printf("  Break-even:             ∞ (margin per org is negative — reduce LLM cost or raise price)\n")
	}

	// LLM warning summary
	for _, pr := range r.Plans {
		if pr.Underwater {
			fmt.Printf("  !! %s tier: LLM COGS ($%.2f) exceeds net revenue ($%.2f) — tier is LOSS-MAKING !!\n",
				pr.Plan.Name, pr.LLMShare/float64(max1(pr.Orgs)), pr.MRR_USD_Net/float64(max1(pr.Orgs)))
		}
	}
}

// max1 guards against div-by-zero when a tier has 0 orgs.
func max1(n int) int {
	if n < 1 {
		return 1
	}
	return n
}
