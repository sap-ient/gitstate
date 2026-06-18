// cmd/billsim/model.go — billing viability math for gitstate.
//
// Pricing model (from config.example.yaml + decisions.md):
//   Plans:  Free $0 · Hobby $9 · Pro $39 · Team $199 · Scale $249
//           Enterprise is custom — excluded from simulation.
//   Billing: USD prices; charged in ZAR at a captured FX rate.
//   Paystack fee: 2.9% of ZAR amount + ZAR 1.50 cap-flat per transaction.
//   Stakeholders: free (P6) — never counted toward seats or revenue.
//
// COGS per org/month:
//   - Hosting:   fly.io compute + Neon DB + Tigris storage; roughly ~$0.50/org on free, ~$1.50 on paid.
//   - LLM:       THE margin killer. Each org runs diff-difficulty sizing, status synthesis,
//                and NL→report. Modelled as tokens/org/month × $/token.
//                Defaults assume ~200k tokens/org/month (mixed input/output) at $3/$15 per 1M
//                (Claude Sonnet class). This is the primary tunable.
//   - Support:   ~$0.20/org on free (near-zero), ~$2 on paid plans.
//   - Sync/compute: GitHub/GitLab API + background workers, ~$0.30/org avg.

package main

// Plan defines a pricing tier.
type Plan struct {
	Key      string
	Name     string
	PriceUSD float64 // monthly price in USD (0 = free)
}

// DefaultPlans matches config.example.yaml (ent excluded — custom pricing).
var DefaultPlans = []Plan{
	{"free", "Free", 0},
	{"hobby", "Hobby", 9},
	{"pro", "Pro", 39},
	{"team", "Team", 199},
	{"scale", "Scale", 249},
}

// SimParams holds all tunable inputs. Sensible defaults are set in main.go via flags.
type SimParams struct {
	// Customer funnel
	TotalOrgs  int     // total organisations to simulate
	ConvPct    float64 // % of free-signups that convert to any paid plan (0–100)
	ChurnPctMo float64 // monthly churn % of paid orgs (0–100)

	// FX & payment processing
	FXRate        float64 // USD → ZAR spot rate (default 18.5)
	PaystackPctFee float64 // Paystack % fee on ZAR amount (default 2.9)
	PaystackFlat  float64 // Paystack flat fee per charge in ZAR (default 1.50)

	// LLM inference cost — THE margin variable
	// Assumption: each org uses a mix of diff-difficulty, status synthesis, NL→report.
	// Tokens are a blend of input (cheap) and output (expensive).
	// Default: 200 000 blended tokens/org/month at an effective $5/1M (Sonnet-class blend).
	LLMTokensPerOrg  float64 // tokens per org per month
	LLMCostPerMToken float64 // cost per 1 000 000 tokens in USD (blended input+output)

	// Hosting / infra per org per month (USD)
	// fly.io + Neon + Tigris. Free orgs cost less (dormant, smaller).
	HostingFreeUSD float64
	HostingPaidUSD float64

	// Support cost per org per month (USD)
	SupportFreeUSD float64
	SupportPaidUSD float64

	// Sync/compute cost per org per month (USD)
	// Background workers, GitHub/GitLab API quota amortised.
	SyncComputeUSD float64

	// Cohort distribution of paid plan mix (must sum to 1.0).
	// Index aligns with DefaultPlans[1:] → Hobby, Pro, Team, Scale.
	PaidMix [4]float64
}

// PlanResult holds computed metrics for one plan tier.
type PlanResult struct {
	Plan          Plan
	Orgs          int
	MRR_USD       float64 // gross MRR in USD
	MRR_ZAR_Gross float64 // MRR × FX
	PaystackFees  float64 // total Paystack fees (ZAR)
	MRR_ZAR_Net   float64 // ZAR net of Paystack fees
	MRR_USD_Net   float64 // ZAR net converted back to USD for margin calc
	COGS_USD      float64 // total COGS in USD
	GrossMargin   float64 // (MRR_USD_Net - COGS_USD) / MRR_USD_Net × 100; NaN for free
	Contribution  float64 // MRR_USD_Net - COGS_USD (can be negative)
	LLMShare      float64 // LLM portion of COGS_USD
	Underwater    bool    // true if LLM alone > revenue
}

