//! Relay hop E2EE: Computer static X25519 + ChaCha20-Poly1305.
//!
//! Routing fields stay plaintext. HTTP chunk bodies and app/terminal
//! `kind:frame` bodies are sealed. Orthogonal to `register_token` /
//! `server_secret` / `client_token`.

use std::fs;
use std::io::Write;
use std::path::PathBuf;

use base64::engine::general_purpose::URL_SAFE_NO_PAD;
use base64::Engine as _;
use chacha20poly1305::aead::{Aead, AeadCore, KeyInit, Payload};
use chacha20poly1305::{ChaCha20Poly1305, Nonce};
use hkdf::Hkdf;
use rand_core::OsRng;
use serde::{Deserialize, Serialize};
use sha2::Sha256;
use x25519_dalek::{PublicKey, StaticSecret};

pub const ALG: &str = "x25519-chacha20poly1305";
pub const VERSION: u32 = 1;
pub const HKDF_INFO: &[u8] = b"atmos-relay-http-e2ee-v1";
pub const FILE_NAME: &str = "relay_e2ee.json";
const KEY_LEN: usize = 32;
const NONCE_LEN: usize = 12;
const TAG_LEN: usize = 16;

#[derive(Debug, Clone, Serialize, Deserialize)]
struct KeyFile {
    version: u32,
    alg: String,
    static_sk: String,
    static_pk: String,
}

pub struct StaticKey {
    secret: StaticSecret,
    public: PublicKey,
}

impl StaticKey {
    #[cfg(test)]
    pub fn public_bytes(&self) -> [u8; KEY_LEN] {
        *self.public.as_bytes()
    }

    pub fn public_b64(&self) -> String {
        URL_SAFE_NO_PAD.encode(self.public.as_bytes())
    }
}

#[derive(Clone)]
pub struct SessionKey {
    key: [u8; KEY_LEN],
}

impl SessionKey {
    pub fn derive(static_key: &StaticKey, eph_pk: &[u8]) -> Result<Self, &'static str> {
        let eph = public_from_slice(eph_pk)?;
        let shared = contributory_shared(&static_key.secret, &eph)?;
        Ok(Self {
            key: hkdf_session(&shared, eph.as_bytes(), static_key.public.as_bytes()),
        })
    }

    #[cfg(test)]
    pub fn derive_from_eph(
        eph_secret: &StaticSecret,
        eph_public: &PublicKey,
        static_pk: &[u8],
    ) -> Result<Self, &'static str> {
        let remote = public_from_slice(static_pk)?;
        let shared = contributory_shared(eph_secret, &remote)?;
        Ok(Self {
            key: hkdf_session(&shared, eph_public.as_bytes(), remote.as_bytes()),
        })
    }

    pub fn seal(&self, aad: &[u8], plaintext: &[u8]) -> Result<Vec<u8>, &'static str> {
        let nonce = ChaCha20Poly1305::generate_nonce(&mut OsRng);
        seal_record(&self.key, aad, plaintext, nonce.into())
    }

    pub fn open(&self, aad: &[u8], record: &[u8]) -> Result<Vec<u8>, &'static str> {
        if record.len() < NONCE_LEN + TAG_LEN {
            return Err("e2ee_record_truncated");
        }
        let cipher = ChaCha20Poly1305::new_from_slice(&self.key).map_err(|_| "e2ee_key")?;
        let nonce_bytes: [u8; NONCE_LEN] = record[..NONCE_LEN]
            .try_into()
            .map_err(|_| "e2ee_record_truncated")?;
        let nonce = Nonce::from(nonce_bytes);
        cipher
            .decrypt(
                &nonce,
                Payload {
                    msg: &record[NONCE_LEN..],
                    aad,
                },
            )
            .map_err(|_| "e2ee_open_failed")
    }
}

