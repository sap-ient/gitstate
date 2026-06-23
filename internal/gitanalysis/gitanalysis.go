// Package gitanalysis is gitstate's deep git-analysis engine: the part that makes
// contribution scoring genuinely gaming-resistant by looking at git REALITY rather
// than self-reported activity. It shells out to the system `git` binary (no git
// library dependency) and computes three signals that are hard to fake:
//
//   - BLAME-SURVIVAL — for every line that still exists at HEAD, who authored it?
//     "surviving_lines" is durability: churning out code that gets immediately
//     overwritten earns nothing; code that survives is real, lasting contribution.
//
//   - SZZ BUG-INTRODUCTION — for every bug-fix commit, blame the *pre-fix* version
//     of the lines it deleted/changed back to the commit that introduced them. The
//     introducing author "owns" the bug. This is the SZZ algorithm (Śliwerski,
//     Zimmermann, Zeller). It is the quality signal: who ships bugs others fix.
//
//   - TEST-COUPLING — per (commit,file) we record whether the path is a test file,
//     so the contribution engine can compute a tested-vs-total touches ratio per
//     author (do you ship tests alongside code?).
//
// Everything here is DEFENSIVE: empty repos, detached HEAD, binary/huge files,
// non-UTF8 content, fixes with no parent, renamed files — none of these may panic.
// On any per-item failure we log a warning and return partial results. We also
// cap the amount of work (files blamed, fixes traced) so a pathological repo can't
// hang the analysis.
//
// No source code is ever stored — only aggregates (line counts, attributions).
// Tokens passed to CloneAndAnalyze live only in the clone URL and are never logged.
package gitanalysis

import (
	"bufio"
	"bytes"
	"context"
	"fmt"
	"log"
	"os"
	"os/exec"
	"path/filepath"
	"regexp"
	"strconv"
	"strings"
	"time"
)

// ── Tunables (bound the work so a huge repo can't hang us) ───────────────────

const (
	// gitTimeout caps any single non-network git invocation.
	gitTimeout = 90 * time.Second

	// cloneTimeout caps the network clone in CloneAndAnalyze.
	cloneTimeout = 8 * time.Minute

	// maxBlameFiles caps how many tracked files we run blame on for survival.
	// Large monorepos can have tens of thousands of files; blame is the expensive
	// step, so we cap it and log when we hit the ceiling.
	maxBlameFiles = 4000

	// maxBlameBytes skips blame on files larger than this (likely generated/data).
	maxBlameBytes = 2 << 20 // 2 MiB

	// maxFixCommits caps how many bug-fix commits we run SZZ on.
	maxFixCommits = 1500

	// maxFilesPerFix caps how many files within a single fix we trace (a giant
	// "fix" touching hundreds of files is almost never a real single-bug fix).
	maxFilesPerFix = 40

	// maxScanScreen caps the git-log scan for commit_files; -1 means unbounded.
	// We keep it generous; the heavy cost is blame/SZZ, not log parsing.
	maxLogCommits = 50000
)

// ── Result types ─────────────────────────────────────────────────────────────

// CommitFile is one (commit, file) churn record with test detection.
type CommitFile struct {
	CommitSHA   string
	AuthorEmail string
	Path        string
	Additions   int
	Deletions   int
	IsTest      bool
	CommittedAt time.Time
}

// AuthorSurvival is per-author blame durability at HEAD.
//   - SurvivingLines: lines authored by this email still present at HEAD.
//   - AuthoredLines:  total additions this email ever made (from numstat) — the
//     denominator for a survival RATIO.
type AuthorSurvival struct {
	AuthorEmail    string
	SurvivingLines int
	AuthoredLines  int
}

// BugIntroduction is one SZZ attribution: a (introduced_sha, fix_sha) pair with a
// line count, blaming AuthorEmail for the lines a later fix had to repair.
type BugIntroduction struct {
	AuthorEmail   string
	IntroducedSHA string
	FixSHA        string
	Lines         int
}