// SimResult is the full simulation output.
type SimResult struct {
	Plans       []PlanResult
	TotalOrgs   int
	TotalMRR    float64 // gross USD MRR across all paid tiers
	TotalNetMRR float64 // USD net-of-fees
	TotalCOGS   float64 // USD
	GrossMargin float64 // %
	BreakEven   int     // orgs needed at current paid-mix to hit 0 margin
}

// llmCostPerOrg returns the monthly LLM cost in USD for one org.
func llmCostPerOrg(p SimParams) float64 {
	// tokens ÷ 1_000_000 × $/1M_tokens
	return (p.LLMTokensPerOrg / 1_000_000) * p.LLMCostPerMToken
}

// cogsPerOrg returns the total monthly COGS in USD for one org on a given plan.
// Free orgs still incur hosting + LLM (they drive inference too, just less activity).
// We halve token usage for free orgs (they explore, rarely run full reports).
func cogsPerOrg(p SimParams, isFree bool) (total, llmShare float64) {
	var hosting, support, llm float64
	if isFree {
		hosting = p.HostingFreeUSD
		support = p.SupportFreeUSD
		llm = llmCostPerOrg(p) * 0.4 // free orgs use ~40% of paid token budget
	} else {
		hosting = p.HostingPaidUSD
		support = p.SupportPaidUSD
		llm = llmCostPerOrg(p)
	}
	sync := p.SyncComputeUSD
	total = hosting + support + llm + sync
	llmShare = llm
	return
}

// paystackFee returns the ZAR fee for a single monthly charge.
// Paystack: 2.9% + flat cap. We also model the gross-up: the amount charged
// must cover the fee, but for simplicity we compute fee on the plan ZAR amount.
func paystackFee(zarAmount float64, pctFee, flatFee float64) float64 {
	if zarAmount <= 0 {
		return 0
	}
	return zarAmount*(pctFee/100) + flatFee
}