fn seal_record(
    key: &[u8; KEY_LEN],
    aad: &[u8],
    plaintext: &[u8],
    nonce_bytes: [u8; NONCE_LEN],
) -> Result<Vec<u8>, &'static str> {
    let cipher = ChaCha20Poly1305::new_from_slice(key).map_err(|_| "e2ee_key")?;
    let nonce = Nonce::from(nonce_bytes);
    let ciphertext = cipher
        .encrypt(
            &nonce,
            Payload {
                msg: plaintext,
                aad,
            },
        )
        .map_err(|_| "e2ee_seal_failed")?;
    let mut out = Vec::with_capacity(NONCE_LEN + ciphertext.len());
    out.extend_from_slice(&nonce_bytes);
    out.extend_from_slice(&ciphertext);
    Ok(out)
}

fn contributory_shared(
    secret: &StaticSecret,
    public: &PublicKey,
) -> Result<[u8; KEY_LEN], &'static str> {
    let shared = secret.diffie_hellman(public);
    if !shared.was_contributory() {
        return Err("e2ee_non_contributory");
    }
    Ok(*shared.as_bytes())
}

pub fn aad(request_id: &str, seq: u32, kind: &str) -> Vec<u8> {
    format!("{request_id}|{seq}|{kind}").into_bytes()
}

pub fn e2ee_enabled() -> bool {
    match std::env::var("ATMOS_RELAY_E2EE") {
        Ok(value) => {
            let trimmed = value.trim().to_ascii_lowercase();
            !matches!(trimmed.as_str(), "0" | "false" | "off" | "no")
        }
        Err(_) => true,
    }
}

pub fn resolve_e2ee_path() -> PathBuf {
    if let Some(raw) = std::env::var_os("ATMOS_RELAY_E2EE_PATH") {
        return PathBuf::from(raw);
    }
    runtime_manager::relay_e2ee_path()
        .unwrap_or_else(|_| PathBuf::from(".atmos").join("credentials").join(FILE_NAME))
}

pub fn load_or_create_static_key() -> Result<StaticKey, String> {
    let path = resolve_e2ee_path();
    if path.is_file() {
        return read_static_key(&path);
    }
    let secret = StaticSecret::random_from_rng(OsRng);
    let public = PublicKey::from(&secret);
    let file = KeyFile {
        version: VERSION,
        alg: ALG.to_string(),
        static_sk: URL_SAFE_NO_PAD.encode(secret.to_bytes()),
        static_pk: URL_SAFE_NO_PAD.encode(public.as_bytes()),
    };
    write_key_file(&path, &file)?;
    Ok(StaticKey { secret, public })
}

fn disabled_caps_body() -> String {
    serde_json::json!({
        "v": VERSION,
        "alg": ALG,
        "enabled": false,
    })
    .to_string()
}

pub fn advertise_caps_body() -> String {
    if !e2ee_enabled() {
        return disabled_caps_body();
    }
    match load_or_create_static_key() {
        Ok(key) => serde_json::json!({
            "v": VERSION,
            "alg": ALG,
            "enabled": true,
            "static_pk": key.public_b64(),
        })
        .to_string(),
        Err(error) => {
            tracing::warn!(
                target: "atmos_relay",
                error = %error,
                "relay e2ee key load failed; advertising disabled"
            );
            disabled_caps_body()
        }
    }
}

pub fn session_from_eph_pk(eph_pk_b64: &str) -> Result<SessionKey, &'static str> {
    if !e2ee_enabled() {
        return Err("e2ee_disabled");
    }
    let static_key = load_or_create_static_key().map_err(|_| "e2ee_key_unreadable")?;
    let eph_pk = URL_SAFE_NO_PAD
        .decode(eph_pk_b64.trim())
        .map_err(|_| "e2ee_invalid_eph_pk")?;
    SessionKey::derive(&static_key, &eph_pk)
}

fn hkdf_session(ikm: &[u8], eph_pk: &[u8], static_pk: &[u8]) -> [u8; KEY_LEN] {
    let mut salt = Vec::with_capacity(eph_pk.len() + static_pk.len());
    salt.extend_from_slice(eph_pk);
    salt.extend_from_slice(static_pk);
    let hk = Hkdf::<Sha256>::new(Some(&salt), ikm);
    // Scratch from CSPRNG, then fully overwritten by HKDF. Avoids a zero
    // array literal that CodeQL treats as a hard-coded AEAD key.
    let mut okm = StaticSecret::random_from_rng(OsRng).to_bytes();
    hk.expand(HKDF_INFO, &mut okm)
        .expect("hkdf expand 32 bytes");
    okm
}

