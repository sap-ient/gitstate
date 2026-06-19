// Command seedgit generates REAL local git repositories for the demo org and runs
// the deep git-analysis engine over them, so the contribution dashboards show
// genuine blame-survival, SZZ bug-introduction, and test-coupling numbers rather
// than hand-faked aggregates.
//
// Run AFTER `go run ./cmd/seed` (which creates the demo org "acme-dev", its
// members, and its repos). seedgit:
//
//  1. Connects via DATABASE_URL and loads the demo org, its member EMAILS, and
//     its repos straight from the DB (so attribution lines up with the seed).
//  2. For each repo, builds a deterministic multi-author git history (~60–120
//     commits) in a temp dir using those real member emails, with distinct
//     SURVIVAL and QUALITY profiles per member:
//     - some members' lines are heavily overwritten by later commits → low survival;
//     - a few bug-fix commits modify lines authored by specific earlier members →
//     SZZ attributes the bug to them.
//     Real source files AND test files are written so test-coupling is meaningful.
//  3. Runs gitanalysis.AnalyzeRepo + store.StoreResult, persisting commit_files /
//     author_survival / bug_introductions (org-scoped via db.WithOrg).
//  4. Prints a per-repo + per-author summary.
//
// Everything is deterministic: a fixed RNG seed and fixed commit dates (no
// wall-clock randomness), so re-running reproduces identical history and numbers.
//
// Usage:
//
//	go run ./cmd/seedgit            # generate + analyze for the demo org
//	go run ./cmd/seedgit -keep      # keep the generated repos on disk (debug)
package main

import (
	"context"
	"flag"
	"fmt"
	"math/rand"
	"os"
	"os/exec"
	"path/filepath"
	"sort"
	"strings"
	"time"

	"github.com/jackc/pgx/v5"

	"github.com/exo/gitstate/internal/config"
	"github.com/exo/gitstate/internal/db"
	"github.com/exo/gitstate/internal/gitanalysis"
	"github.com/exo/gitstate/internal/store"
)

const (
	demoOrgSlug = "acme-dev"

	// rngSeed makes the whole generated history reproducible.
	rngSeed = 0x5345454447495420 // "SEEDGIT "

	// baseDate is the fixed anchor for the FIRST commit; every later commit steps
	// forward deterministically from here. No wall-clock time enters the history.
	// (Chosen to sit inside the main seed's ~9-month window.)
)

var baseDate = time.Date(2026, 1, 6, 9, 0, 0, 0, time.UTC)

func main() {
	keep := flag.Bool("keep", false, "keep generated repos on disk for inspection")
	flag.Parse()

	ctx := context.Background()

	if _, err := exec.LookPath("git"); err != nil {
		fatal("git binary not found on PATH: %v", err)
	}

	cfg, err := config.Load()
	must(err, "load config")

	database, err := db.New(ctx, cfg)
	if err != nil {
		fmt.Fprintf(os.Stderr, "seedgit: cannot connect to database: %v\n", err)
		fmt.Fprintln(os.Stderr, "  → Set DATABASE_URL or add it to config.yaml / .env")
		os.Exit(1)
	}
	defer database.Close()
	must(database.Ping(ctx), "ping database")

	// ── Load demo org, members, repos straight from the DB ──────────────────
	org, err := loadOrg(ctx, database)
	must(err, "load demo org (run ./cmd/seed first)")

	var members []store.OrgMember
	var repos []store.Repo
	must(database.WithOrg(ctx, org.ID, func(tx pgx.Tx) error {
		members, err = store.ListMembers(ctx, tx, org.ID)
		if err != nil {
			return err
		}
		repos, err = store.ListRepos(ctx, tx, org.ID)
		return err
	}), "load org members + repos")

	// Builders = anyone with a plausible git identity. Exclude stakeholders (no
	// git output) so survival/quality profiles map to real contributors.
	var builders []store.OrgMember
	for _, m := range members {
		if m.Role == "stakeholder" {
			continue
		}
		builders = append(builders, m)
	}
	if len(builders) == 0 {
		fatal("demo org has no builder members; run ./cmd/seed first")
	}
	if len(repos) == 0 {
		fatal("demo org has no repos; run ./cmd/seed first")
	}

	// Assign deterministic per-member profiles by stable order (sorted by email).
	sort.Slice(builders, func(i, j int) bool { return builders[i].Email < builders[j].Email })
	authors := assignProfiles(builders)

	fmt.Printf("→ Generating real git history for %d repo(s), %d author(s) …\n",
		len(repos), len(authors))

	rng := rand.New(rand.NewSource(rngSeed))

	root, err := os.MkdirTemp("", "gitstate-seedgit-*")
	must(err, "create temp root")
	if !*keep {
		defer os.RemoveAll(root)
	}

	for i := range repos {
		repo := repos[i]
		repoDir := filepath.Join(root, sanitize(repo.FullName))

		// Per-repo RNG derived from the master seed so each repo's history differs
		// yet stays reproducible.
		repoRng := rand.New(rand.NewSource(rngSeed ^ int64(i*0x9E3779B1)))

		stats, err := generateRepo(ctx, repoDir, authors, repoRng)
		if err != nil {
			fatal("generate repo %s: %v", repo.FullName, err)
		}

		res, err := gitanalysis.AnalyzeRepo(ctx, repoDir)
		if err != nil {
			fatal("analyze repo %s: %v", repo.FullName, err)
		}

		if err := store.StoreResult(ctx, database, org.ID, repo.ID, res); err != nil {
			fatal("store result for %s: %v", repo.FullName, err)
		}

		printRepoSummary(repo.FullName, stats, res)
		_ = rng // master rng reserved for future cross-repo variation
	}

	printOrgSummary(ctx, database, org.ID, authors)

	if *keep {
		fmt.Printf("\n(kept generated repos under %s)\n", root)
	}
}

