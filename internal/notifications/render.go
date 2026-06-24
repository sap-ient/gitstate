package notifications

import (
	"fmt"
	"strings"
)

// brandColor is the gitstate teal used as the accent across rich payloads:
// Discord embed color (int), Teams themeColor (hex without #), etc.
const (
	brandColorInt = 0x2DD4BF // Discord embed "color" is a decimal int.
	brandColorHex = "2DD4BF" // Teams "themeColor" is a hex string (no leading #).
)

// Rendered holds every per-platform representation of a digest so a channel can
// pick the one it needs. SlackPayload doubles as the generic-webhook body; the
// Discord/GoogleChat/Teams payloads are native shapes for those incoming
// webhooks; Text is for plain-text consumers (email body, fallback).
type Rendered struct {
	// SlackPayload is a Slack Block Kit message: {text, blocks:[...]}. The top
	// level "text" doubles as the notification fallback / plain summary, so a
	// generic webhook receiver still gets something readable without parsing
	// blocks.
	SlackPayload map[string]any `json:"slackPayload"`
	// DiscordPayload is a Discord webhook message with a rich embed
	// ({content, embeds:[{title, description, color, fields}]}).
	DiscordPayload map[string]any `json:"discordPayload"`
	// GoogleChatPayload is a Google Chat webhook message ({text}) using Chat's
	// markdown-ish syntax (*bold*, _italic_, <url|link>).
	GoogleChatPayload map[string]any `json:"googleChatPayload"`
	// TeamsPayload is a legacy-compatible Microsoft Teams MessageCard. It works
	// with classic Incoming Webhook connectors and Workflows.
	TeamsPayload map[string]any `json:"teamsPayload"`
	// Text is the plain-text rendering (used for email bodies and as a fallback).
	Text string `json:"text"`
	// Summary is a one-line summary suitable for a log row.
	Summary string `json:"summary"`
}

// PayloadFor returns the native JSON payload to POST for a given channel kind.
// It returns nil for kinds that are not HTTP-webhook based (e.g. "email").
func (r Rendered) PayloadFor(kind string) map[string]any {
	switch kind {
	case "slack", "webhook":
		return r.SlackPayload
	case "discord":
		return r.DiscordPayload
	case "google_chat":
		return r.GoogleChatPayload
	case "teams":
		return r.TeamsPayload
	default:
		return nil
	}
}

// Render produces every per-platform payload and the plain-text body for a
// digest.
func Render(d *Digest) Rendered {
	return Rendered{
		SlackPayload:      renderSlack(d),
		DiscordPayload:    renderDiscord(d),
		GoogleChatPayload: renderGoogleChat(d),
		TeamsPayload:      renderTeams(d),
		Text:              renderText(d),
		Summary:           renderSummary(d),
	}
}

// renderSummary builds a compact one-line summary for the notification_log.
func renderSummary(d *Digest) string {
	if d.Empty {
		return d.Title + " — nothing to report"
	}
	parts := make([]string, 0, len(d.Metrics))
	for _, m := range d.Metrics {
		parts = append(parts, fmt.Sprintf("%s: %s", m.Label, m.Value))
	}
	if len(parts) == 0 {
		return d.Title
	}
	return d.Title + " — " + strings.Join(parts, ", ")
}

// renderText renders a digest as a plain-text body (email / fallback).
func renderText(d *Digest) string {
	var b strings.Builder
	b.WriteString(d.Title)
	b.WriteByte('\n')
	if d.Subtitle != "" {
		b.WriteString(d.Subtitle)
		b.WriteByte('\n')
	}
	b.WriteString(strings.Repeat("=", len([]rune(d.Title))))
	b.WriteString("\n\n")

	if d.Empty {
		reason := d.EmptyReason
		if reason == "" {
			reason = "Nothing to report."
		}
		b.WriteString(reason)
		b.WriteByte('\n')
		return b.String()
	}

	if len(d.Metrics) > 0 {
		parts := make([]string, 0, len(d.Metrics))
		for _, m := range d.Metrics {
			parts = append(parts, fmt.Sprintf("%s: %s", m.Label, m.Value))
		}
		b.WriteString(strings.Join(parts, "  |  "))
		b.WriteString("\n\n")
	}

	for _, s := range d.Sections {
		if len(s.Lines) == 0 {
			continue
		}
		b.WriteString(s.Heading)
		b.WriteByte('\n')
		for _, ln := range s.Lines {
			b.WriteString("  • ")
			b.WriteString(ln.Text)
			if ln.Meta != "" {
				b.WriteString("  (")
				b.WriteString(ln.Meta)
				b.WriteString(")")
			}
			b.WriteByte('\n')
		}
		b.WriteByte('\n')
	}

	b.WriteString("— gitstate · generated ")
	b.WriteString(d.GeneratedAt.Format("Jan 2, 2006 15:04 MST"))
	b.WriteByte('\n')
	return b.String()
}

