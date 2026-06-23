// internal/billing/quota.go — quota derivation + enforcement.
//
// QuotaService is the single source of truth for "can this org do X right now",
// enforced at BOTH the write path (real-time, closure #10) and the invoice
// boundary. It reads the org's plan features (max_repos, builders cap, byok_only,
// scale_to_zero, history_days) and current lifecycle state (billing_status,
// payment_method_on_file) and returns a clear allow/deny.
//
// Integrity closures owned here:
//   #1 Free-tier safe — free plan caps (max_repos:3, builders:2, history_days:90,
//      byok_only, scale_to_zero) are read from plan.Features and enforced.
//   #2 Managed-LLM exposure cap — CanUseManagedLLM gates managed LLM on allowance
//      UNLESS a valid auto-charge card is on file; past_due/suspended → BLOCKED.
//   #3 Overage needs a card — overage only "allowed" (uncapped) when a card is on file.
//   #10 Quota enforcement — Check(resource) is the helper write paths call.
package billing

import (
	"context"
	"errors"
	"fmt"

	"github.com/jackc/pgx/v5"

	"github.com/exo/gitstate/internal/config"
	"github.com/exo/gitstate/internal/db"
	"github.com/exo/gitstate/internal/store"
)

// Resource identifies a quota-checked action a write path is about to take.
type Resource string

const (
	// ResourceRepo — importing/connecting a new repo (counts against max_repos).
	ResourceRepo Resource = "repo"
	// ResourceBuilder — adding a billable builder (counts against the builders cap).
	ResourceBuilder Resource = "builder"
	// ResourceWrite — any state-mutating write/sync; blocked while suspended (#7).
	ResourceWrite Resource = "write"
)

// QuotaDecision is the result of a quota Check.
type QuotaDecision struct {
	Allowed bool
	// Reason is a human-readable denial reason (empty when allowed).
	Reason string
	// Limit / Current describe the cap that was hit (for the API error body).
	Limit   int
	Current int
	// HTTPStatus is the status a handler should return on denial: 402 for a
	// billing/upgrade-required limit, 403 for a suspended-org block.
	HTTPStatus int
}

// QuotaService derives + enforces plan quotas and lifecycle gates.
type QuotaService struct {
	db  *db.DB
	cfg *config.Config
	svc *Service
}

// NewQuotaService builds a QuotaService.
func NewQuotaService(database *db.DB, cfg *config.Config) *QuotaService {
	return &QuotaService{db: database, cfg: cfg, svc: New(database, cfg)}
}

// planFor resolves the org's effective plan (defaults to free when no subscription).
func (q *QuotaService) planFor(ctx context.Context, orgID string) (*store.Plan, *store.SubscriptionLifecycle, error) {
	planKey := "free"
	var life *store.SubscriptionLifecycle
	if err := q.db.WithOrg(ctx, orgID, func(tx pgx.Tx) error {
		l, e := store.GetSubscriptionLifecycle(ctx, tx, orgID)
		if errors.Is(e, store.ErrNotFound) {
			return nil // free plan, no row
		}
		if e != nil {
			return e
		}
		life = l
		planKey = l.PlanKey
		return nil
	}); err != nil {
		return nil, nil, fmt.Errorf("quota: load subscription: %w", err)
	}
	plan, err := q.svc.GetPlan(ctx, planKey)
	if err != nil {
		// Unknown plan_key → fall back to free so we still enforce SOMETHING.
		plan, err = q.svc.GetPlan(ctx, "free")
		if err != nil {
			return nil, nil, fmt.Errorf("quota: load plan: %w", err)
		}
	}
	return plan, life, nil
}

// featureInt reads an int feature from plan.Features (jsonb decodes numbers to
// float64). Returns (0,false) when absent. 0 conventionally means "unlimited".
func featureInt(features map[string]any, key string) (int, bool) {
	if features == nil {
		return 0, false
	}
	switch v := features[key].(type) {
	case float64:
		return int(v), true
	case int:
		return v, true
	default:
		return 0, false
	}
}

func featureBool(features map[string]any, key string) bool {
	if features == nil {
		return false
	}
	b, _ := features[key].(bool)
	return b
}

// suspended reports whether the org is currently suspended/canceled (writes blocked).
func suspended(life *store.SubscriptionLifecycle) bool {
	if life == nil {
		return false
	}
	return life.BillingStatus == store.BillingSuspended || life.BillingStatus == store.BillingCanceled
}