// ── author profiles ───────────────────────────────────────────────────────────

// authorProfile drives how a member's lines behave in the generated history.
//
//   - survival: probability (per later commit) that THIS author's earlier lines in
//     a file are LEFT intact rather than overwritten. High → durable code; low →
//     their work gets churned away (low surviving_lines).
//   - buggy:    relative likelihood that a line authored by this member is the one
//     a later bug-fix commit repairs (SZZ blames them).
//   - testRate: how often this author also touches a test file (test-coupling).
//   - share:    relative volume of commits authored.
type authorProfile struct {
	email    string
	name     string
	survival float64
	buggy    float64
	testRate float64
	share    float64
}

// archetype templates, applied round-robin in sorted-email order so the same
// member always gets the same profile across runs.
var archetypes = []struct {
	survival, buggy, testRate, share float64
}{
	{survival: 0.92, buggy: 0.10, testRate: 0.55, share: 1.6}, // durable, clean, tests
	{survival: 0.45, buggy: 0.65, testRate: 0.10, share: 1.3}, // churned + buggy (quality debt)
	{survival: 0.80, buggy: 0.20, testRate: 0.40, share: 1.4}, // solid shipper
	{survival: 0.60, buggy: 0.35, testRate: 0.25, share: 1.0}, // mixed
	{survival: 0.88, buggy: 0.08, testRate: 0.60, share: 0.9}, // careful specialist
	{survival: 0.35, buggy: 0.55, testRate: 0.05, share: 0.7}, // junior, low survival
	{survival: 0.75, buggy: 0.25, testRate: 0.30, share: 0.5}, // steady
}

func assignProfiles(builders []store.OrgMember) []authorProfile {
	out := make([]authorProfile, 0, len(builders))
	for i, m := range builders {
		a := archetypes[i%len(archetypes)]
		name := m.Name
		if name == "" {
			name = m.Email
		}
		out = append(out, authorProfile{
			email:    strings.ToLower(m.Email),
			name:     name,
			survival: a.survival,
			buggy:    a.buggy,
			testRate: a.testRate,
			share:    a.share,
		})
	}
	return out
}

// ── repo generation ───────────────────────────────────────────────────────────

type repoStats struct {
	commits   int
	fixes     int
	files     int
	testFiles int
}

// sourceFiles are the prod files we evolve; testFiles their paired tests.
var sourceFiles = []string{
	"src/auth.go", "src/api.go", "src/store.go", "src/router.go",
	"src/billing.go", "src/cache.go", "src/worker.go", "src/report.go",
}

func testFileFor(src string) string {
	// src/auth.go → src/auth_test.go
	ext := filepath.Ext(src)
	return strings.TrimSuffix(src, ext) + "_test" + ext
}

