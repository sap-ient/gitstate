// Package crypto provides AES-256-GCM authenticated encryption for at-rest secrets
// such as repo access tokens (decisions S3/W3 note in PROGRESS.md).
//
// # Key derivation
//
// Encryption keys are derived from the TOKEN_ENC_KEY environment variable using
// SHA-256, producing a 32-byte (256-bit) key suitable for AES-256. Set
// TOKEN_ENC_KEY to a sufficiently random value (≥32 random bytes, base64 or hex
// encoded is fine; the raw env value is hashed so any non-empty string works).
//
// Example (.env / .env.example):
//
//	TOKEN_ENC_KEY=change-me-to-64-random-hex-chars-in-prod
//
// # Usage
//
//	key, err := KeyFromEnv()          // reads TOKEN_ENC_KEY
//	ct, err := Encrypt(plaintext, key)
//	pt, err := Decrypt(ct, key)
//
// The ciphertext is self-contained (nonce prepended); callers may store it as
// raw bytes in a bytea column without additional framing.
//
// Pure stdlib: crypto/aes, crypto/cipher, crypto/rand, crypto/sha256.
package crypto

import (
	"crypto/aes"
	"crypto/cipher"
	"crypto/rand"
	"crypto/sha256"
	"errors"
	"fmt"
	"io"
	"os"
)

// ErrKeyNotSet is returned by KeyFromEnv when TOKEN_ENC_KEY is absent.
var ErrKeyNotSet = errors.New("crypto: TOKEN_ENC_KEY environment variable is not set")

// KeyFromEnv reads the TOKEN_ENC_KEY env var and derives a 32-byte AES key
// from it using SHA-256. Any non-empty string is accepted; use a long random
// value in production (document in .env.example).
func KeyFromEnv() ([32]byte, error) {
	raw := os.Getenv("TOKEN_ENC_KEY")
	if raw == "" {
		return [32]byte{}, ErrKeyNotSet
	}
	return sha256.Sum256([]byte(raw)), nil
}

// Encrypt encrypts plaintext with AES-256-GCM using key.
// The returned ciphertext is: nonce (12 bytes) || GCM ciphertext+tag.
// key must be exactly 32 bytes.
func Encrypt(plaintext []byte, key [32]byte) ([]byte, error) {
	block, err := aes.NewCipher(key[:])
	if err != nil {
		return nil, fmt.Errorf("crypto: new cipher: %w", err)
	}
	gcm, err := cipher.NewGCM(block)
	if err != nil {
		return nil, fmt.Errorf("crypto: new gcm: %w", err)
	}

	nonce := make([]byte, gcm.NonceSize()) // 12 bytes
	if _, err := io.ReadFull(rand.Reader, nonce); err != nil {
		return nil, fmt.Errorf("crypto: generate nonce: %w", err)
	}

	// Seal appends the ciphertext+tag after nonce.
	ciphertext := gcm.Seal(nonce, nonce, plaintext, nil)
	return ciphertext, nil
}

// Decrypt decrypts ciphertext that was produced by Encrypt.
// ciphertext must be at least NonceSize bytes (nonce || tag || data).
// key must be exactly 32 bytes.
func Decrypt(ciphertext []byte, key [32]byte) ([]byte, error) {
	block, err := aes.NewCipher(key[:])
	if err != nil {
		return nil, fmt.Errorf("crypto: new cipher: %w", err)
	}
	gcm, err := cipher.NewGCM(block)
	if err != nil {
		return nil, fmt.Errorf("crypto: new gcm: %w", err)
	}

	ns := gcm.NonceSize()
	if len(ciphertext) < ns {
		return nil, errors.New("crypto: ciphertext too short")
	}

	nonce, data := ciphertext[:ns], ciphertext[ns:]
	plaintext, err := gcm.Open(nil, nonce, data, nil)
	if err != nil {
		return nil, fmt.Errorf("crypto: decrypt: %w", err)
	}
	return plaintext, nil
}
