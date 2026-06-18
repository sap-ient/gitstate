package exchange

import (
	"context"
	"fmt"
	"log/slog"
	"math"
	"time"

	"github.com/exo/gitstate/internal/config"
	"github.com/exo/gitstate/internal/db"
	"github.com/exo/gitstate/internal/store"
)

const (
	defaultBase  = "USD"
	defaultQuote = "ZAR"
	// defaultTTL is used when cfg.Billing.Exchange.TTL is zero.
	defaultTTL = 1 * time.Hour
)

// ErrStaleRate is returned (alongside the rate) when the cached rate is older
// than TTL and the provider fetch also failed. Billing code must decide whether
// to proceed or abort. It is never returned when a fresh rate was retrieved.
type ErrStaleRate struct {
	Age      time.Duration
	TTL      time.Duration
	Provider string
	Cause    error
}

func (e *ErrStaleRate) Error() string {
	return fmt.Sprintf("exchange: stale rate (age %s > ttl %s, provider=%s): %v",
		e.Age.Round(time.Second), e.TTL, e.Provider, e.Cause)
}
func (e *ErrStaleRate) Unwrap() error { return e.Cause }

// Service caches USD↔ZAR rates in Postgres and refreshes them via a configured
// upstream provider. It is safe for concurrent use.
type Service struct {
	store    *store.ExchangeStore
	provider provider
	ttl      time.Duration
	cfg      *config.Config
}

// New creates a Service.  cfg.Billing.Exchange selects the provider and TTL.
// Recognised providers: "exchangerate-api" (default), "openexchangerates".
func New(database *db.DB, cfg *config.Config) *Service {
	ttl := cfg.Billing.Exchange.TTL
	if ttl <= 0 {
		ttl = defaultTTL
	}

	var p provider
	switch cfg.Billing.Exchange.Provider {
	case "openexchangerates":
		p = newOpenExchangeRates(cfg.Billing.Exchange.APIKey)
	default:
		// "exchangerate-api" is the default.
		p = newExchangeRateAPI(cfg.Billing.Exchange.APIKey)
	}

	return &Service{
		store:    store.NewExchangeStore(database.Pool()),
		provider: p,
		ttl:      ttl,
		cfg:      cfg,
	}
}

// Latest returns the freshest cached rate for (base, quote).
//
//   - If the cached rate is within TTL it is returned immediately (no network call).
//   - If the cached rate is stale (or absent), the provider is queried, the result
//     stored, and the fresh rate returned.
//   - If the provider fails and a cached (stale) rate exists, that rate is returned
//     together with an *ErrStaleRate warning so the caller can decide whether to
//     proceed. A warning is also logged.
//   - If the provider fails and there is no cache at all, a non-nil error is returned.
//
// rateID is the UUID of the exchange_rates row used; it should be stored on the
// invoice so the rate is auditable (decisions A8).
func (s *Service) Latest(ctx context.Context, base, quote string) (rate float64, rateID string, err error) {
	cached, err := s.store.LatestRate(ctx, base, quote)
	if err != nil {
		return 0, "", fmt.Errorf("exchange.Latest: %w", err)
	}

	// Cache hit within TTL — no network call needed.
	if cached.ID != "" && time.Since(cached.FetchedAt) < s.ttl {
		return cached.Rate, cached.ID, nil
	}

	// Fetch fresh rate from provider.
	fresh, fetchErr := s.provider.Fetch(ctx, base, quote)
	if fetchErr == nil {
		// Persist and return the fresh rate.
		id, insertErr := s.store.InsertRate(ctx, base, quote, fresh, s.provider.Name())
		if insertErr != nil {
			// Log but don't fail — we have a valid rate in hand.
			slog.WarnContext(ctx, "exchange: failed to cache rate",
				"base", base, "quote", quote,
				"provider", s.provider.Name(),
				"error", insertErr)
			// Return without a rateID (can't audit this one, but billing can continue).
			return fresh, "", nil
		}
		return fresh, id, nil
	}

	// Provider failed. Log a warning.
	slog.WarnContext(ctx, "exchange: provider fetch failed",
		"base", base, "quote", quote,
		"provider", s.provider.Name(),
		"error", fetchErr)

	// Fall back to cached rate if available (decisions A8: never hard-fail billing reads).
	if cached.ID != "" {
		age := time.Since(cached.FetchedAt)
		slog.WarnContext(ctx, "exchange: using stale cached rate",
			"base", base, "quote", quote,
			"rate", cached.Rate,
			"age", age.Round(time.Second),
			"ttl", s.ttl)
		return cached.Rate, cached.ID, &ErrStaleRate{
			Age:      age,
			TTL:      s.ttl,
			Provider: s.provider.Name(),
			Cause:    fetchErr,
		}
	}

	// No cache, no provider — hard failure.
	return 0, "", fmt.Errorf("exchange.Latest: provider error and no cached rate: %w", fetchErr)
}

// Convert converts usdCents to ZAR cents using the freshest available rate.
// It is a convenience wrapper around Latest(ctx, "USD", "ZAR").
// The returned rateID identifies the exchange_rates row used (for invoice FK).
// If the rate is stale, err will be *ErrStaleRate (non-nil); zarCents is still
// populated so callers can choose to proceed with a warning.
func (s *Service) Convert(ctx context.Context, usdCents int) (zarCents int, rateID string, err error) {
	rate, id, rateErr := s.Latest(ctx, defaultBase, defaultQuote)
	if rateErr != nil {
		// If it's a staleness warning we still have a valid rate; propagate the
		// stale error but also populate zarCents.
		if _, stale := rateErr.(*ErrStaleRate); stale && rate > 0 {
			zar := int(math.Round(float64(usdCents) * rate))
			return zar, id, rateErr
		}
		return 0, "", fmt.Errorf("exchange.Convert: %w", rateErr)
	}
	zar := int(math.Round(float64(usdCents) * rate))
	return zar, id, nil
}

// StartRefresher starts a background goroutine that proactively refreshes the
// USD→ZAR rate every cfg.Billing.Exchange.TTL so that the cache is always warm.
// The goroutine exits when ctx is cancelled.  Errors are logged but never fatal.
func (s *Service) StartRefresher(ctx context.Context) {
	interval := s.ttl
	if interval <= 0 {
		interval = defaultTTL
	}

	go func() {
		slog.InfoContext(ctx, "exchange: refresher started",
			"provider", s.provider.Name(),
			"interval", interval)

		// Prime immediately, then tick.
		s.refresh(ctx)

		ticker := time.NewTicker(interval)
		defer ticker.Stop()

		for {
			select {
			case <-ctx.Done():
				slog.InfoContext(ctx, "exchange: refresher stopped")
				return
			case <-ticker.C:
				s.refresh(ctx)
			}
		}
	}()
}

// refresh fetches a fresh USD→ZAR rate and stores it. Any error is logged.
func (s *Service) refresh(ctx context.Context) {
	rate, fetchErr := s.provider.Fetch(ctx, defaultBase, defaultQuote)
	if fetchErr != nil {
		slog.WarnContext(ctx, "exchange: background refresh failed",
			"provider", s.provider.Name(),
			"error", fetchErr)
		return
	}
	_, insertErr := s.store.InsertRate(ctx, defaultBase, defaultQuote, rate, s.provider.Name())
	if insertErr != nil {
		slog.WarnContext(ctx, "exchange: background refresh insert failed",
			"provider", s.provider.Name(),
			"error", insertErr)
		return
	}
	slog.InfoContext(ctx, "exchange: rate refreshed",
		"base", defaultBase, "quote", defaultQuote,
		"rate", rate,
		"provider", s.provider.Name())
}