// Result is the aggregate output of AnalyzeRepo. All slices may be empty (never
// nil-vs-non-nil is significant); callers should treat empty as "nothing found".
type Result struct {
	// HeadSHA is the resolved HEAD commit ("" for an empty repo).
	HeadSHA string

	// CommitFiles is every (commit,file) churn row (test-coupling fuel).
	CommitFiles []CommitFile

	// Survival is per-author blame-survival at HEAD.
	Survival []AuthorSurvival

	// BugIntros is the SZZ attributions (one per introduced_sha × fix_sha).
	BugIntros []BugIntroduction

	// Warnings collects non-fatal problems (skipped files, parse hiccups) so the
	// caller can surface them; analysis still returns partial results.
	Warnings []string
}

// ── Public entry points ──────────────────────────────────────────────────────

// AnalyzeRepo runs the full analysis on an already-present local clone at dir.
// It never returns a nil Result on success; on a totally empty/broken repo it
// returns an empty Result with warnings rather than an error. A non-nil error is
// reserved for the case where `git` itself is missing or dir is not a repo.
func AnalyzeRepo(ctx context.Context, dir string) (*Result, error) {
	res := &Result{}

	if _, err := exec.LookPath("git"); err != nil {
		return nil, fmt.Errorf("gitanalysis: git binary not found: %w", err)
	}

	// Confirm dir is a git work tree; otherwise this is a hard error.
	if out, err := runGit(ctx, dir, "rev-parse", "--is-inside-work-tree"); err != nil ||
		strings.TrimSpace(out) != "true" {
		return nil, fmt.Errorf("gitanalysis: %q is not a git work tree: %w", dir, err)
	}

	// Resolve HEAD. An empty repo (no commits) is valid → return empty result.
	head, err := runGit(ctx, dir, "rev-parse", "HEAD")
	if err != nil {
		res.warnf("no commits at HEAD (empty/unborn branch); returning empty result: %v", err)
		return res, nil
	}
	res.HeadSHA = strings.TrimSpace(head)

	// 1) Commit-file churn + per-author authored-line totals.
	authored := res.collectCommitFiles(ctx, dir)

	// 2) Blame-survival at HEAD.
	res.collectSurvival(ctx, dir, authored)

	// 3) SZZ bug-introduction tracing.
	res.collectSZZ(ctx, dir)

	return res, nil
}

// CloneAndAnalyze clones url (optionally with an embedded token) into a temp dir,
// runs AnalyzeRepo, then removes the temp dir. The token is carried only inside
// the clone URL and is NEVER logged — error messages are scrubbed of the URL.
//
// token may be empty (public repo). When present it is injected as the userinfo
// of an https URL (https://x-access-token:TOKEN@host/...). Non-https URLs are
// cloned as-is (token ignored) since we can't safely embed it.
func CloneAndAnalyze(ctx context.Context, url, token string) (*Result, error) {
	if _, err := exec.LookPath("git"); err != nil {
		return nil, fmt.Errorf("gitanalysis: git binary not found: %w", err)
	}

	tmp, err := os.MkdirTemp("", "gitstate-analyze-*")
	if err != nil {
		return nil, fmt.Errorf("gitanalysis: create temp dir: %w", err)
	}
	defer func() {
		if rmErr := os.RemoveAll(tmp); rmErr != nil {
			log.Printf("gitanalysis: warning: cleanup temp dir failed: %v", rmErr)
		}
	}()

	cloneURL := injectToken(url, token)

	cloneCtx, cancel := context.WithTimeout(ctx, cloneTimeout)
	defer cancel()

	// Full clone (no --depth): blame-survival and SZZ need real history.
	cmd := exec.CommandContext(cloneCtx, "git", "clone", "--no-tags", cloneURL, tmp)
	var stderr bytes.Buffer
	cmd.Stderr = &stderr
	if err := cmd.Run(); err != nil {
		// Scrub: never echo the token-bearing URL or git's stderr (which may
		// contain it). Report only the public host for context.
		return nil, fmt.Errorf("gitanalysis: clone %s failed: %w", scrubURL(url), err)
	}

	return AnalyzeRepo(ctx, tmp)
}

