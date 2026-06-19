//go:build ee

package admin

// EEEnabled reports whether the binary was compiled with the `ee` build tag.
// It drives EE-only UI affordances in the server-rendered admin console (e.g.
// the Revenue nav link, whose route only exists in the EE build).
const EEEnabled = true