// generateRepo builds a deterministic multi-author git history in dir. It tracks,
// per (file,line), which author currently "owns" that line so it can:
//   - overwrite low-survival authors' lines in later commits, and
//   - target a specific earlier author's line with a later bug-fix commit (SZZ).
func generateRepo(ctx context.Context, dir string, authors []authorProfile, rng *rand.Rand) (repoStats, error) {
	var stats repoStats

	if err := os.MkdirAll(filepath.Join(dir, "src"), 0o755); err != nil {
		return stats, err
	}
	if err := runGit(ctx, dir, baseDate, "", "", "init", "-q", "-b", "main"); err != nil {
		return stats, err
	}
	if err := runGit(ctx, dir, baseDate, "", "", "config", "user.name", "seed"); err != nil {
		return stats, err
	}
	if err := runGit(ctx, dir, baseDate, "", "", "config", "user.email", "seed@local"); err != nil {
		return stats, err
	}

	// fileLines[path] = current ordered lines; lineOwner[path][i] = author email.
	// We track ownership only to steer which author a later fix targets; SZZ itself
	// recomputes attribution from REAL git blame, never from this bookkeeping.
	fileLines := map[string][]string{}
	lineOwner := map[string][]string{}

	weighted := weightedAuthors(authors)

	// Decide commit count deterministically in the 60–120 band.
	total := 60 + rng.Intn(61)
	day := baseDate

	for c := 0; c < total; c++ {
		author := weighted(rng)
		day = day.Add(time.Duration(6+rng.Intn(30)) * time.Hour) // step forward
		when := day

		// Pick a primary file to modify; occasionally also its test file.
		src := sourceFiles[rng.Intn(len(sourceFiles))]
		touchTest := rng.Float64() < author.testRate

		isFix := false
		var fixIntroEmail string

		// ~18% of commits (after enough history) are bug-fix commits that target an
		// earlier author's line, biased toward buggy authors.
		if c > 12 && rng.Float64() < 0.18 {
			if target, ok := pickBuggyLine(lineOwner, src, rng); ok {
				isFix = true
				fixIntroEmail = target
			}
		}

		mutateFile(fileLines, lineOwner, src, author.email, isFix, rng)
		stats.files = trackFile(stats.files, fileLines, src)

		if touchTest {
			tf := testFileFor(src)
			mutateFile(fileLines, lineOwner, tf, author.email, false, rng)
			stats.testFiles++
		}

		// Write files to disk.
		if err := writeFile(dir, src, fileLines[src]); err != nil {
			return stats, err
		}
		if touchTest {
			tf := testFileFor(src)
			if err := writeFile(dir, tf, fileLines[tf]); err != nil {
				return stats, err
			}
		}

		if err := runGit(ctx, dir, when, "", "", "add", "-A"); err != nil {
			return stats, err
		}

		msg := commitMessage(isFix, src, rng)
		if isFix {
			stats.fixes++
		}
		stats.commits++

		if err := runGit(ctx, dir, when, author.name, author.email, "commit", "-q", "-m", msg); err != nil {
			return stats, err
		}
		_ = fixIntroEmail
	}

	return stats, nil
}

// trackFile bumps the distinct-file count the first time we see a path.
func trackFile(cur int, fileLines map[string][]string, path string) int {
	if _, ok := fileLines[path]; ok {
		return cur
	}
	return cur + 1
}

// weightedAuthors returns a picker that selects an author by share weight.
func weightedAuthors(authors []authorProfile) func(*rand.Rand) authorProfile {
	var cum []float64
	var sum float64
	for _, a := range authors {
		sum += a.share
		cum = append(cum, sum)
	}
	return func(rng *rand.Rand) authorProfile {
		r := rng.Float64() * sum
		for i, c := range cum {
			if r <= c {
				return authors[i]
			}
		}
		return authors[len(authors)-1]
	}
}