// ── Stage 1: commit files + authored-line totals ─────────────────────────────

// testPathRE matches common test-file conventions across ecosystems. Conservative:
// false negatives (a test we miss) are safer than false positives (counting prod
// code as a test).
var testPathRE = regexp.MustCompile(
	`(?i)` +
		// directory-based: /test/ /tests/ /__tests__/ /spec/ /testdata/
		`(^|/)(tests?|__tests__|spec|specs|testdata)(/|$)` +
		`|` +
		// Go: foo_test.go
		`_test\.go$` +
		`|` +
		// JS/TS: foo.test.js foo.spec.tsx
		`\.(test|spec)\.[jt]sx?$` +
		`|` +
		// Python: test_foo.py foo_test.py
		`(^|/)test_[^/]+\.py$|_test\.py$` +
		`|` +
		// Java/Kotlin/Scala/C#: FooTest.java FooTests.cs TestFoo.kt
		`(^|/)[A-Z][A-Za-z0-9]*Tests?\.(java|kt|scala|cs)$` +
		`|(^|/)Test[A-Z][A-Za-z0-9]*\.(java|kt|scala|cs)$` +
		`|` +
		// Ruby: foo_spec.rb foo_test.rb
		`_(spec|test)\.rb$`,
)

// IsTestPath reports whether a repo-relative path looks like a test file.
func IsTestPath(path string) bool {
	return testPathRE.MatchString(path)
}

// commitFileRecord is the streamed log sentinel. We use a custom record format so
// commit metadata and the per-file numstat lines arrive together.
const logSentinel = "\x1e" // ASCII record separator, can't appear in messages

// collectCommitFiles streams `git log --numstat` and fills res.CommitFiles, while
// tallying per-author total additions (the survival denominator). Returns the
// authored-line map so the survival stage can reuse it.
func (res *Result) collectCommitFiles(ctx context.Context, dir string) map[string]int {
	authored := map[string]int{} // lower(email) → total additions ever

	// One field line per commit then the numstat block. %x1e separates commits.
	// Fields: sha, author email, unix time.
	format := logSentinel + "%H%x00%aE%x00%at"
	out, err := runGitBig(ctx, dir,
		"log", "HEAD",
		"--no-merges",
		"--no-renames",
		"--numstat",
		"-M", // detect renames as add/del (kept simple; --no-renames above wins for path)
		"--format="+format,
	)
	if err != nil {
		res.warnf("git log --numstat failed; commit_files will be empty: %v", err)
		return authored
	}

	sc := bufio.NewScanner(strings.NewReader(out))
	sc.Buffer(make([]byte, 1<<20), 16<<20)

	var (
		curSHA, curEmail string
		curAt            time.Time
		commits          int
	)
	for sc.Scan() {
		line := sc.Text()
		if strings.HasPrefix(line, logSentinel) {
			// New commit header.
			commits++
			if commits > maxLogCommits {
				res.warnf("log scan hit cap of %d commits; truncating", maxLogCommits)
				break
			}
			fields := strings.Split(strings.TrimPrefix(line, logSentinel), "\x00")
			curSHA, curEmail, curAt = "", "", time.Time{}
			if len(fields) >= 1 {
				curSHA = fields[0]
			}
			if len(fields) >= 2 {
				curEmail = normEmail(fields[1])
			}
			if len(fields) >= 3 {
				if ts, perr := strconv.ParseInt(fields[2], 10, 64); perr == nil {
					curAt = time.Unix(ts, 0).UTC()
				}
			}
			continue
		}
		if line == "" || curSHA == "" {
			continue
		}
		// numstat line: <add>\t<del>\t<path>  (binary files report "-").
		parts := strings.SplitN(line, "\t", 3)
		if len(parts) != 3 {
			continue
		}
		add := parseStatNum(parts[0])
		del := parseStatNum(parts[1])
		path := cleanRenamePath(parts[2])
		if path == "" {
			continue
		}
		res.CommitFiles = append(res.CommitFiles, CommitFile{
			CommitSHA:   curSHA,
			AuthorEmail: curEmail,
			Path:        path,
			Additions:   add,
			Deletions:   del,
			IsTest:      IsTestPath(path),
			CommittedAt: curAt,
		})
		if curEmail != "" {
			authored[curEmail] += add
		}
	}
	if err := sc.Err(); err != nil {
		res.warnf("scanning git log output: %v", err)
	}
	return authored
}

