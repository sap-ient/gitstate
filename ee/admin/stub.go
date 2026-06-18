//go:build !ee

// Package eeadmin is the Enterprise Edition super-admin package.
// This file is compiled when the `ee` build tag is NOT present; it provides
// no-op stubs so the rest of the codebase can reference the package without
// pulling in any EE implementation (decisions A7).
package eeadmin

import (
	"net/http"

	"github.com/exo/gitstate/internal/config"
	"github.com/exo/gitstate/internal/db"
)

// RegisterEEAdminRoutes is a no-op in non-EE builds.
// No routes are registered; the super-admin panel is not available without the `ee` build tag.
func RegisterEEAdminRoutes(mux *http.ServeMux, database *db.DB, cfg *config.Config) {}
