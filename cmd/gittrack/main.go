// Command gittrack is gitstate's pipe-friendly CLI for AI agents and developer
// harnesses. It pulls token-efficient issue and PR context from the gitstate
// API so an agent can start work on an issue with a single command:
//
//	gittrack context 123 --json | your-agent
//
// Auth is a gitstate API token (gsk_...) supplied via the GITSTATE_TOKEN env
// var (or --token); the base URL comes from GITSTATE_URL (or --url, default
// http://localhost:8080). Every request sends Authorization: Bearer $token and
// the org is resolved from the token itself.
package main

import (
	"fmt"
	"os"
)

const defaultURL = "http://localhost:8080"

// env var names, centralised so help text and resolution stay in sync.
const (
	envToken = "GITSTATE_TOKEN"
	envURL   = "GITSTATE_URL"
)

func main() {
	os.Exit(run(os.Args[1:]))
}

// run is the testable entrypoint. It returns a process exit code instead of
// calling os.Exit so tests can drive the dispatcher directly.
func run(args []string) int {
	if len(args) == 0 {
		usage(os.Stderr)
		return 2
	}

	cmd, rest := args[0], args[1:]
	switch cmd {
	case "help", "-h", "--help":
		usage(os.Stdout)
		return 0
	case "context":
		return cmdContext(rest)
	case "pr":
		return cmdPR(rest)
	case "issues":
		return cmdIssues(rest)
	case "whoami":
		return cmdWhoami(rest)
	default:
		fmt.Fprintf(os.Stderr, "gittrack: unknown command %q\n\n", cmd)
		usage(os.Stderr)
		return 2
	}
}

// resolveClient builds a client from the resolved URL + token, applying the
// precedence: explicit flag > env var > default (URL only). A missing token is
// a hard error since every endpoint is authed.
func resolveClient(urlFlag, tokenFlag string) (*client, error) {
	base := firstNonEmpty(urlFlag, os.Getenv(envURL), defaultURL)

	token := firstNonEmpty(tokenFlag, os.Getenv(envToken))
	if token == "" {
		return nil, fmt.Errorf("no API token: set %s or pass --token (a gitstate gsk_ token)", envToken)
	}
	return newClient(base, token), nil
}

func firstNonEmpty(vals ...string) string {
	for _, v := range vals {
		if v != "" {
			return v
		}
	}
	return ""
}

// fail prints a "gittrack: <msg>" line to stderr and returns exit code 1.
func fail(err error) int {
	fmt.Fprintf(os.Stderr, "gittrack: %v\n", err)
	return 1
}

func usage(w *os.File) {
	fmt.Fprint(w, `gittrack — gitstate context CLI for AI agents and developers

Designed for AI agents:  gittrack context 123 --json | your-agent

USAGE:
  gittrack <command> [args] [flags]

COMMANDS:
  context <issue-id>   Fetch the full issue context bundle (issue, related PRs,
                       commits, touched paths, similar past issues).
  pr <id>              Fetch a PR context bundle (diff summary, cycle time,
                       effort estimate).
  issues               List issues (table by default).
  whoami               Validate the token and print the configured URL.
  help                 Show this help.

GLOBAL FLAGS:
  --json               Emit the raw server JSON payload (machine-readable,
                       pipe straight into an LLM).
  --url <url>          Override the API base URL (default $GITSTATE_URL or
                       `+defaultURL+`).
  --token <gsk_...>    Override the API token (default $GITSTATE_TOKEN).

COMMAND FLAGS:
  issues --state <s>   Filter by state (e.g. open, in_progress, done, closed).
  issues --limit <n>   Cap the number of issues printed.

ENVIRONMENT:
  GITSTATE_TOKEN       gitstate API token (gsk_...). Required.
  GITSTATE_URL         API base URL (default `+defaultURL+`).

Run `+"`gittrack <command> -h`"+` for per-command help.
`)
}