// ── Stage 2: blame-survival ──────────────────────────────────────────────────

// collectSurvival lists tracked files at HEAD and, for each (within caps), runs
// `git blame --line-porcelain` to count surviving lines per author. The authored
// map (from stage 1) supplies the per-author authored-line denominator.
func (res *Result) collectSurvival(ctx context.Context, dir string, authored map[string]int) {
	filesOut, err := runGitBig(ctx, dir, "ls-tree", "-r", "--name-only", "-z", "HEAD")
	if err != nil {
		res.warnf("git ls-tree failed; survival will use authored totals only: %v", err)
	}

	surviving := map[string]int{} // lower(email) → surviving lines at HEAD

	var files []string
	for _, f := range strings.Split(filesOut, "\x00") {
		if f != "" {
			files = append(files, f)
		}
	}

	scanned := 0
	for _, path := range files {
		if scanned >= maxBlameFiles {
			res.warnf("blame hit file cap of %d; survival counts are partial", maxBlameFiles)
			break
		}
		// Skip obviously-binary or oversized files (blame is meaningless/expensive).
		if skipForBlame(ctx, dir, path) {
			continue
		}
		counts, berr := blameSurvivingLines(ctx, dir, path)
		if berr != nil {
			res.warnf("blame %s skipped: %v", path, berr)
			continue
		}
		for email, n := range counts {
			surviving[email] += n
		}
		scanned++
	}

	// Merge surviving + authored into per-author rows. Union of both key sets so an
	// author whose every line was overwritten still shows survivingLines=0.
	seen := map[string]bool{}
	for email, n := range surviving {
		res.Survival = append(res.Survival, AuthorSurvival{
			AuthorEmail:    email,
			SurvivingLines: n,
			AuthoredLines:  authored[email],
		})
		seen[email] = true
	}
	for email, n := range authored {
		if seen[email] {
			continue
		}
		res.Survival = append(res.Survival, AuthorSurvival{
			AuthorEmail:    email,
			SurvivingLines: surviving[email], // 0
			AuthoredLines:  n,
		})
	}
}

// blameSurvivingLines runs line-porcelain blame on one file and returns a
// lower(email)→line-count map. Non-UTF8 content is tolerated (we only read the
// "author-mail" header lines, never the code).
func blameSurvivingLines(ctx context.Context, dir, path string) (map[string]int, error) {
	out, err := runGitBytes(ctx, dir, "blame", "--line-porcelain", "HEAD", "--", path)
	if err != nil {
		return nil, err
	}
	counts := map[string]int{}
	sc := bufio.NewScanner(bytes.NewReader(out))
	sc.Buffer(make([]byte, 1<<20), 16<<20)
	for sc.Scan() {
		line := sc.Bytes()
		// In --line-porcelain, every line has exactly one "author-mail <…>" header.
		if bytes.HasPrefix(line, []byte("author-mail ")) {
			email := normEmail(strings.Trim(string(line[len("author-mail "):]), "<>"))
			if email != "" {
				counts[email]++
			}
		}
	}
	// Scanner errors here are non-fatal — we return whatever we counted.
	return counts, nil
}

// skipForBlame reports whether a file should be skipped: too large or binary.
func skipForBlame(ctx context.Context, dir, path string) bool {
	// Size via cat-file (cheap, no checkout). Falls through to blame on error.
	if sizeOut, err := runGit(ctx, dir, "cat-file", "-s", "HEAD:"+path); err == nil {
		if sz, perr := strconv.ParseInt(strings.TrimSpace(sizeOut), 10, 64); perr == nil && sz > maxBlameBytes {
			return true
		}
	}
	// Heuristic binary check: git records binary files in numstat as "-"; here we
	// sniff the blob for a NUL byte in the first chunk.
	if blob, err := runGitBytes(ctx, dir, "cat-file", "blob", "HEAD:"+path); err == nil {
		head := blob
		if len(head) > 8000 {
			head = head[:8000]
		}
		if bytes.IndexByte(head, 0) >= 0 {
			return true
		}
	}
	return false
}

