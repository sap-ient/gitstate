package main

import (
	"encoding/json"
	"flag"
	"fmt"
	"net/url"
	"os"
	"strings"
)

// commonFlags holds the global flags shared by every subcommand. Each command
// registers them on its own FlagSet so per-command -h works and flags may
// appear after positional args.
type commonFlags struct {
	json  bool
	url   string
	token string
}

func registerCommon(fs *flag.FlagSet, c *commonFlags) {
	fs.BoolVar(&c.json, "json", false, "emit raw server JSON")
	fs.StringVar(&c.url, "url", "", "API base URL (overrides $GITSTATE_URL)")
	fs.StringVar(&c.token, "token", "", "API token (overrides $GITSTATE_TOKEN)")
}

// reorderArgs moves positional (non-flag) arguments after the flag arguments so
// that Go's flag package — which stops at the first non-flag token — still sees
// every flag. This lets users write `gittrack context 42 --json` naturally.
// Everything following a literal "--" is treated as positional verbatim.
func reorderArgs(args []string) []string {
	var flags, positional []string
	i := 0
	for i < len(args) {
		a := args[i]
		if a == "--" {
			positional = append(positional, args[i+1:]...)
			break
		}
		if strings.HasPrefix(a, "-") && a != "-" {
			flags = append(flags, a)
			// A "--flag value" pair (no '=') consumes the next token, unless
			// it is a known bool flag.
			if !strings.Contains(a, "=") && !isBoolFlag(a) && i+1 < len(args) {
				flags = append(flags, args[i+1])
				i++
			}
		} else {
			positional = append(positional, a)
		}
		i++
	}
	return append(flags, positional...)
}

// isBoolFlag reports whether a flag token is one of gittrack's boolean flags,
// which do not consume a following value.
func isBoolFlag(a string) bool {
	name := strings.TrimLeft(a, "-")
	switch name {
	case "json", "h", "help":
		return true
	}
	return false
}

// printRaw pretty-prints raw server JSON when it parses, otherwise echoes the
// bytes verbatim. Either way the output is a faithful representation of the
// server payload so it pipes cleanly into an agent.
func printRaw(body []byte) {
	var pretty any
	if err := json.Unmarshal(body, &pretty); err == nil {
		enc := json.NewEncoder(os.Stdout)
		enc.SetIndent("", "  ")
		enc.SetEscapeHTML(false)
		_ = enc.Encode(pretty)
		return
	}
	os.Stdout.Write(body)
	if len(body) == 0 || body[len(body)-1] != '\n' {
		fmt.Fprintln(os.Stdout)
	}
}

// ── gittrack context <issue-id> ───────────────────────────────────────────────

func cmdContext(args []string) int {
	fs := flag.NewFlagSet("context", flag.ContinueOnError)
	var cf commonFlags
	registerCommon(fs, &cf)
	fs.Usage = func() {
		fmt.Fprintln(os.Stderr, "usage: gittrack context <issue-id> [--json] [--url U] [--token T]")
		fmt.Fprintln(os.Stderr, "Fetch the full issue context bundle for an AI agent.")
		fs.PrintDefaults()
	}
	if err := fs.Parse(reorderArgs(args)); err != nil {
		return 2
	}
	if fs.NArg() != 1 {
		fs.Usage()
		return 2
	}
	id := fs.Arg(0)

	cl, err := resolveClient(cf.url, cf.token)
	if err != nil {
		return fail(err)
	}

	body, err := cl.do("GET", "/api/context/issue/"+url.PathEscape(id))
	if err != nil {
		return fail(err)
	}

	if cf.json {
		printRaw(body)
		return 0
	}

	var ctx issueContext
	if err := json.Unmarshal(body, &ctx); err != nil {
		return fail(fmt.Errorf("decode context bundle: %w", err))
	}
	renderIssueContext(os.Stdout, &ctx)
	return 0
}

// ── gittrack pr <id> ──────────────────────────────────────────────────────────

