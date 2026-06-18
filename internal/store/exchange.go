// Package store holds gitstate data-access queries (hand-written SQL, decisions A3).
// exchange.go: queries against the exchange_rates table (decisions A8).
package store

import (
	"context"
	"fmt"
	"time"

	"github.com/jackc/pgx/v5/pgxpool"
)

// ExchangeRate is a single row from the exchange_rates table.
type ExchangeRate struct {
	ID        string
	Base      string
	Quote     string
	Rate      float64
	Provider  string
	FetchedAt time.Time
}

// ExchangeStore provides queries against the exchange_rates table.
// It operates outside any org-scoped transaction because exchange rates are
// global (not org-scoped) — they bypass RLS.
type ExchangeStore struct {
	pool *pgxpool.Pool
}

// NewExchangeStore creates an ExchangeStore backed by pool.
func NewExchangeStore(pool *pgxpool.Pool) *ExchangeStore {
	return &ExchangeStore{pool: pool}
}

// InsertRate persists a freshly fetched rate and returns the new row ID.
func (s *ExchangeStore) InsertRate(ctx context.Context, base, quote string, rate float64, provider string) (string, error) {
	const q = `
		INSERT INTO exchange_rates (base, quote, rate, provider)
		VALUES ($1, $2, $3, $4)
		RETURNING id`

	var id string
	if err := s.pool.QueryRow(ctx, q, base, quote, rate, provider).Scan(&id); err != nil {
		return "", fmt.Errorf("store.exchange: insert rate: %w", err)
	}
	return id, nil
}

// LatestRate returns the most recently fetched rate for (base, quote).
// Returns a zero-value ExchangeRate and no error when no row exists yet.
func (s *ExchangeStore) LatestRate(ctx context.Context, base, quote string) (ExchangeRate, error) {
	const q = `
		SELECT id, base, quote, rate::float8, COALESCE(provider,''), fetched_at
		FROM exchange_rates
		WHERE base = $1 AND quote = $2
		ORDER BY fetched_at DESC
		LIMIT 1`

	var r ExchangeRate
	err := s.pool.QueryRow(ctx, q, base, quote).Scan(
		&r.ID, &r.Base, &r.Quote, &r.Rate, &r.Provider, &r.FetchedAt,
	)
	if err != nil {
		// pgx returns pgx.ErrNoRows for empty result — treat as "not cached yet".
		// We import via the error string to avoid adding a pgx import here.
		if err.Error() == "no rows in result set" {
			return ExchangeRate{}, nil
		}
		return ExchangeRate{}, fmt.Errorf("store.exchange: latest rate: %w", err)
	}
	return r, nil
}