// ── Stage 3: SZZ bug-introduction tracing ────────────────────────────────────

// fixMessageRE matches commit messages that look like bug fixes. Matches the
// brief: fix|bug|hotfix|patch|revert|regression, plus "fixes #123" issue refs.
var fixMessageRE = regexp.MustCompile(
	`(?i)\b(fix(e[ds])?|bug|hotfix|patch(e[ds])?|revert(ed|s)?|regression)\b|fix(e[ds])?\s+#\d+`,
)

// IsBugFixMessage reports whether a commit message indicates a bug fix.
func IsBugFixMessage(msg string) bool { return fixMessageRE.MatchString(msg) }

// collectSZZ finds bug-fix commits and, for each, blames the lines it changed
// back (in the parent) to the introducing commit+author.
func (res *Result) collectSZZ(ctx context.Context, dir string) {
	fixes := res.findFixCommits(ctx, dir)
	if len(fixes) == 0 {
		return
	}

	// Dedup key: (introduced_sha, fix_sha) → accumulated line count + author.
	acc := map[struct{ intro, fix string }]*BugIntroduction{}

	traced := 0
	for _, fix := range fixes {
		if traced >= maxFixCommits {
			res.warnf("SZZ hit fix-commit cap of %d; attributions are partial", maxFixCommits)
			break
		}
		traced++
		res.traceFix(ctx, dir, fix, acc)
	}

	for _, bi := range acc {
		res.BugIntros = append(res.BugIntros, *bi)
	}
}

// fixCommit is the minimal info SZZ needs about a bug-fix commit.
type fixCommit struct {
	sha    string
	parent string // first parent ("" if root/no parent)
}

// findFixCommits scans the log for commits whose message reads as a bug fix and
// that have a parent (you can't blame "before" a root commit).
func (res *Result) findFixCommits(ctx context.Context, dir string) []fixCommit {
	// %H sha, %P parents (space-sep), then subject+body until the sentinel.
	const sub = "\x1f" // unit separator between sha/parents and message
	out, err := runGitBig(ctx, dir, "log", "HEAD", "--no-merges",
		"--format=%H "+"%P"+sub+"%B%x1e")
	if err != nil {
		res.warnf("git log for SZZ fix detection failed: %v", err)
		return nil
	}

	var fixes []fixCommit
	for _, block := range strings.Split(out, "\x1e") {
		block = strings.TrimLeft(block, "\n")
		if block == "" {
			continue
		}
		head, msg, ok := strings.Cut(block, sub)
		if !ok {
			continue
		}
		// head = "<sha> <parents...>"
		fields := strings.Fields(head)
		if len(fields) == 0 {
			continue
		}
		sha := fields[0]
		var parent string
		if len(fields) >= 2 {
			parent = fields[1] // first parent
		}
		if parent == "" {
			continue // root commit: nothing to blame against
		}
		if IsBugFixMessage(msg) {
			fixes = append(fixes, fixCommit{sha: sha, parent: parent})
		}
	}
	return fixes
}

// hunkHeaderRE parses a unified-diff hunk header to get the pre-image (old) range.
// "@@ -oldStart,oldCount +newStart,newCount @@"
var hunkHeaderRE = regexp.MustCompile(`^@@ -(\d+)(?:,(\d+))? \+\d+(?:,\d+)? @@`)

// diffFileRE captures the new-path of a "+++ b/path" diff header.
var diffPlusRE = regexp.MustCompile(`^\+\+\+ (?:b/)?(.*)$`)
var diffMinusRE = regexp.MustCompile(`^--- (?:a/)?(.*)$`)

