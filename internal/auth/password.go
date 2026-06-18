package auth

import (
	"crypto/rand"
	"crypto/subtle"
	"encoding/base64"
	"errors"
	"fmt"
	"strings"

	"golang.org/x/crypto/argon2"
)

// argon2Params holds the cost parameters for argon2id.
// These match OWASP recommended minimums for interactive logins.
var argon2Params = struct {
	time    uint32
	memory  uint32
	threads uint8
	keyLen  uint32
}{
	time:    1,
	memory:  64 * 1024, // 64 MB
	threads: 4,
	keyLen:  32,
}

// HashPassword hashes the plaintext password using argon2id and returns
// a PHC-formatted string: $argon2id$v=19$m=...,t=...,p=...$<salt>$<hash>
func HashPassword(plaintext string) (string, error) {
	salt := make([]byte, 16)
	if _, err := rand.Read(salt); err != nil {
		return "", fmt.Errorf("auth: generate salt: %w", err)
	}

	p := argon2Params
	hash := argon2.IDKey([]byte(plaintext), salt, p.time, p.memory, p.threads, p.keyLen)

	b64Salt := base64.RawStdEncoding.EncodeToString(salt)
	b64Hash := base64.RawStdEncoding.EncodeToString(hash)

	encoded := fmt.Sprintf("$argon2id$v=%d$m=%d,t=%d,p=%d$%s$%s",
		argon2.Version, p.memory, p.time, p.threads, b64Salt, b64Hash)
	return encoded, nil
}

// VerifyPassword checks plaintext against a stored PHC-formatted argon2id hash.
// Returns nil if they match, ErrPasswordMismatch otherwise.
func VerifyPassword(plaintext, encoded string) error {
	p, salt, hash, err := decodeArgon2(encoded)
	if err != nil {
		return fmt.Errorf("auth: decode hash: %w", err)
	}

	other := argon2.IDKey([]byte(plaintext), salt, p.time, p.memory, p.threads, p.keyLen)
	if subtle.ConstantTimeCompare(hash, other) != 1 {
		return ErrPasswordMismatch
	}
	return nil
}

// ErrPasswordMismatch is returned when VerifyPassword finds a wrong password.
var ErrPasswordMismatch = errors.New("auth: password mismatch")

// decodeArgon2 parses a PHC-encoded argon2id string.
func decodeArgon2(encoded string) (params struct {
	time    uint32
	memory  uint32
	threads uint8
	keyLen  uint32
}, salt, hash []byte, err error) {
	parts := strings.Split(encoded, "$")
	// Expected: ["", "argon2id", "v=19", "m=64,t=1,p=4", "<salt>", "<hash>"]
	if len(parts) != 6 {
		err = fmt.Errorf("invalid hash format: expected 6 parts, got %d", len(parts))
		return
	}
	if parts[1] != "argon2id" {
		err = fmt.Errorf("unsupported algorithm: %s", parts[1])
		return
	}

	var version int
	if _, scanErr := fmt.Sscanf(parts[2], "v=%d", &version); scanErr != nil {
		err = fmt.Errorf("parse version: %w", scanErr)
		return
	}
	if version != argon2.Version {
		err = fmt.Errorf("unsupported argon2 version: %d", version)
		return
	}

	if _, scanErr := fmt.Sscanf(parts[3], "m=%d,t=%d,p=%d", &params.memory, &params.time, &params.threads); scanErr != nil {
		err = fmt.Errorf("parse params: %w", scanErr)
		return
	}

	salt, err = base64.RawStdEncoding.DecodeString(parts[4])
	if err != nil {
		err = fmt.Errorf("decode salt: %w", err)
		return
	}

	hash, err = base64.RawStdEncoding.DecodeString(parts[5])
	if err != nil {
		err = fmt.Errorf("decode hash: %w", err)
		return
	}

	params.keyLen = uint32(len(hash))
	return
}
