package cogs

// project.go — the PROJECTED COGS side of the dashboard and the reconciliation
// against actuals + MRR.
//
// The projection constants are re-derived inline from cmd/billsim/model.go
// (package main, not importable). Per its documented per-org/per-builder values:
//
//	InfraPaidBaseUSD = 0.45  // Neon $0.20 + Fly fleet share $0.15 + Tigris $0.02 + headroom
//	InfraPerBuilder  = 0.07  // per-builder sync CPU + DB activity + git-cache volume
//	InfraFreeUSD     = 0.05  // dormant free org (Neon autosuspend + storage share)
//	LLMVolumeDiscount= 0.65  // we pay ~65% of the charged/list LLM rate
//
// We additionally split the $0.45 paid base into its named components so the
// projection can attribute spend to Fly vs Neon vs Tigris and line them up
// against the actual Fly/Neon bills.

const (
	infraPaidBaseUSD = 0.45 // per paid org, all infra
	infraPerBuilder  = 0.07 // per billable builder
	infraFreeUSD     = 0.05 // per dormant free org
	llmVolumeDiscount = 0.65

	// Named split of the $0.45 paid base (from the model.go comment).
	neonPerPaidUSD   = 0.20 // Neon compute+storage share per paid org
	flyPerPaidUSD    = 0.15 // Fly fleet share per paid org
	tigrisPerPaidUSD = 0.02 // Tigris object storage per paid org
	// remaining 0.08 of the $0.45 is unattributed headroom.
	headroomPerPaidUSD = infraPaidBaseUSD - neonPerPaidUSD - flyPerPaidUSD - tigrisPerPaidUSD
)

// ProjectionInput is the LIVE instance counts the projection is computed from.
// Derive these from store.GetAdminStats + plan distribution on the admin pool.
type ProjectionInput struct {
	PaidOrgs   int
	FreeOrgs   int
	Builders   int     // total billable builders across paid orgs
	LLMUsageUSD float64 // managed-LLM provider usage at list/charge rate (before discount); 0 if unknown
}

// Projection is the breakdown of projected month-to-date COGS.
type Projection struct {
	FlyProjected  float64 // Fly fleet share (paid orgs + headroom-on-Fly is folded into Other)
	NeonProjected float64 // Neon share across paid + free orgs
	Tigris        float64 // Tigris object storage
	Builders      float64 // per-builder infra cost
	Headroom      float64 // unattributed paid-base headroom + free-org drag
	LLM           float64 // our discounted managed-LLM cost
	Total         float64
}

// Projected computes the billsim-projection COGS from live counts.
func Projected(in ProjectionInput) Projection {
	paid := float64(in.PaidOrgs)
	free := float64(in.FreeOrgs)
	builders := float64(in.Builders)

	fly := paid * flyPerPaidUSD
	// Neon serves both paid orgs and dormant free orgs (free org infra is almost
	// entirely Neon autosuspend + storage).
	neon := paid*neonPerPaidUSD + free*infraFreeUSD
	tigris := paid * tigrisPerPaidUSD
	perBuilder := builders * infraPerBuilder
	headroom := paid * headroomPerPaidUSD

	llm := in.LLMUsageUSD * llmVolumeDiscount

	p := Projection{
		FlyProjected:  fly,
		NeonProjected: neon,
		Tigris:        tigris,
		Builders:      perBuilder,
		Headroom:      headroom,
		LLM:           llm,
	}
	p.Total = fly + neon + tigris + perBuilder + headroom + llm
	return p
}

// Reconciliation compares actual spend to the projection and MRR.
type Reconciliation struct {
	ActualUSD      float64
	ProjectedUSD   float64
	VarianceUSD    float64 // actual − projected
	VariancePct    float64 // variance as % of projected (0 when projected==0)
	MRRUSD         float64
	GrossMarginPct float64 // (MRR − actual) / MRR × 100
	WithinModel    bool    // actual ≤ projected × withinModelFactor
}

// withinModelFactor is the tolerance band: actuals up to 20% over projection are
// still considered "tracking the model".
const withinModelFactor = 1.2

// Reconcile produces the variance, gross-margin, and within-model verdict.
func Reconcile(actual, projected, mrr float64) Reconciliation {
	r := Reconciliation{
		ActualUSD:    actual,
		ProjectedUSD: projected,
		VarianceUSD:  actual - projected,
		MRRUSD:       mrr,
	}
	if projected > 0 {
		r.VariancePct = (r.VarianceUSD / projected) * 100
		r.WithinModel = actual <= projected*withinModelFactor
	} else {
		// No projected cost: within-model iff there's no actual cost either.
		r.WithinModel = actual == 0
	}
	if mrr > 0 {
		r.GrossMarginPct = ((mrr - actual) / mrr) * 100
	}
	return r
}