// traceFix runs SZZ for a single fix commit: parse `git show <fix>` to find the
// pre-fix (deleted) line ranges per file, then `git blame <fix>^ -L a,b -- file`
// to attribute those lines to the introducing commit+author.
func (res *Result) traceFix(ctx context.Context, dir string, fix fixCommit, acc map[struct{ intro, fix string }]*BugIntroduction) {
	show, err := runGitBig(ctx, dir, "show", "--no-color", "--unified=0",
		"--format=", "-M", fix.sha)
	if err != nil {
		res.warnf("git show %s failed: %v", short(fix.sha), err)
		return
	}

	// Parse the diff into per-file deleted-line ranges in the PARENT image.
	ranges := parseDeletedRanges(show)
	if len(ranges) == 0 {
		return
	}

	filesTraced := 0
	for path, rs := range ranges {
		if filesTraced >= maxFilesPerFix {
			break
		}
		filesTraced++
		for _, r := range rs {
			// Blame the parent at exactly the deleted range.
			lineSpec := fmt.Sprintf("%d,%d", r.start, r.start+r.count-1)
			out, berr := runGitBytes(ctx, dir,
				"blame", "--porcelain", "-L", lineSpec, fix.parent, "--", path)
			if berr != nil {
				// File may not exist in parent (pure addition); skip quietly.
				continue
			}
			for intro, ia := range blamePorcelainAuthors(out) {
				k := struct{ intro, fix string }{intro, fix.sha}
				if bi := acc[k]; bi != nil {
					bi.Lines += ia.lines
				} else {
					acc[k] = &BugIntroduction{
						AuthorEmail:   ia.email,
						IntroducedSHA: intro,
						FixSHA:        fix.sha,
						Lines:         ia.lines,
					}
				}
			}
		}
	}
}

// lineRange is a [start, start+count) span of pre-image lines.
type lineRange struct{ start, count int }

// parseDeletedRanges walks a unified diff (produced with -U0) and returns, per
// file path, the list of old-image line ranges that the fix DELETED or CHANGED.
// Those are the lines SZZ blames in the parent. Pure additions (oldCount==0) are
// skipped — there was no prior line to introduce a bug.
func parseDeletedRanges(diff string) map[string][]lineRange {
	out := map[string][]lineRange{}
	var curPath string
	sc := bufio.NewScanner(strings.NewReader(diff))
	sc.Buffer(make([]byte, 1<<20), 16<<20)
	for sc.Scan() {
		line := sc.Text()
		switch {
		case strings.HasPrefix(line, "+++ "):
			if m := diffPlusRE.FindStringSubmatch(line); m != nil {
				p := strings.TrimSpace(m[1])
				if p != "/dev/null" {
					curPath = cleanRenamePath(p)
				}
			}
		case strings.HasPrefix(line, "--- "):
			// If new side is /dev/null (file deleted) we fall back to the old path.
			if m := diffMinusRE.FindStringSubmatch(line); m != nil {
				if curPath == "" {
					p := strings.TrimSpace(m[1])
					if p != "/dev/null" {
						curPath = cleanRenamePath(p)
					}
				}
			}
		case strings.HasPrefix(line, "@@"):
			if curPath == "" {
				continue
			}
			m := hunkHeaderRE.FindStringSubmatch(line)
			if m == nil {
				continue
			}
			start, _ := strconv.Atoi(m[1])
			count := 1
			if m[2] != "" {
				count, _ = strconv.Atoi(m[2])
			}
			if count <= 0 {
				continue // pure addition: no pre-image line to blame
			}
			if start <= 0 {
				start = 1
			}
			out[curPath] = append(out[curPath], lineRange{start: start, count: count})
		}
		// On a new "diff --git" boundary, reset path so a missing +++ doesn't leak.
		if strings.HasPrefix(line, "diff --git ") {
			curPath = ""
		}
	}
	return out
}

// introAuthor bundles the introducing author's email with the number of blamed
// lines attributed to that introducing commit within a range.
type introAuthor struct {
	email string
	lines int
}