fn public_from_slice(bytes: &[u8]) -> Result<PublicKey, &'static str> {
    let arr: [u8; KEY_LEN] = bytes.try_into().map_err(|_| "e2ee_invalid_public_key")?;
    Ok(PublicKey::from(arr))
}

fn read_static_key(path: &std::path::Path) -> Result<StaticKey, String> {
    let raw = fs::read_to_string(path)
        .map_err(|err| format!("Failed to read {}: {}", path.display(), err))?;
    let parsed: KeyFile = serde_json::from_str(&raw)
        .map_err(|err| format!("Failed to parse {}: {}", path.display(), err))?;
    if parsed.version != VERSION || parsed.alg != ALG {
        return Err(format!("Unsupported E2EE key file in {}", path.display()));
    }
    let sk_bytes = URL_SAFE_NO_PAD
        .decode(parsed.static_sk.trim())
        .map_err(|_| format!("Invalid static_sk in {}", path.display()))?;
    let arr: [u8; KEY_LEN] = sk_bytes
        .try_into()
        .map_err(|_| format!("Invalid static_sk length in {}", path.display()))?;
    let secret = StaticSecret::from(arr);
    let public = PublicKey::from(&secret);
    Ok(StaticKey { secret, public })
}

fn write_key_file(path: &std::path::Path, file: &KeyFile) -> Result<(), String> {
    let dir = path
        .parent()
        .ok_or_else(|| format!("E2EE path has no parent: {}", path.display()))?;
    fs::create_dir_all(dir)
        .map_err(|err| format!("Failed to create {}: {}", dir.display(), err))?;
    let payload = serde_json::to_string_pretty(file)
        .map_err(|err| format!("Failed to serialize {FILE_NAME}: {err}"))?;
    write_restricted(path, &format!("{payload}\n"))
}

fn write_restricted(path: &std::path::Path, contents: &str) -> Result<(), String> {
    #[cfg(unix)]
    {
        use std::os::unix::fs::OpenOptionsExt;
        let mut file = std::fs::OpenOptions::new()
            .create(true)
            .write(true)
            .truncate(true)
            .mode(0o600)
            .open(path)
            .map_err(|err| format!("Failed to write {}: {}", path.display(), err))?;
        file.write_all(contents.as_bytes())
            .map_err(|err| format!("Failed to write {}: {}", path.display(), err))?;
        Ok(())
    }
    #[cfg(not(unix))]
    {
        fs::write(path, contents)
            .map_err(|err| format!("Failed to write {}: {}", path.display(), err))?;
        Ok(())
    }
}

#[cfg(test)]
pub(crate) static E2EE_PATH_LOCK: std::sync::Mutex<()> = std::sync::Mutex::new(());

/// Serializes tests that mutate `ATMOS_RELAY_E2EE*` and restores them on drop.
#[cfg(test)]
pub(crate) struct E2eeTestEnv {
    _lock: std::sync::MutexGuard<'static, ()>,
    prev_path: Option<std::ffi::OsString>,
    prev_enabled: Option<std::ffi::OsString>,
}

#[cfg(test)]
impl E2eeTestEnv {
    pub(crate) fn lock_path(path: &std::path::Path) -> Self {
        let lock = E2EE_PATH_LOCK
            .lock()
            .unwrap_or_else(|poisoned| poisoned.into_inner());
        let prev_path = std::env::var_os("ATMOS_RELAY_E2EE_PATH");
        let prev_enabled = std::env::var_os("ATMOS_RELAY_E2EE");
        // SAFETY: caller holds E2EE_PATH_LOCK for the process env mutation.
        unsafe {
            std::env::set_var("ATMOS_RELAY_E2EE_PATH", path);
            std::env::remove_var("ATMOS_RELAY_E2EE");
        }
        Self {
            _lock: lock,
            prev_path,
            prev_enabled,
        }
    }

