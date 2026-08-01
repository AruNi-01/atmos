//! Chromium cookie value decryption (macOS `v10`/`v11`).
//!
//! Algorithm (unchanged from the proven `quota-usage` implementation):
//!   Keychain passphrase -> PBKDF2-HMAC-SHA1(pass, "saltysalt", 1003, 16 bytes)
//!   -> AES-128-CBC (IV = 16 x 0x20) -> strip `v10`/`v11` prefix
//!   -> strip optional 32-byte SHA-256 host-hash prefix.
//! macOS has no App-Bound Encryption (`v20` is Windows-only).

use aes::cipher::{block_padding::Pkcs7, BlockDecryptMut, KeyIvInit};
use aes::Aes128;
use cbc::Decryptor;
use pbkdf2::pbkdf2_hmac;
use sha1::Sha1;
use sha2::{Digest, Sha256};

/// Failure modes for a single-cookie decrypt. The caller maps these onto the
/// per-row `skipped_*` accounting.
#[derive(Debug, Clone, PartialEq, Eq)]
pub enum DecryptError {
    /// Payload was not a recognized `v10`/`v11` Chromium blob.
    UnsupportedFormat,
    /// AES/CBC/padding failure.
    Crypt(String),
    /// Decrypted bytes were not valid UTF-8.
    Utf8,
}

/// Derive the AES-128 key from a Safe Storage passphrase.
pub fn chromium_cookie_key(passphrase: &str) -> [u8; 16] {
    let mut key = [0u8; 16];
    pbkdf2_hmac::<Sha1>(passphrase.as_bytes(), b"saltysalt", 1003, &mut key);
    key
}

/// Decrypt one Chromium `encrypted_value` BLOB into plaintext.
///
/// `encrypted` is the raw BLOB bytes (NOT hex). `host_key` is the cookie's
/// `host_key` column, used to strip the optional SHA-256 host-hash prefix that
/// newer Chromium builds prepend to the plaintext.
pub fn decrypt_chromium_value(
    encrypted: &[u8],
    host_key: &str,
    passphrase: &str,
) -> Result<String, DecryptError> {
    let Some(ciphertext) = encrypted
        .strip_prefix(b"v10")
        .or_else(|| encrypted.strip_prefix(b"v11"))
    else {
        return Err(DecryptError::UnsupportedFormat);
    };

    let key = chromium_cookie_key(passphrase);
    let iv = [b' '; 16];
    let mut buffer = ciphertext.to_vec();
    let plaintext = Decryptor::<Aes128>::new(&key.into(), &iv.into())
        .decrypt_padded_mut::<Pkcs7>(&mut buffer)
        .map_err(|error| DecryptError::Crypt(error.to_string()))?
        .to_vec();

    let plaintext = strip_host_hash_prefix(host_key, plaintext);
    String::from_utf8(plaintext).map_err(|_| DecryptError::Utf8)
}

/// Newer Chromium prepends `SHA-256(host_key)` (32 bytes) to the plaintext.
/// Strip it if present (tries both the dotted and undotted host).
fn strip_host_hash_prefix(host_key: &str, plaintext: Vec<u8>) -> Vec<u8> {
    // Must be `< 32` (not `<= 32`): a plaintext of exactly 32 bytes can be a
    // bare host-hash prefix followed by an EMPTY value. Bailing out at 32 would
    // leak the 32 digest bytes as the cookie value. Reaching the digest compare
    // lets the empty-value case return an empty `Vec` via `plaintext[32..]`.
    if plaintext.len() < 32 {
        return plaintext;
    }

    let trimmed_host = host_key.trim_start_matches('.');
    let trimmed_digest = Sha256::digest(trimmed_host.as_bytes());
    if plaintext[..32] == trimmed_digest[..] {
        return plaintext[32..].to_vec();
    }

    let full_digest = Sha256::digest(host_key.as_bytes());
    if plaintext[..32] == full_digest[..] {
        return plaintext[32..].to_vec();
    }

    plaintext
}

/// Encrypt a value the way Chromium (`v10`) would, for synthetic test fixtures.
/// NOT used in production — only compiled for tests.
#[cfg(test)]
pub(crate) fn encrypt_chromium_value_v10(
    plaintext: &str,
    host_key: &str,
    passphrase: &str,
    with_host_hash: bool,
) -> Vec<u8> {
    use aes::cipher::BlockEncryptMut;
    type Encryptor = cbc::Encryptor<Aes128>;

    let key = chromium_cookie_key(passphrase);
    let iv = [b' '; 16];

    let mut inner = Vec::new();
    if with_host_hash {
        let trimmed = host_key.trim_start_matches('.');
        inner.extend_from_slice(&Sha256::digest(trimmed.as_bytes()));
    }
    inner.extend_from_slice(plaintext.as_bytes());

    // In-place PKCS7 encrypt (no `alloc` cipher feature required): the buffer
    // must be a multiple of the 16-byte block size and large enough for the
    // padding block.
    let msg_len = inner.len();
    let padded_len = (msg_len / 16 + 1) * 16;
    let mut buffer = inner;
    buffer.resize(padded_len, 0);
    let ciphertext = Encryptor::new(&key.into(), &iv.into())
        .encrypt_padded_mut::<Pkcs7>(&mut buffer, msg_len)
        .expect("encrypt fixture")
        .to_vec();

    let mut out = b"v10".to_vec();
    out.extend_from_slice(&ciphertext);
    out
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn round_trips_without_host_hash() {
        let enc = encrypt_chromium_value_v10("session=abc123", "example.com", "pass", false);
        let out = decrypt_chromium_value(&enc, "example.com", "pass").unwrap();
        assert_eq!(out, "session=abc123");
    }

    #[test]
    fn round_trips_with_host_hash_prefix() {
        let enc = encrypt_chromium_value_v10("tok", ".example.com", "pw", true);
        // host_key with leading dot; strip should match trimmed host digest.
        let out = decrypt_chromium_value(&enc, ".example.com", "pw").unwrap();
        assert_eq!(out, "tok");
    }

    #[test]
    fn empty_value_with_host_hash_returns_empty_not_digest() {
        // A 32-byte plaintext == host-hash prefix + EMPTY value. The digest
        // bytes must be stripped, yielding "" rather than leaking the digest.
        let enc = encrypt_chromium_value_v10("", "example.com", "pw", true);
        let out = decrypt_chromium_value(&enc, "example.com", "pw").unwrap();
        assert_eq!(out, "");
    }

    #[test]
    fn wrong_passphrase_fails_decrypt() {
        let enc = encrypt_chromium_value_v10("value", "h", "right", false);
        let err = decrypt_chromium_value(&enc, "h", "wrong").unwrap_err();
        // Padding validation fails with the wrong key.
        assert!(matches!(err, DecryptError::Crypt(_) | DecryptError::Utf8));
    }

    #[test]
    fn unsupported_format_reported() {
        let err = decrypt_chromium_value(b"v20garbage", "h", "p").unwrap_err();
        assert_eq!(err, DecryptError::UnsupportedFormat);
    }
}