// blamePorcelainAuthors parses `git blame --porcelain` output (for a -L range)
// and returns introducing-sha → {email, blamed-line-count}. Each content line
// (prefixed with a tab in porcelain) increments the count for its commit, so the
// caller gets a true per-introducing-commit line tally for the range.
func blamePorcelainAuthors(raw []byte) map[string]introAuthor {
	res := map[string]introAuthor{}
	emails := map[string]string{} // sha → email (headers may precede content)
	sc := bufio.NewScanner(bytes.NewReader(raw))
	sc.Buffer(make([]byte, 1<<20), 16<<20)
	var curSHA string
	for sc.Scan() {
		line := sc.Text()
		switch {
		case len(line) >= 40 && isHex40(line[:40]) && (len(line) == 40 || line[40] == ' '):
			curSHA = line[:40]
		case strings.HasPrefix(line, "author-mail "):
			if curSHA != "" {
				emails[curSHA] = normEmail(strings.Trim(strings.TrimPrefix(line, "author-mail "), "<>"))
			}
		case len(line) > 0 && line[0] == '\t':
			// A content line terminates a blame entry; count one blamed line.
			if curSHA != "" && !isZeroSHA(curSHA) {
				ia := res[curSHA]
				ia.lines++
				if ia.email == "" {
					ia.email = emails[curSHA]
				}
				res[curSHA] = ia
			}
		}
	}
	return res
}

// ── git invocation helpers ───────────────────────────────────────────────────

// runGit runs a git subcommand in dir and returns trimmed stdout as a string.
// All args are passed as a slice (never shell-interpolated).
func runGit(ctx context.Context, dir string, args ...string) (string, error) {
	out, err := runGitBytes(ctx, dir, args...)
	return string(out), err
}

// runGitBig is like runGit but returns the full (untrimmed) stdout — used where
// trailing structure matters (numstat blocks, sentinel splits).
func runGitBig(ctx context.Context, dir string, args ...string) (string, error) {
	out, err := runGitBytes(ctx, dir, args...)
	return string(out), err
}

// runGitBytes is the core runner: bounded by gitTimeout, stderr captured into the
// error. We force a stable, locale-independent environment.
func runGitBytes(ctx context.Context, dir string, args ...string) ([]byte, error) {
	cctx, cancel := context.WithTimeout(ctx, gitTimeout)
	defer cancel()

	// gc.auto=0: blame/log on a big repo otherwise triggers background "auto packing"
	// (a forked git gc) which, under parallel imports, gets OOM-"signal: killed",
	// cascades a context-deadline failure across the whole sync, and the repo then
	// retries forever. The temp clone is never reused, so packing buys nothing.
	full := append([]string{"-c", "gc.auto=0", "-C", dir}, args...)
	cmd := exec.CommandContext(cctx, "git", full...)
	cmd.Env = append(os.Environ(),
		"LC_ALL=C",
		"GIT_TERMINAL_PROMPT=0", // never block on credential prompts
		"GIT_OPTIONAL_LOCKS=0",
		"GIT_AUTO_GC=0", // belt-and-suspenders: also suppresses the post-op auto gc
	)
	var stdout, stderr bytes.Buffer
	cmd.Stdout = &stdout
	cmd.Stderr = &stderr
	if err := cmd.Run(); err != nil {
		msg := strings.TrimSpace(stderr.String())
		if msg != "" {
			return stdout.Bytes(), fmt.Errorf("%w — %s", err, firstLine(msg))
		}
		return stdout.Bytes(), err
	}
	return stdout.Bytes(), nil
}

// ── small utilities ──────────────────────────────────────────────────────────

func (res *Result) warnf(format string, args ...any) {
	msg := fmt.Sprintf(format, args...)
	res.Warnings = append(res.Warnings, msg)
	log.Printf("gitanalysis: %s", msg)
}

// parseStatNum parses a numstat add/del field; "-" (binary) → 0.
func parseStatNum(s string) int {
	s = strings.TrimSpace(s)
	if s == "" || s == "-" {
		return 0
	}
	n, err := strconv.Atoi(s)
	if err != nil {
		return 0
	}
	return n
}