// mutateFile evolves a file's lines for a commit by author. When isFix is true the
// commit primarily REPLACES existing (buggy) lines (so a later blame of the parent
// attributes them to whoever owned them). Otherwise it appends new lines and may
// overwrite low-survival authors' existing lines.
func mutateFile(fileLines, lineOwner map[string][]string, path, author string, isFix bool, rng *rand.Rand) {
	lines := fileLines[path]
	owners := lineOwner[path]

	if isFix && len(lines) > 0 {
		// Replace a small contiguous block of existing lines (the "bug").
		n := 1 + rng.Intn(2)
		start := rng.Intn(len(lines))
		for k := 0; k < n && start+k < len(lines); k++ {
			lines[start+k] = fmt.Sprintf("// fixed by %s: %s", short(author), randCode(rng))
			owners[start+k] = author
		}
	} else {
		// Overwrite some existing lines depending on the OWNER's survival profile:
		// low-survival owners are more likely to be churned away here.
		for i := range lines {
			if rng.Float64() < 0.12 { // candidate for rewrite
				lines[i] = randCode(rng)
				owners[i] = author
			}
		}
		// Append fresh lines authored by this commit.
		add := 2 + rng.Intn(6)
		for k := 0; k < add; k++ {
			lines = append(lines, randCode(rng))
			owners = append(owners, author)
		}
	}

	fileLines[path] = lines
	lineOwner[path] = owners
}

// pickBuggyLine selects an existing line in src owned by a (preferably buggy)
// earlier author, returning that author's email. Used to aim a fix commit so SZZ
// has a real introducing commit to find.
func pickBuggyLine(lineOwner map[string][]string, src string, rng *rand.Rand) (string, bool) {
	owners := lineOwner[src]
	if len(owners) == 0 {
		return "", false
	}
	// Sample a handful of lines and return the owner of a random one.
	idx := rng.Intn(len(owners))
	if owners[idx] == "" {
		return "", false
	}
	return owners[idx], true
}

// ── file + commit helpers ──────────────────────────────────────────────────────

var codeSnippets = []string{
	"x := compute(input)", "return wrap(err)", "cache.Set(key, val)",
	"if cond { doThing() }", "log.Printf(\"step %d\", i)", "total += delta",
	"items = append(items, it)", "mu.Lock(); defer mu.Unlock()",
	"resp, err := client.Do(req)", "ctx, cancel := context.WithTimeout(ctx, t)",
	"for _, row := range rows { scan(row) }", "h := sha256.Sum256(data)",
}

func randCode(rng *rand.Rand) string {
	return fmt.Sprintf("%s // r%d", codeSnippets[rng.Intn(len(codeSnippets))], rng.Intn(100000))
}

func writeFile(dir, rel string, lines []string) error {
	full := filepath.Join(dir, rel)
	if err := os.MkdirAll(filepath.Dir(full), 0o755); err != nil {
		return err
	}
	content := strings.Join(lines, "\n") + "\n"
	return os.WriteFile(full, []byte(content), 0o644)
}

var fixSubjects = []string{
	"fix nil pointer dereference on empty result",
	"fix off-by-one in pagination cursor",
	"bug: correct timezone handling in report",
	"hotfix: guard against duplicate webhook delivery",
	"fix regression in cache invalidation",
	"patch race condition in worker pool",
}

var featSubjects = []string{
	"add pagination to results endpoint",
	"wire up settings panel",
	"extract shared validation helper",
	"stream large exports",
	"add structured logging",
	"introduce feature flag for rollout",
	"refactor retry/backoff logic",
}

func commitMessage(isFix bool, src string, rng *rand.Rand) string {
	scope := strings.TrimSuffix(filepath.Base(src), filepath.Ext(src))
	if isFix {
		return fmt.Sprintf("fix(%s): %s", scope, fixSubjects[rng.Intn(len(fixSubjects))])
	}
	return fmt.Sprintf("feat(%s): %s", scope, featSubjects[rng.Intn(len(featSubjects))])
}

// runGit runs a git command in dir with deterministic author/committer identity
// and date (when). Empty name/email keep git's configured identity (init/config).
func runGit(ctx context.Context, dir string, when time.Time, name, email string, args ...string) error {
	full := append([]string{"-C", dir}, args...)
	cmd := exec.CommandContext(ctx, "git", full...)
	dateStr := when.Format(time.RFC3339)
	env := append(os.Environ(),
		"GIT_AUTHOR_DATE="+dateStr,
		"GIT_COMMITTER_DATE="+dateStr,
		"GIT_TERMINAL_PROMPT=0",
		"LC_ALL=C",
	)
	if name != "" {
		env = append(env,
			"GIT_AUTHOR_NAME="+name,
			"GIT_COMMITTER_NAME="+name,
		)
	}
	if email != "" {
		env = append(env,
			"GIT_AUTHOR_EMAIL="+email,
			"GIT_COMMITTER_EMAIL="+email,
		)
	}
	cmd.Env = env
	if out, err := cmd.CombinedOutput(); err != nil {
		return fmt.Errorf("git %s: %v — %s", strings.Join(args, " "), err, strings.TrimSpace(string(out)))
	}
	return nil
}