// renderSlack renders a digest as a Slack Block Kit message. The structure is
// also a perfectly valid generic-webhook JSON payload; the top-level "text"
// field is a usable fallback for any receiver that ignores blocks.
func renderSlack(d *Digest) map[string]any {
	blocks := make([]map[string]any, 0, 8)

	// Header.
	blocks = append(blocks, map[string]any{
		"type": "header",
		"text": map[string]any{"type": "plain_text", "text": d.Title, "emoji": true},
	})
	if d.Subtitle != "" {
		blocks = append(blocks, map[string]any{
			"type":     "context",
			"elements": []map[string]any{{"type": "mrkdwn", "text": d.Subtitle}},
		})
	}

	if d.Empty {
		reason := d.EmptyReason
		if reason == "" {
			reason = "Nothing to report."
		}
		blocks = append(blocks, mrkdwnSection(reason))
		return map[string]any{"text": d.Title + " — nothing to report", "blocks": blocks}
	}

	// Metrics as a single fields section.
	if len(d.Metrics) > 0 {
		fields := make([]map[string]any, 0, len(d.Metrics))
		for _, m := range d.Metrics {
			fields = append(fields, map[string]any{
				"type": "mrkdwn",
				"text": fmt.Sprintf("*%s*\n%s", m.Label, m.Value),
			})
		}
		blocks = append(blocks, map[string]any{"type": "section", "fields": fields})
	}

	for _, s := range d.Sections {
		if len(s.Lines) == 0 {
			continue
		}
		blocks = append(blocks, map[string]any{"type": "divider"})
		blocks = append(blocks, mrkdwnSection("*"+slackEscape(s.Heading)+"*"))
		var sb strings.Builder
		for _, ln := range s.Lines {
			sb.WriteString("• ")
			sb.WriteString(slackEscape(ln.Text))
			if ln.Meta != "" {
				sb.WriteString("  _")
				sb.WriteString(slackEscape(ln.Meta))
				sb.WriteString("_")
			}
			sb.WriteByte('\n')
		}
		blocks = append(blocks, mrkdwnSection(strings.TrimRight(sb.String(), "\n")))
	}

	blocks = append(blocks, map[string]any{
		"type": "context",
		"elements": []map[string]any{
			{"type": "mrkdwn", "text": "gitstate · generated " + d.GeneratedAt.Format("Jan 2, 2006 15:04 MST")},
		},
	})

	return map[string]any{"text": renderSummary(d), "blocks": blocks}
}

func mrkdwnSection(text string) map[string]any {
	return map[string]any{
		"type": "section",
		"text": map[string]any{"type": "mrkdwn", "text": text},
	}
}

// slackEscape escapes the three characters Slack mrkdwn treats specially.
func slackEscape(s string) string {
	s = strings.ReplaceAll(s, "&", "&amp;")
	s = strings.ReplaceAll(s, "<", "&lt;")
	s = strings.ReplaceAll(s, ">", "&gt;")
	return s
}

// ── Discord ─────────────────────────────────────────────────────────────────