func cmdPR(args []string) int {
	fs := flag.NewFlagSet("pr", flag.ContinueOnError)
	var cf commonFlags
	registerCommon(fs, &cf)
	fs.Usage = func() {
		fmt.Fprintln(os.Stderr, "usage: gittrack pr <id> [--json] [--url U] [--token T]")
		fmt.Fprintln(os.Stderr, "Fetch a PR context bundle (diff summary, cycle time, effort estimate).")
		fs.PrintDefaults()
	}
	if err := fs.Parse(reorderArgs(args)); err != nil {
		return 2
	}
	if fs.NArg() != 1 {
		fs.Usage()
		return 2
	}
	id := fs.Arg(0)

	cl, err := resolveClient(cf.url, cf.token)
	if err != nil {
		return fail(err)
	}

	body, err := cl.do("GET", "/api/context/pr/"+url.PathEscape(id))
	if err != nil {
		return fail(err)
	}

	if cf.json {
		printRaw(body)
		return 0
	}

	var ctx prContext
	if err := json.Unmarshal(body, &ctx); err != nil {
		return fail(fmt.Errorf("decode PR bundle: %w", err))
	}
	renderPRContext(os.Stdout, &ctx)
	return 0
}

// ── gittrack issues [--state open] [--limit N] ────────────────────────────────

func cmdIssues(args []string) int {
	fs := flag.NewFlagSet("issues", flag.ContinueOnError)
	var cf commonFlags
	registerCommon(fs, &cf)
	var state string
	var limit int
	fs.StringVar(&state, "state", "", "filter by state (open, in_progress, done, closed)")
	fs.IntVar(&limit, "limit", 0, "maximum number of issues to print (0 = all)")
	fs.Usage = func() {
		fmt.Fprintln(os.Stderr, "usage: gittrack issues [--state open] [--limit N] [--json]")
		fmt.Fprintln(os.Stderr, "List issues for the org resolved from the API token.")
		fs.PrintDefaults()
	}
	if err := fs.Parse(reorderArgs(args)); err != nil {
		return 2
	}

	cl, err := resolveClient(cf.url, cf.token)
	if err != nil {
		return fail(err)
	}

	path := "/api/issues"
	if state != "" {
		q := url.Values{}
		q.Set("state", state)
		path += "?" + q.Encode()
	}

	body, err := cl.do("GET", path)
	if err != nil {
		return fail(err)
	}

	var issues []issue
	if err := json.Unmarshal(body, &issues); err != nil {
		return fail(fmt.Errorf("decode issues: %w", err))
	}
	if limit > 0 && len(issues) > limit {
		issues = issues[:limit]
	}

	if cf.json {
		// Re-encode the (possibly limited) slice so --limit is honoured in
		// JSON mode too, keeping the contract "what you see is what you pipe".
		enc := json.NewEncoder(os.Stdout)
		enc.SetIndent("", "  ")
		enc.SetEscapeHTML(false)
		if err := enc.Encode(issues); err != nil {
			return fail(err)
		}
		return 0
	}

	renderIssueList(os.Stdout, issues)
	return 0
}

// ── gittrack whoami ───────────────────────────────────────────────────────────

func cmdWhoami(args []string) int {
	fs := flag.NewFlagSet("whoami", flag.ContinueOnError)
	var cf commonFlags
	registerCommon(fs, &cf)
	fs.Usage = func() {
		fmt.Fprintln(os.Stderr, "usage: gittrack whoami [--url U] [--token T]")
		fmt.Fprintln(os.Stderr, "Validate the API token against gitstate and print the configured URL.")
		fs.PrintDefaults()
	}
	if err := fs.Parse(reorderArgs(args)); err != nil {
		return 2
	}

	cl, err := resolveClient(cf.url, cf.token)
	if err != nil {
		return fail(err)
	}

	// No dedicated identity endpoint exists, so hit a cheap authed read. A 2xx
	// proves the token is valid and the org resolved server-side.
	if _, err := cl.do("GET", "/api/issues?state=open"); err != nil {
		return fail(fmt.Errorf("token validation failed: %w", err))
	}

	fmt.Fprintf(os.Stdout, "OK — token valid\n")
	fmt.Fprintf(os.Stdout, "url:   %s\n", cl.baseURL)
	fmt.Fprintf(os.Stdout, "token: %s\n", maskToken(cl.token))
	return 0
}

// maskToken returns a safe-to-print identifier for a token: its prefix up to
// and including the first underscore plus a few following chars, never the
// secret body. e.g. "gsk_ab12…". It must never reveal enough to reconstruct
// the token.
func maskToken(tok string) string {
	if tok == "" {
		return "(none)"
	}
	prefix := ""
	if i := strings.IndexByte(tok, '_'); i >= 0 && i+1 < len(tok) {
		prefix = tok[:i+1]
		rest := tok[i+1:]
		n := len(rest)
		if n > 4 {
			n = 4
		}
		return prefix + rest[:n] + "…"
	}
	// No recognisable prefix: reveal at most the first 4 chars.
	n := len(tok)
	if n > 4 {
		n = 4
	}
	return tok[:n] + "…"
}

