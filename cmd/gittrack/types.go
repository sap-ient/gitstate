package main

// Response structs used for rendering human-readable summaries. In --json mode
// the raw server bytes are streamed unchanged, so these only need to match the
// fields gittrack actually prints. Unknown fields are ignored by encoding/json,
// which keeps gittrack tolerant of the API evolving additional context.

// issue mirrors the /api/issues element and the "issue" sub-object of the
// context bundle (camelCase JSON, matching internal/api issueResponse).
type issue struct {
	ID           string   `json:"id"`
	Source       string   `json:"source"`
	Platform     string   `json:"platform"`
	ExternalID   string   `json:"externalId"`
	Number       int      `json:"number"`
	Title        string   `json:"title"`
	Body         string   `json:"body"`
	State        string   `json:"state"`
	DerivedState string   `json:"derivedState"`
	Assignee     string   `json:"assignee"`
	Labels       []string `json:"labels"`
}

// relatedPR is a PR linked to an issue inside the context bundle.
type relatedPR struct {
	ID           string `json:"id"`
	Number       int    `json:"number"`
	Title        string `json:"title"`
	State        string `json:"state"`
	Merged       bool   `json:"merged"`
	LeadTimeSecs int64  `json:"leadTimeSecs"`
}

// relatedCommit is a recent commit linked to the issue.
type relatedCommit struct {
	SHA     string `json:"sha"`
	Subject string `json:"subject"`
}

// similarIssue is a historically-similar issue plus its resolving PR.
type similarIssue struct {
	ID           string     `json:"id"`
	Number       int        `json:"number"`
	Title        string     `json:"title"`
	State        string     `json:"state"`
	ResolvingPR  *relatedPR `json:"resolvingPr"`
}

// issueContext is the bundle returned by GET /api/context/issue/{id}.
type issueContext struct {
	Issue        issue           `json:"issue"`
	RelatedPRs   []relatedPR     `json:"relatedPrs"`
	Commits      []relatedCommit `json:"commits"`
	TouchedPaths []string        `json:"touchedPaths"`
	Similar      []similarIssue  `json:"similarIssues"`
}

// prContext is the bundle returned by GET /api/context/pr/{id}.
type prContext struct {
	PR struct {
		ID           string `json:"id"`
		Number       int    `json:"number"`
		Title        string `json:"title"`
		State        string `json:"state"`
		Merged       bool   `json:"merged"`
		AuthorLogin  string `json:"authorLogin"`
		Additions    int    `json:"additions"`
		Deletions    int    `json:"deletions"`
		ChangedFiles int    `json:"changedFiles"`
	} `json:"pr"`
	DiffSummary   string   `json:"diffSummary"`
	ChangedPaths  []string `json:"changedPaths"`
	CycleTimeSecs int64    `json:"cycleTimeSecs"`
	PredictedSecs int64    `json:"predicted_secs"`
}
