package importer

// Error is a transport/provider error carrying an HTTP status code the API
// layer can surface directly to the caller. Messages are safe to return to the
// client (they never contain credentials).
type Error struct {
	Code int
	Msg  string
}

func (e *Error) Error() string { return e.Msg }

// HTTPStatus returns the status code an API handler should use. Defaults to 502.
func (e *Error) HTTPStatus() int {
	if e.Code == 0 {
		return 502
	}
	return e.Code
}

// PreviewSample bounds how many issues a preview returns to the UI.
const PreviewSample = 20