// renderDiscord renders a digest as a Discord webhook message with a single rich
// embed. Shape: {content, embeds:[{title, description, color, fields:[…]}]}.
// "content" is a short plain-text line (the summary) so a notification preview is
// readable; the embed carries the structured detail in Discord markdown.
//
// Discord also accepts a Slack payload at <url>/slack, but we emit a native embed
// for a cleaner look.
func renderDiscord(d *Digest) map[string]any {
	embed := map[string]any{
		"title": discordEscape(d.Title),
		"color": brandColorInt,
	}

	if d.Empty {
		reason := d.EmptyReason
		if reason == "" {
			reason = "Nothing to report."
		}
		embed["description"] = discordEscape(reason)
		return map[string]any{
			"content": d.Title + " — nothing to report",
			"embeds":  []map[string]any{embed},
		}
	}

	if d.Subtitle != "" {
		// Discord embeds have no subtitle slot; fold it into the description head.
		embed["description"] = "_" + discordEscape(d.Subtitle) + "_"
	}

	// Metrics become inline embed fields.
	fields := make([]map[string]any, 0, len(d.Metrics)+len(d.Sections))
	for _, m := range d.Metrics {
		fields = append(fields, map[string]any{
			"name":   discordEscape(m.Label),
			"value":  discordEscape(m.Value),
			"inline": true,
		})
	}

	// Each section becomes a (non-inline) field whose value is a bulleted list.
	for _, s := range d.Sections {
		if len(s.Lines) == 0 {
			continue
		}
		var sb strings.Builder
		for _, ln := range s.Lines {
			sb.WriteString("• ")
			sb.WriteString(discordEscape(ln.Text))
			if ln.Meta != "" {
				sb.WriteString("  _")
				sb.WriteString(discordEscape(ln.Meta))
				sb.WriteString("_")
			}
			sb.WriteByte('\n')
		}
		fields = append(fields, map[string]any{
			"name":   discordEscape(s.Heading),
			"value":  strings.TrimRight(sb.String(), "\n"),
			"inline": false,
		})
	}
	if len(fields) > 0 {
		embed["fields"] = fields
	}
	embed["footer"] = map[string]any{
		"text": "gitstate · generated " + d.GeneratedAt.Format("Jan 2, 2006 15:04 MST"),
	}

	return map[string]any{
		"content": renderSummary(d),
		"embeds":  []map[string]any{embed},
	}
}

// discordEscape escapes the Discord markdown control characters so user content
// is not interpreted as formatting. Backslash-escapes the standard set.
func discordEscape(s string) string {
	r := strings.NewReplacer(
		`\`, `\\`,
		"`", "\\`",
		"*", `\*`,
		"_", `\_`,
		"~", `\~`,
		">", `\>`,
		"|", `\|`,
		"#", `\#`,
		"-", `\-`,
	)
	return r.Replace(s)
}

// ── Google Chat ─────────────────────────────────────────────────────────────

// renderGoogleChat renders a digest as a Google Chat webhook message ({text}).
// Chat text supports *bold*, _italic_ and <url|link>; we use *bold* for the
// title/headings and a leading "• " for evidence lines. Plain text is robust and
// renders well in spaces, so we prefer it over cardsV2.
func renderGoogleChat(d *Digest) map[string]any {
	var b strings.Builder
	b.WriteString("*")
	b.WriteString(googleChatEscape(d.Title))
	b.WriteString("*")
	if d.Subtitle != "" {
		b.WriteString("\n_")
		b.WriteString(googleChatEscape(d.Subtitle))
		b.WriteString("_")
	}

	if d.Empty {
		reason := d.EmptyReason
		if reason == "" {
			reason = "Nothing to report."
		}
		b.WriteString("\n\n")
		b.WriteString(googleChatEscape(reason))
		return map[string]any{"text": b.String()}
	}

	if len(d.Metrics) > 0 {
		parts := make([]string, 0, len(d.Metrics))
		for _, m := range d.Metrics {
			parts = append(parts, "*"+googleChatEscape(m.Value)+"* "+googleChatEscape(m.Label))
		}
		b.WriteString("\n\n")
		b.WriteString(strings.Join(parts, "  ·  "))
	}

	for _, s := range d.Sections {
		if len(s.Lines) == 0 {
			continue
		}
		b.WriteString("\n\n*")
		b.WriteString(googleChatEscape(s.Heading))
		b.WriteString("*")
		for _, ln := range s.Lines {
			b.WriteString("\n• ")
			b.WriteString(googleChatEscape(ln.Text))
			if ln.Meta != "" {
				b.WriteString("  _")
				b.WriteString(googleChatEscape(ln.Meta))
				b.WriteString("_")
			}
		}
	}

	b.WriteString("\n\n_gitstate · generated ")
	b.WriteString(googleChatEscape(d.GeneratedAt.Format("Jan 2, 2006 15:04 MST")))
	b.WriteString("_")
	return map[string]any{"text": b.String()}
}