// Simulate runs the full model and returns per-plan + aggregate results.
func Simulate(p SimParams) SimResult {
	// Derive org counts.
	// Paid orgs = TotalOrgs × (ConvPct/100). Churn is steady-state: we model the
	// active monthly cohort AFTER churn has stabilised, i.e. we already bake in
	// churn by reducing the paid count: paidActive = conv × (1 - churn/100).
	// This is a steady-state model, not a time-series.
	convFrac := p.ConvPct / 100
	churnFrac := p.ChurnPctMo / 100
	paidOrgs := int(float64(p.TotalOrgs) * convFrac * (1 - churnFrac))
	freeOrgs := p.TotalOrgs - paidOrgs

	// Ensure paid mix sums to ~1.0 (caller's responsibility, but clamp).
	var mixSum float64
	for _, m := range p.PaidMix {
		mixSum += m
	}
	if mixSum <= 0 {
		mixSum = 1
	}

	// Plans: Free (index 0) + paid tiers (indices 1–4 → Hobby/Pro/Team/Scale).
	results := make([]PlanResult, len(DefaultPlans))

	// --- Free tier ---
	cogsFree, llmFree := cogsPerOrg(p, true)
	results[0] = PlanResult{
		Plan:         DefaultPlans[0],
		Orgs:         freeOrgs,
		MRR_USD:      0,
		COGS_USD:     cogsFree * float64(freeOrgs),
		LLMShare:     llmFree * float64(freeOrgs),
		GrossMargin:  0, // undefined; show as "-"
		Contribution: -(cogsFree * float64(freeOrgs)),
	}

	// --- Paid tiers ---
	var totalMRR, totalNetMRR, totalCOGS float64
	totalCOGS += results[0].COGS_USD // free tier COGS still counts

	for i, plan := range DefaultPlans[1:] {
		n := int(float64(paidOrgs) * (p.PaidMix[i] / mixSum))
		zarPrice := plan.PriceUSD * p.FXRate
		fee := paystackFee(zarPrice, p.PaystackPctFee, p.PaystackFlat)

		mrrUSD := plan.PriceUSD * float64(n)
		mrrZARGross := zarPrice * float64(n)
		totalFees := fee * float64(n)
		mrrZARNet := mrrZARGross - totalFees
		// Convert ZAR net back to USD for margin arithmetic.
		mrrUSDNet := mrrZARNet / p.FXRate

		cogs, llm := cogsPerOrg(p, false)
		cogsTotal := cogs * float64(n)
		llmTotal := llm * float64(n)
		contribution := mrrUSDNet - cogsTotal

		var grossMargin float64
		if mrrUSDNet > 0 {
			grossMargin = (contribution / mrrUSDNet) * 100
		}

		results[i+1] = PlanResult{
			Plan:          plan,
			Orgs:          n,
			MRR_USD:       mrrUSD,
			MRR_ZAR_Gross: mrrZARGross,
			PaystackFees:  totalFees,
			MRR_ZAR_Net:   mrrZARNet,
			MRR_USD_Net:   mrrUSDNet,
			COGS_USD:      cogsTotal,
			GrossMargin:   grossMargin,
			Contribution:  contribution,
			LLMShare:      llmTotal,
			// Flag tier underwater if LLM COGS alone exceeds net revenue.
			Underwater: llmTotal > mrrUSDNet,
		}

		totalMRR += mrrUSD
		totalNetMRR += mrrUSDNet
		totalCOGS += cogsTotal
	}

	var overallMargin float64
	if totalNetMRR > 0 {
		overallMargin = ((totalNetMRR - totalCOGS) / totalNetMRR) * 100
	}

	// Break-even: find N paid orgs at current mix where contribution = 0.
	// At break-even: totalNetMRR(N) == totalCOGS(N) + freeCOGS(constant).
	// freeCOGS scales with free orgs, which scale with totalOrgs. We hold the
	// free/paid ratio constant and solve for N paid orgs.
	//
	// Per paid org net revenue (blended across mix):
	var blendedRevenuePerPaid, blendedCOGSPerPaid float64
	for i, plan := range DefaultPlans[1:] {
		weight := p.PaidMix[i] / mixSum
		zarPrice := plan.PriceUSD * p.FXRate
		fee := paystackFee(zarPrice, p.PaystackPctFee, p.PaystackFlat)
		netUSD := (zarPrice - fee) / p.FXRate
		blendedRevenuePerPaid += weight * netUSD
		c, _ := cogsPerOrg(p, false)
		blendedCOGSPerPaid += weight * c
	}
	// freeCOGS per free org:
	freeCOGS, _ := cogsPerOrg(p, true)
	// Free orgs = paidOrgs × (freeRatio/paidRatio). With current params:
	// freeRatio = (1 - convFrac*(1-churnFrac)), paidRatio = convFrac*(1-churnFrac).
	paidFrac := convFrac * (1 - churnFrac)
	var freeToPaidRatio float64
	if paidFrac > 0 {
		freeToPaidRatio = (1 - paidFrac) / paidFrac
	}
	// Contribution per paid org (net of blended free drag):
	// contribution(N_paid) = N_paid*(rev - cogs_paid) - N_paid*freeToPaidRatio*freeCOGS = 0
	// N_paid*(rev - cogs_paid - freeToPaidRatio*freeCOGS) = 0
	// break-even when rev - cogs_paid - freeToPaidRatio*freeCOGS > 0 (else never profitable)
	marginPerPaid := blendedRevenuePerPaid - blendedCOGSPerPaid - (freeToPaidRatio * freeCOGS)
	breakEven := -1
	if marginPerPaid > 0 {
		// We need N_paid paid orgs to cover fixed = 0 (pure variable model).
		// Since it's purely variable, any N > 0 is profitable in this model.
		// But useful break-even: minimum paid orgs to produce $1 net positive.
		breakEven = int(1/marginPerPaid) + 1
		if breakEven < 1 {
			breakEven = 1
		}
	}

	return SimResult{
		Plans:       results,
		TotalOrgs:   p.TotalOrgs,
		TotalMRR:    totalMRR,
		TotalNetMRR: totalNetMRR,
		TotalCOGS:   totalCOGS,
		GrossMargin: overallMargin,
		BreakEven:   breakEven,
	}
}
