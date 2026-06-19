//go:build !ee

package admin

// EEEnabled reports whether the binary was compiled with the `ee` build tag.
// In the default (OSS) build it is false, so the Revenue nav link — whose
// /admin/revenue route only exists in the EE build — is not rendered.
const EEEnabled = false