    pub(crate) fn disable(&self) {
        // SAFETY: caller holds E2EE_PATH_LOCK via this guard.
        unsafe {
            std::env::set_var("ATMOS_RELAY_E2EE", "0");
        }
    }
}

#[cfg(test)]
impl Drop for E2eeTestEnv {
    fn drop(&mut self) {
        // SAFETY: restores env under the same lock acquired in lock_path.
        unsafe {
            match &self.prev_path {
                Some(value) => std::env::set_var("ATMOS_RELAY_E2EE_PATH", value),
                None => std::env::remove_var("ATMOS_RELAY_E2EE_PATH"),
            }
            match &self.prev_enabled {
                Some(value) => std::env::set_var("ATMOS_RELAY_E2EE", value),
                None => std::env::remove_var("ATMOS_RELAY_E2EE"),
            }
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn hex32(s: &str) -> [u8; 32] {
        let mut out = [0u8; 32];
        for (i, chunk) in s.as_bytes().chunks(2).enumerate() {
            let byte = u8::from_str_radix(std::str::from_utf8(chunk).unwrap(), 16).unwrap();
            out[i] = byte;
        }
        out
    }

    #[test]
    fn rfc7748_shared_secret_and_roundtrip() {
        // RFC 7748 §6.1
        let alice_sk = StaticSecret::from(hex32(
            "77076d0a7318a57d3c16c17251b26645df4c2f87ebc0992ab177fba51db92c2a",
        ));
        let bob_sk = StaticSecret::from(hex32(
            "5dab087e624a8a4b79e17f8b83800ee66f3bb1292618b6fd1c2f8b27ff88e0eb",
        ));
        let alice_pk = PublicKey::from(&alice_sk);
        let bob_pk = PublicKey::from(&bob_sk);
        let alice = StaticKey {
            secret: alice_sk,
            public: alice_pk,
        };
        let from_computer = SessionKey::derive(&alice, bob_pk.as_bytes()).unwrap();
        let from_client =
            SessionKey::derive_from_eph(&bob_sk, &bob_pk, alice_pk.as_bytes()).unwrap();
        assert_eq!(from_computer.key, from_client.key);
        assert_eq!(
            hex32_str(&from_computer.key),
            "2087d263409ef4752e1bd67385cd6beb56a708c0f7035122e787f99713f53385"
        );

        let aad0 = aad("req-1", 0, "request_chunk");
        let sealed = from_client.seal(&aad0, b"hello-e2ee").unwrap();
        let opened = from_computer.open(&aad0, &sealed).unwrap();
        assert_eq!(opened, b"hello-e2ee");
        assert!(from_computer
            .open(&aad("req-1", 1, "request_chunk"), &sealed)
            .is_err());
        assert!(from_computer.open(&aad0, &sealed[..10]).is_err());
        assert!(matches!(
            SessionKey::derive(&alice, &[0u8; KEY_LEN]),
            Err("e2ee_non_contributory")
        ));
        let again = from_client.seal(&aad0, b"hello-e2ee").unwrap();
        assert_ne!(sealed, again, "each seal must use a fresh nonce");
    }

    fn hex32_str(bytes: &[u8]) -> String {
        bytes.iter().map(|byte| format!("{byte:02x}")).collect()
    }

    #[test]
    fn persist_roundtrip_under_override_path() {
        let dir = std::env::temp_dir().join(format!("atmos-e2ee-{}", std::process::id()));
        let path = dir.join("relay_e2ee.json");
        let _ = fs::remove_file(&path);
        let _env = E2eeTestEnv::lock_path(&path);
        let first = load_or_create_static_key().unwrap();
        let second = load_or_create_static_key().unwrap();
        assert_eq!(first.public_bytes(), second.public_bytes());
        drop(_env);
        let _ = fs::remove_file(&path);
        let _ = fs::remove_dir(&dir);
    }
}
