package billing

import "time"

// Clock is the injectable time source for all billing LIFECYCLE logic.
//
// HARD RULE: lifecycle code (Scheduler.RunBillingCycle / RunDunning, dunning
// offset math, period advancement) MUST read the current time through a Clock —
// never time.Now() directly — so tests can drive simulated time deterministically.
//
// In production pass SystemClock (wraps time.Now). In tests pass a *FakeClock you
// advance by hand.
type Clock interface {
	Now() time.Time
}

// SystemClock is the production Clock backed by time.Now (UTC).
type SystemClock struct{}

// Now returns the current UTC wall-clock time.
func (SystemClock) Now() time.Time { return time.Now().UTC() }

// FakeClock is a test Clock whose time only moves when you Advance / Set it.
// It is safe for single-goroutine test use (the scheduler tests drive it serially).
type FakeClock struct {
	t time.Time
}

// NewFakeClock returns a FakeClock pinned to start (normalised to UTC).
func NewFakeClock(start time.Time) *FakeClock { return &FakeClock{t: start.UTC()} }

// Now returns the fake clock's current time.
func (f *FakeClock) Now() time.Time { return f.t }

// Advance moves the fake clock forward by d and returns the new time.
func (f *FakeClock) Advance(d time.Duration) time.Time { f.t = f.t.Add(d); return f.t }

// Set jumps the fake clock to an absolute time (normalised to UTC).
func (f *FakeClock) Set(t time.Time) { f.t = t.UTC() }
