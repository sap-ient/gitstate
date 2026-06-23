// internal/billing/start.go — the process entrypoint main.go wires.
package billing

import (
	"context"
	"fmt"
	"log/slog"

	"github.com/exo/gitstate/internal/config"
	"github.com/exo/gitstate/internal/db"
)

// unconfiguredCharger is the default Charger when no real payment gateway is wired
// (e.g. OSS build, or before the EE Paystack Charger is injected). It always fails
// the charge so an org with a real outstanding balance enters dunning rather than
// being silently marked paid. $0 invoices never reach the Charger (the scheduler
// short-circuits them), so free-tier orgs are unaffected.
type unconfiguredCharger struct{}

func (unconfiguredCharger) Charge(ctx context.Context, orgID, invoiceID string, usdCents int) (*ChargeResult, error) {
	return nil, fmt.Errorf("billing: no payment gateway configured (cannot charge invoice %s)", invoiceID)
}

// StartBillingScheduler builds a Scheduler with the production SystemClock-or-given
// clock and starts its hourly ticker loop. It is the single call main.go makes to
// turn on the billing LIFECYCLE.
//
// WIRING (main.go), after the DB pool is opened and BEFORE serving:
//
//	if database != nil && cfg.Billing.Enabled {
//	    billing.StartBillingScheduler(ctx, billing.SystemClock{}, database, cfg, nil)
//	}
//
// Pass clock = billing.SystemClock{} in production. charger may be nil → an
// unconfigured charger is used (real balances enter dunning; $0 invoices still
// settle). The EE Paystack Charger should be injected here once that gateway phase
// lands. The returned Scheduler is owned by the loop (closed on ctx cancel); the
// caller can ignore it.
func StartBillingScheduler(ctx context.Context, clock Clock, database *db.DB, cfg *config.Config, charger Charger) (*Scheduler, error) {
	if database == nil {
		return nil, fmt.Errorf("billing: StartBillingScheduler requires a non-nil db")
	}
	if clock == nil {
		clock = SystemClock{}
	}
	if charger == nil {
		charger = unconfiguredCharger{}
	}
	sch, err := NewScheduler(database, cfg, charger, clock)
	if err != nil {
		return nil, fmt.Errorf("billing: start scheduler: %w", err)
	}
	sch.StartLoop(ctx)
	slog.InfoContext(ctx, "billing scheduler started")
	return sch, nil
}