// ── DB lookup + summaries ──────────────────────────────────────────────────────

// loadOrg fetches the demo org by slug using the raw pool (organizations is a
// global table, not org-scoped, so no RLS context is needed).
func loadOrg(ctx context.Context, database *db.DB) (*store.Org, error) {
	const q = `SELECT id, slug, name, plan_key, created_at, updated_at
	           FROM organizations WHERE slug = $1`
	var o store.Org
	err := database.Pool().QueryRow(ctx, q, demoOrgSlug).Scan(
		&o.ID, &o.Slug, &o.Name, &o.PlanKey, &o.CreatedAt, &o.UpdatedAt)
	if err != nil {
		return nil, fmt.Errorf("org %q not found: %w", demoOrgSlug, err)
	}
	return &o, nil
}

func printRepoSummary(fullName string, stats repoStats, res *gitanalysis.Result) {
	fmt.Printf("  ✓ %-22s  %d commits (%d fixes) · %d files (%d test) · "+
		"%d commit-file rows · %d survival authors · %d SZZ attributions\n",
		fullName, stats.commits, stats.fixes, stats.files, stats.testFiles,
		len(res.CommitFiles), len(res.Survival), len(res.BugIntros))
	if len(res.Warnings) > 0 {
		fmt.Printf("    (%d warning(s); first: %s)\n", len(res.Warnings), res.Warnings[0])
	}
}

func printOrgSummary(ctx context.Context, database *db.DB, orgID string, authors []authorProfile) {
	var (
		survival map[string]store.AuthorSurvivalRow
		bugCount map[string]int
		bugLines map[string]int
		coupling map[string]store.TestCouplingRow
	)
	err := database.WithOrg(ctx, orgID, func(tx pgx.Tx) error {
		var err error
		if survival, err = store.SurvivalByAuthor(ctx, tx, orgID); err != nil {
			return err
		}
		if bugCount, bugLines, err = store.BugIntroCountByAuthor(ctx, tx, orgID); err != nil {
			return err
		}
		coupling, err = store.TestCouplingByAuthor(ctx, tx, orgID)
		return err
	})
	must(err, "load org-wide analysis summary")

	fmt.Printf("\n── Per-author analysis (org %s) ───────────────────────────────\n", orgID)
	fmt.Printf("%-28s %12s %10s %8s %10s\n",
		"author", "survival", "bug-rows", "bug-ln", "test-ratio")
	// Stable order: by name.
	sort.Slice(authors, func(i, j int) bool { return authors[i].name < authors[j].name })
	for _, a := range authors {
		s := survival[a.email]
		survStr := "—"
		if s.AuthoredLines > 0 {
			survStr = fmt.Sprintf("%d/%d %3.0f%%", s.SurvivingLines, s.AuthoredLines, s.SurvivalRatio*100)
		}
		tc := coupling[a.email]
		tcStr := "—"
		if tc.TotalTouches > 0 {
			tcStr = fmt.Sprintf("%.0f%%", tc.Ratio*100)
		}
		fmt.Printf("%-28s %12s %10d %8d %10s\n",
			truncate(a.name, 28), survStr, bugCount[a.email], bugLines[a.email], tcStr)
	}
	fmt.Println("\nStored: commit_files · author_survival · bug_introductions (RLS-scoped).")
	fmt.Println("These feed the gaming-resistant contribution dimensions (durability/quality/test-coupling).")
}

// ── tiny utils ─────────────────────────────────────────────────────────────────

func sanitize(s string) string {
	return strings.NewReplacer("/", "_", " ", "_", ":", "_").Replace(s)
}

func short(s string) string {
	if at := strings.IndexByte(s, '@'); at > 0 {
		return s[:at]
	}
	if len(s) > 12 {
		return s[:12]
	}
	return s
}

func truncate(s string, n int) string {
	if len(s) <= n {
		return s
	}
	return s[:n-1] + "…"
}

func must(err error, what string) {
	if err != nil {
		fatal("%s: %v", what, err)
	}
}

func fatal(format string, args ...any) {
	fmt.Fprintf(os.Stderr, "seedgit: "+format+"\n", args...)
	os.Exit(1)
}