// Check enforces the quota for a resource the write path is about to consume
// (closure #10). It is the helper called from internal/api write handlers.
//
//	dec := quota.Check(ctx, orgID, billing.ResourceRepo)
//	if !dec.Allowed { http.Error(w, dec.Reason, dec.HTTPStatus); return }
func (q *QuotaService) Check(ctx context.Context, orgID string, resource Resource) (QuotaDecision, error) {
	plan, life, err := q.planFor(ctx, orgID)
	if err != nil {
		return QuotaDecision{}, err
	}

	// A suspended/canceled org may take NO mutating action (closure #7).
	if suspended(life) {
		return QuotaDecision{
			Allowed:    false,
			Reason:     "organization is suspended for non-payment; settle the outstanding invoice to restore access",
			HTTPStatus: 403,
		}, nil
	}

	switch resource {
	case ResourceRepo:
		max, ok := featureInt(plan.Features, "max_repos")
		if !ok || max <= 0 {
			return QuotaDecision{Allowed: true}, nil // unlimited
		}
		current, err := q.countRepos(ctx, orgID)
		if err != nil {
			return QuotaDecision{}, err
		}
		if current >= max {
			return QuotaDecision{
				Allowed:    false,
				Reason:     fmt.Sprintf("repo limit reached (%d/%d on the %s plan); upgrade to add more", current, max, plan.Key),
				Limit:      max,
				Current:    current,
				HTTPStatus: 402,
			}, nil
		}
		return QuotaDecision{Allowed: true, Limit: max, Current: current}, nil

	case ResourceBuilder:
		// plan.Builders is the cap (0 = unlimited).
		if plan.Builders <= 0 {
			return QuotaDecision{Allowed: true}, nil
		}
		current, err := q.countBuilders(ctx, orgID)
		if err != nil {
			return QuotaDecision{}, err
		}
		if current >= plan.Builders {
			return QuotaDecision{
				Allowed:    false,
				Reason:     fmt.Sprintf("builder limit reached (%d/%d on the %s plan); upgrade to add more builders", current, plan.Builders, plan.Key),
				Limit:      plan.Builders,
				Current:    current,
				HTTPStatus: 402,
			}, nil
		}
		return QuotaDecision{Allowed: true, Limit: plan.Builders, Current: current}, nil

	case ResourceWrite:
		// Already handled the suspended gate above; otherwise writes are fine.
		return QuotaDecision{Allowed: true}, nil

	default:
		return QuotaDecision{Allowed: true}, nil
	}
}

// CanUseManagedLLM is the gate the (later-phase) LLM path MUST call before serving
// a managed-LLM completion (closures #1/#2/#3).
//
// Returns (allowedCents, ok):
//   - ok=false  → managed LLM is BLOCKED entirely (BYOK-only plan, or the org is
//     past_due/suspended/canceled). The LLM path must refuse / fall back to BYOK.
//   - ok=true   → managed LLM is allowed. allowedCents is the SPEND CEILING for the
//     current period:
//       * card on file  → -1 (no cap; overage accrues at invoice time, closure #3),
//       * no card       → the remaining allowance (builders × included_llm_cents −
//         managed-LLM spend already incurred this period); 0 means the allowance is
//         exhausted and no further managed LLM may be served (closure #2).
//
// allowedCents == -1 is the sentinel for "uncapped (card on file)".
func (q *QuotaService) CanUseManagedLLM(ctx context.Context, orgID string) (allowedCents int, ok bool) {
	plan, life, err := q.planFor(ctx, orgID)
	if err != nil {
		return 0, false
	}

	// BYOK-only plans (free) never serve managed LLM (closure #1).
	if featureBool(plan.Features, "byok_only") {
		return 0, false
	}

	// past_due / suspended / canceled → managed LLM blocked (closure #2).
	if life != nil && life.BillingStatus != store.BillingActive {
		return 0, false
	}

	cardOnFile := life != nil && life.PaymentMethodOnFile
	if cardOnFile {
		return -1, true // uncapped; overage accrues (closure #3)
	}

	// No card → cap at the remaining managed-LLM allowance for the period (closure #2).
	builders, err := q.countBuilders(ctx, orgID)
	if err != nil {
		return 0, false
	}
	allowance := builders * plan.IncludedLLMCents

	spent, err := q.managedLLMSpentCents(ctx, orgID, life)
	if err != nil {
		return 0, false
	}
	remaining := allowance - spent
	if remaining < 0 {
		remaining = 0
	}
	return remaining, true
}

// ── counting helpers ──────────────────────────────────────────────────────────

func (q *QuotaService) countRepos(ctx context.Context, orgID string) (int, error) {
	var n int
	err := q.db.WithOrg(ctx, orgID, func(tx pgx.Tx) error {
		return tx.QueryRow(ctx, `SELECT COUNT(*) FROM repos WHERE org_id = $1`, orgID).Scan(&n)
	})
	if err != nil {
		return 0, fmt.Errorf("quota: count repos: %w", err)
	}
	return n, nil
}

// countBuilders counts billable builders (owner/admin/member; stakeholders free).
func (q *QuotaService) countBuilders(ctx context.Context, orgID string) (int, error) {
	var n int
	err := q.db.WithOrg(ctx, orgID, func(tx pgx.Tx) error {
		return tx.QueryRow(ctx,
			`SELECT COUNT(*) FROM org_members WHERE org_id = $1 AND role IN ('owner','admin','member')`,
			orgID).Scan(&n)
	})
	if err != nil {
		return 0, fmt.Errorf("quota: count builders: %w", err)
	}
	return n, nil
}

// managedLLMSpentCents sums managed-LLM provider cost (cents) for the current
// period [current_period_start, now). When no period window is set, falls back to
// all-time llm_tokens cost for the org.
func (q *QuotaService) managedLLMSpentCents(ctx context.Context, orgID string, life *store.SubscriptionLifecycle) (int, error) {
	var costUSD float64
	err := q.db.WithOrg(ctx, orgID, func(tx pgx.Tx) error {
		if life != nil && life.CurrentPeriodStart != nil {
			return tx.QueryRow(ctx,
				`SELECT COALESCE(SUM(cost_usd),0)::float8 FROM usage_events
				  WHERE org_id = $1 AND kind = 'llm_tokens' AND occurred_at >= $2`,
				orgID, *life.CurrentPeriodStart).Scan(&costUSD)
		}
		return tx.QueryRow(ctx,
			`SELECT COALESCE(SUM(cost_usd),0)::float8 FROM usage_events
			  WHERE org_id = $1 AND kind = 'llm_tokens'`, orgID).Scan(&costUSD)
	})
	if err != nil {
		return 0, fmt.Errorf("quota: sum managed-llm spend: %w", err)
	}
	// Round to cents.
	return int(costUSD*100 + 0.5), nil
}