// googleChatEscape neutralises the Chat formatting characters in user content so
// it is not interpreted as *bold*/_italic_/<link> or angle-bracket syntax.
func googleChatEscape(s string) string {
	r := strings.NewReplacer(
		"*", "∗", // U+2217 ASTERISK OPERATOR — visually similar, not a control char.
		"_", "＿", // U+FF3F FULLWIDTH LOW LINE.
		"<", "‹",
		">", "›",
	)
	return r.Replace(s)
}

// ── Microsoft Teams ─────────────────────────────────────────────────────────

// renderTeams renders a digest as a legacy MessageCard. This format works with
// classic Incoming Webhook connectors and with Workflows (Power Automate) that
// accept MessageCard JSON.
//
// TODO: Microsoft is deprecating Office 365 connectors / MessageCard in favour of
// Power Automate Workflows with Adaptive Cards. When connectors are fully retired
// we should emit an Adaptive Card (attachments[].content with type
// "AdaptiveCard") instead of a MessageCard.
func renderTeams(d *Digest) map[string]any {
	card := map[string]any{
		"@type":      "MessageCard",
		"@context":   "https://schema.org/extensions",
		"themeColor": brandColorHex,
		"summary":    renderSummary(d),
		"title":      teamsEscape(d.Title),
	}

	if d.Empty {
		reason := d.EmptyReason
		if reason == "" {
			reason = "Nothing to report."
		}
		card["summary"] = d.Title + " — nothing to report"
		card["sections"] = []map[string]any{{
			"activityTitle": teamsEscape(d.Subtitle),
			"text":          teamsEscape(reason),
		}}
		return card
	}

	sections := make([]map[string]any, 0, len(d.Sections)+1)

	// Lead section: subtitle + metrics as facts.
	lead := map[string]any{}
	if d.Subtitle != "" {
		lead["activityTitle"] = teamsEscape(d.Subtitle)
	}
	if len(d.Metrics) > 0 {
		facts := make([]map[string]any, 0, len(d.Metrics))
		for _, m := range d.Metrics {
			facts = append(facts, map[string]any{
				"name":  teamsEscape(m.Label),
				"value": teamsEscape(m.Value),
			})
		}
		lead["facts"] = facts
	}
	if len(lead) > 0 {
		sections = append(sections, lead)
	}

	for _, s := range d.Sections {
		if len(s.Lines) == 0 {
			continue
		}
		var sb strings.Builder
		for _, ln := range s.Lines {
			sb.WriteString("- ")
			sb.WriteString(teamsEscape(ln.Text))
			if ln.Meta != "" {
				sb.WriteString(" _")
				sb.WriteString(teamsEscape(ln.Meta))
				sb.WriteString("_")
			}
			sb.WriteString("\n\n")
		}
		sections = append(sections, map[string]any{
			"activityTitle": "**" + teamsEscape(s.Heading) + "**",
			"text":          strings.TrimRight(sb.String(), "\n"),
		})
	}

	sections = append(sections, map[string]any{
		"text": "_gitstate · generated " + teamsEscape(d.GeneratedAt.Format("Jan 2, 2006 15:04 MST")) + "_",
	})

	if len(sections) > 0 {
		card["sections"] = sections
	}
	return card
}

// teamsEscape neutralises the Markdown control characters Teams MessageCards
// interpret, plus HTML angle brackets (MessageCard text also renders HTML).
func teamsEscape(s string) string {
	s = strings.ReplaceAll(s, "&", "&amp;")
	s = strings.ReplaceAll(s, "<", "&lt;")
	s = strings.ReplaceAll(s, ">", "&gt;")
	r := strings.NewReplacer(
		`\`, `\\`,
		"*", `\*`,
		"_", `\_`,
		"`", "\\`",
		"#", `\#`,
		"[", `\[`,
		"]", `\]`,
	)
	return r.Replace(s)
}
