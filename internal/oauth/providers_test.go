package oauth_test

import (
	"net/url"
	"strings"
	"testing"

	"github.com/exo/gitstate/internal/config"
	"github.com/exo/gitstate/internal/oauth"
)

// cfgWith builds a *config.Config with the requested providers enabled.
func cfgWith(google, microsoft bool) *config.Config {
	cfg := &config.Config{}
	if google {
		cfg.Auth.Providers.Google = config.GoogleConfig{
			ClientID: "g-id", ClientSecret: "g-secret", Enabled: true,
		}
	}
	if microsoft {
		cfg.Auth.Providers.Microsoft = config.MicrosoftConfig{
			ClientID: "m-id", ClientSecret: "m-secret", Enabled: true,
		}
	}
	return cfg
}

// TestLoadNoneEnabled verifies that with no providers enabled, Load returns an
// empty (but non-nil) map.
func TestLoadNoneEnabled(t *testing.T) {
	p := oauth.Load(cfgWith(false, false), "https://app.example.com")
	if len(p) != 0 {
		t.Errorf("expected 0 providers, got %d", len(p))
	}
}

// TestLoadOnlyConfiguredReturned verifies provider gating (decisions A6): only
// providers whose Enabled flag is set appear in the result.
func TestLoadOnlyConfiguredReturned(t *testing.T) {
	t.Run("google-only", func(t *testing.T) {
		p := oauth.Load(cfgWith(true, false), "https://app.example.com")
		if _, ok := p["google"]; !ok {
			t.Error("expected google provider")
		}
		if _, ok := p["microsoft"]; ok {
			t.Error("microsoft must not be present when disabled")
		}
	})
	t.Run("microsoft-only", func(t *testing.T) {
		p := oauth.Load(cfgWith(false, true), "https://app.example.com")
		if _, ok := p["microsoft"]; !ok {
			t.Error("expected microsoft provider")
		}
		if _, ok := p["google"]; ok {
			t.Error("google must not be present when disabled")
		}
	})
	t.Run("both", func(t *testing.T) {
		p := oauth.Load(cfgWith(true, true), "https://app.example.com")
		if len(p) != 2 {
			t.Errorf("expected 2 providers, got %d", len(p))
		}
	})
}

// TestAuthCodeURLShaping verifies the consent URL carries the redirect, client
// id, scopes, and the supplied state — for both providers.
func TestAuthCodeURLShaping(t *testing.T) {
	const public = "https://app.example.com"
	const state = "csrf-state-token-xyz"

	cases := []struct {
		name         string
		cfg          *config.Config
		key          string
		wantClientID string
		wantRedirect string
		wantScopes   []string
	}{
		{
			name:         "google",
			cfg:          cfgWith(true, false),
			key:          "google",
			wantClientID: "g-id",
			wantRedirect: public + "/auth/oauth/google/callback",
			wantScopes:   []string{"openid", "email", "profile"},
		},
		{
			name:         "microsoft",
			cfg:          cfgWith(false, true),
			key:          "microsoft",
			wantClientID: "m-id",
			wantRedirect: public + "/auth/oauth/microsoft/callback",
			wantScopes:   []string{"openid", "email", "profile", "User.Read"},
		},
	}

	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			provs := oauth.Load(tc.cfg, public)
			prov := provs[tc.key]
			if prov == nil {
				t.Fatalf("provider %s not loaded", tc.key)
			}
			raw := prov.AuthCodeURL(state)
			u, err := url.Parse(raw)
			if err != nil {
				t.Fatalf("parse auth url: %v", err)
			}
			q := u.Query()
			if q.Get("state") != state {
				t.Errorf("state = %q, want %q", q.Get("state"), state)
			}
			if q.Get("client_id") != tc.wantClientID {
				t.Errorf("client_id = %q, want %q", q.Get("client_id"), tc.wantClientID)
			}
			if q.Get("redirect_uri") != tc.wantRedirect {
				t.Errorf("redirect_uri = %q, want %q", q.Get("redirect_uri"), tc.wantRedirect)
			}
			if q.Get("response_type") != "code" {
				t.Errorf("response_type = %q, want code", q.Get("response_type"))
			}
			scope := q.Get("scope")
			for _, s := range tc.wantScopes {
				if !strings.Contains(scope, s) {
					t.Errorf("scope %q missing %q", scope, s)
				}
			}
		})
	}
}

// TestGenerateStateUniqueAndHex verifies state tokens are hex, non-empty, and do
// not repeat (CSRF protection relies on unpredictability).
func TestGenerateStateUniqueAndHex(t *testing.T) {
	seen := make(map[string]bool)
	for i := 0; i < 100; i++ {
		s, err := oauth.GenerateState()
		if err != nil {
			t.Fatalf("GenerateState: %v", err)
		}
		if len(s) != 32 { // 16 bytes hex-encoded
			t.Errorf("state len = %d, want 32 hex chars", len(s))
		}
		if seen[s] {
			t.Fatalf("duplicate state generated: %q", s)
		}
		seen[s] = true
	}
}
