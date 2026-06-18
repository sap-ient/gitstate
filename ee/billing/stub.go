//go:build !ee

// Package eebilling is the Enterprise Edition billing package.
// This stub is compiled when the `ee` build tag is NOT set (default OSS build).
// It exposes the same public surface as the real implementation so the orchestrator
// can always call RegisterPaystackRoutes — it simply does nothing in OSS builds.
package eebilling

import (
	"net/http"

	"github.com/exo/gitstate/internal/config"
	"github.com/exo/gitstate/internal/db"
)

// RegisterPaystackRoutes is a no-op in the OSS build.
// The EE build (//go:build ee) provides the real implementation in paystack.go.
func RegisterPaystackRoutes(mux *http.ServeMux, database *db.DB, cfg *config.Config) {}
