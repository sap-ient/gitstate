# gitstate — Security Model

This document describes the security properties enforced by the gitstate platform and
the residual risks that must be addressed before a production deployment.

---

## 1. Multi-tenant Isolation — RLS Tenancy Boundary (S1)

**Mechanism.** Every org-scoped table (`repos`, `projects`, `issues`, `pull_requests`,
`commits`, …) has PostgreSQL Row-Level Security enabled with the policy:

```sql
CREATE POLICY org_isolation ON <table>
  USING  (org_id = current_org())
  WITH CHECK (org_id = current_org());
```

`current_org()` reads `current_setting('app.current_org', true)::uuid`. The setting
is injected by `db.WithOrg(ctx, orgID, fn)` which opens a transaction and executes
`SET LOCAL app.current_org = $1` before running `fn`. `SET LOCAL` is scoped to the
transaction so it cannot bleed across requests.

**Proof.** `internal/store/rls_test.go::TestRLSCrossOrgIsolation` creates two orgs and
one project each, then asserts that reading under org A's RLS context returns zero of
org B's rows. Run with a live database via `go test ./internal/store/ -run RLS`.

**Invariant.** No org-scoped query may run outside a `WithOrg` block. Application-level
bugs cannot produce cross-org reads because the database layer enforces isolation
independently.

---

## 2. Super-Admin Audit Path (S2)

**Mechanism.** Cross-org access is available only to super-admins via the EE admin
interface (`ee/admin`). Every cross-org operation must call `store.WriteAudit` before
performing work:

```go
store.WriteAudit(ctx, pool, actorID, orgID, "super_admin.view_org", orgID, meta)
```

`WriteAudit` writes to the `audit_log` table (platform table, not org-scoped, not
subject to RLS). The table records: `actor_id`, `org_id`, `action`, `target`, `meta`
(JSONB), and `created_at`.

**Principle.** Super-admin access is never ambient — there is no "god mode" session that
bypasses RLS silently. Each org touched generates an explicit audit entry.

---

## 3. Secret Hygiene — Env Only, Never Committed (S3)

**Mechanism.**
- All secrets (JWT signing key, Paystack API/webhook keys, OAuth client secrets,
  `TOKEN_ENC_KEY`) live in environment variables.
- `.env` / `.env.dev` are listed in `.gitignore` and are never committed.
- `.env.example` documents every variable with safe placeholder values.
- `config.yaml` (committed) holds only non-secret structure and flags; it contains no
  credentials.

**Relevant env vars:**

| Variable | Purpose |
|---|---|
| `DATABASE_URL` | Neon/Postgres connection string |
| `JWT_SIGNING_KEY` | HS256 access token signing key |
| `PAYSTACK_SECRET_KEY` | Paystack API key (EE only) |
| `PAYSTACK_WEBHOOK_SECRET` | Paystack webhook HMAC key (EE only) |
| `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` | Google OAuth (optional) |
| `MICROSOFT_CLIENT_ID` / `MICROSOFT_CLIENT_SECRET` | Microsoft OAuth (optional) |
| `TOKEN_ENC_KEY` | AES-256-GCM key material for at-rest repo token encryption |
| `ANTHROPIC_API_KEY` | LLM provider key (optional) |

---

## 4. Webhook Verification (S4)

**Mechanism.** Paystack webhook events are verified in `ee/billing/paystack.go` using
HMAC-SHA512 over the raw request body, compared constant-time against the
`X-Paystack-Signature` header. Requests that fail verification are rejected with 401
before any processing occurs.

**Idempotency.** Processed event IDs are stored in `paystack_events`; duplicate deliveries
are detected and no-opped, preventing double-charges.

---

## 5. Rate Limiting (F3)

**Mechanism.** `internal/middleware/RateLimit(perMin int)` provides a token-bucket rate
limiter per client IP (in-memory, mutex-guarded, periodic idle-bucket cleanup).

- General API routes: configure a reasonable limit (e.g. 120 req/min) in the router.
- Authentication endpoints (`/auth/login`, `/auth/signup`, `/auth/refresh`): use
  `middleware.AuthRateLimit()` (10 req/min) to slow brute-force credential attacks.

**Note.** The current implementation is in-process. For multi-region fly.io deployments
(multiple VMs) replace with a shared Redis-backed rate limiter so limits are enforced
globally, not per-instance.

---

## 6. At-Rest Token Encryption (F3/W3)

**Background.** Repo access tokens (GitHub/GitLab PATs) were previously not persisted
(PROGRESS.md W3 note). They are now optionally stored in `repos.token_encrypted` (bytea,
added by migration `20260618_003_repo_tokens.sql`) using AES-256-GCM.

**Mechanism (`internal/crypto`).**
- Key derived from `TOKEN_ENC_KEY` env var via SHA-256 → 32-byte AES key.
- `Encrypt(plaintext, key)` → nonce (12 bytes) || ciphertext+GCM tag.
- `Decrypt(ciphertext, key)` → plaintext (authenticated; tampered bytes return an error).
- Pure stdlib: `crypto/aes`, `crypto/cipher`, `crypto/rand`, `crypto/sha256`.

**Store layer.** `store.SetRepoToken` / `store.GetRepoToken` persist / retrieve the raw
encrypted bytes inside an org-scoped transaction (RLS enforced). Encryption/decryption
is the caller's responsibility (separation of concerns: the store does not know about keys).

---

## 7. Residual TODOs (open items before hardened production)

- [ ] **Multi-region rate limiting** — replace in-memory limiter with Redis-backed store
      when running more than one fly.io VM.
- [ ] **`TOKEN_ENC_KEY` rotation** — implement ciphertext re-encryption procedure when the
      key must be rotated (current implementation is single-key; no key version header).
- [ ] **RLS on `audit_log`** — currently unscoped (intentional for super-admin). Consider
      a read policy limiting non-super-admins to their own org's rows.
- [ ] **Super-admin authentication hardening** — add MFA requirement and short-lived
      session tokens for super-admin sessions in `ee/admin`.
- [ ] **Content-Security-Policy header** — add CSP, X-Frame-Options, and related headers
      in the middleware chain for the admin HTML pages.
- [ ] **Dependency audit** — run `govulncheck ./...` as a CI step; pin all Go module
      checksums in `go.sum`.
- [ ] **Webhook replay window** — add a timestamp check on Paystack webhook events to
      reject replayed events older than N minutes.
- [ ] **Org invite token entropy** — confirm invite token length is ≥ 128 bits of entropy
      before the feature is exposed in production.