// cleanRenamePath normalises a numstat/diff path, including git's rename forms:
//
//	"old => new"                         → new
//	"dir/{old => new}/file"              → dir/new/file
//	quoted "non-asc\t\303\251.txt"       → unquoted best-effort
func cleanRenamePath(p string) string {
	p = strings.TrimSpace(p)
	if p == "" {
		return ""
	}
	// Unquote git's C-quoted path (non-ASCII / special chars).
	if strings.HasPrefix(p, `"`) && strings.HasSuffix(p, `"`) {
		if uq, err := strconv.Unquote(p); err == nil {
			p = uq
		} else {
			p = strings.Trim(p, `"`)
		}
	}
	// Rename braces: a/{b => c}/d  →  a/c/d
	if i := strings.Index(p, "{"); i >= 0 {
		if j := strings.Index(p[i:], "}"); j >= 0 {
			inner := p[i+1 : i+j]
			prefix := p[:i]
			suffix := p[i+j+1:]
			if arrow := strings.Index(inner, "=>"); arrow >= 0 {
				newPart := strings.TrimSpace(inner[arrow+2:])
				return cleanPath(prefix + newPart + suffix)
			}
		}
	}
	// Simple "old => new".
	if arrow := strings.Index(p, "=>"); arrow >= 0 {
		return cleanPath(strings.TrimSpace(p[arrow+2:]))
	}
	return cleanPath(p)
}

func cleanPath(p string) string {
	p = strings.TrimSpace(p)
	// Collapse accidental double slashes from brace expansion.
	for strings.Contains(p, "//") {
		p = strings.ReplaceAll(p, "//", "/")
	}
	return filepath.ToSlash(p)
}

// normEmail lowercases and trims an email for stable identity keys.
func normEmail(s string) string {
	return strings.ToLower(strings.TrimSpace(s))
}

func short(sha string) string {
	if len(sha) > 8 {
		return sha[:8]
	}
	return sha
}

func firstLine(s string) string {
	if i := strings.IndexByte(s, '\n'); i >= 0 {
		return s[:i]
	}
	return s
}

func isHex40(s string) bool {
	if len(s) != 40 {
		return false
	}
	for i := 0; i < len(s); i++ {
		c := s[i]
		if !((c >= '0' && c <= '9') || (c >= 'a' && c <= 'f')) {
			return false
		}
	}
	return true
}

// isZeroSHA reports the all-zero "not yet committed" blame sha.
func isZeroSHA(s string) bool {
	for i := 0; i < len(s); i++ {
		if s[i] != '0' {
			return false
		}
	}
	return len(s) > 0
}

// injectToken embeds token into an https URL's userinfo for an authenticated
// clone. Non-https URLs are returned unchanged (token can't be safely embedded).
func injectToken(url, token string) string {
	if token == "" {
		return url
	}
	const httpsPrefix = "https://"
	if !strings.HasPrefix(url, httpsPrefix) {
		return url
	}
	rest := url[len(httpsPrefix):]
	// If the URL already carries userinfo, don't double-inject.
	if i := strings.IndexByte(rest, '/'); i >= 0 {
		if strings.Contains(rest[:i], "@") {
			return url
		}
	}
	return httpsPrefix + "x-access-token:" + token + "@" + rest
}

// scrubURL returns a host-only, token-free form of url for safe logging.
func scrubURL(url string) string {
	for _, p := range []string{"https://", "http://", "git://", "ssh://"} {
		if !strings.HasPrefix(url, p) {
			continue
		}
		u := url[len(p):]
		// Restrict to the authority component (up to the first '/').
		authority := u
		path := ""
		if slash := strings.IndexByte(u, '/'); slash >= 0 {
			authority = u[:slash]
			path = "/…"
		}
		// Drop any userinfo (token@host).
		if at := strings.LastIndexByte(authority, '@'); at >= 0 {
			authority = authority[at+1:]
		}
		return p + authority + path
	}
	return "<repo>"
}
