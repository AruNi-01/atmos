//! App/terminal `kind:frame` AEAD. Routing fields stay plaintext.

use std::collections::HashMap;
use std::sync::atomic::{AtomicU32, Ordering};
use std::sync::{Arc, Mutex, RwLock};

use base64::{engine::general_purpose::STANDARD as B64, Engine as _};
use serde::Deserialize;
use tokio::sync::mpsc;
use tokio_tungstenite::tungstenite::Message;

use super::e2ee::{self, SessionKey};

pub const KIND_C2S: &str = "frame_c2s";
pub const KIND_S2C: &str = "frame_s2c";

pub struct FrameSession {
    key: SessionKey,
    eph_pk: String,
    expected_c2s: AtomicU32,
    next_s2c: Mutex<u32>,
}

pub type FrameE2eeSessions = Arc<RwLock<HashMap<String, Arc<FrameSession>>>>;

#[derive(Debug, Deserialize)]
struct E2eeOpenBody {
    #[serde(default)]
    v: u32,
    alg: String,
    eph_pk: String,
}

pub fn new_session_map() -> FrameE2eeSessions {
    Arc::new(RwLock::new(HashMap::new()))
}

pub fn frame_aad(eph_pk: &str, stream: &str, seq: u32, kind: &str) -> Vec<u8> {
    format!("{eph_pk}|{stream}|{seq}|{kind}").into_bytes()
}

fn write_map(
    map: &FrameE2eeSessions,
) -> std::sync::RwLockWriteGuard<'_, HashMap<String, Arc<FrameSession>>> {
    map.write().unwrap_or_else(|poisoned| poisoned.into_inner())
}

fn read_map(
    map: &FrameE2eeSessions,
) -> std::sync::RwLockReadGuard<'_, HashMap<String, Arc<FrameSession>>> {
    map.read().unwrap_or_else(|poisoned| poisoned.into_inner())
}

pub fn open_from_e2ee_open(body: &str) -> Result<Arc<FrameSession>, &'static str> {
    let parsed: E2eeOpenBody = serde_json::from_str(body).map_err(|_| "e2ee_invalid_open")?;
    if parsed.alg != e2ee::ALG || (parsed.v != 0 && parsed.v != e2ee::VERSION) {
        return Err("e2ee_unsupported");
    }
    let key = e2ee::session_from_eph_pk(&parsed.eph_pk)?;
    Ok(Arc::new(FrameSession {
        key,
        eph_pk: parsed.eph_pk,
        expected_c2s: AtomicU32::new(0),
        next_s2c: Mutex::new(0),
    }))
}

pub fn insert_session(map: &FrameE2eeSessions, sid: String, session: Arc<FrameSession>) {
    let mut locked = write_map(map);
    if let Some(existing) = locked.get(&sid) {
        if existing.eph_pk == session.eph_pk {
            return;
        }
    }
    locked.insert(sid, session);
}

pub fn remove_session(map: &FrameE2eeSessions, sid: &str) {
    write_map(map).remove(sid);
}

pub fn open_c2s(
    map: &FrameE2eeSessions,
    sid: &str,
    stream: &str,
    body: &str,
) -> Result<String, &'static str> {
    let session = read_map(map).get(sid).cloned();
    let Some(session) = session else {
        return Ok(body.to_string());
    };
    let record = B64.decode(body.trim()).map_err(|_| "e2ee_invalid_frame")?;
    let seq = session.expected_c2s.load(Ordering::SeqCst);
    let aad = frame_aad(&session.eph_pk, stream, seq, KIND_C2S);
    let plain = session.key.open(&aad, &record)?;
    session
        .expected_c2s
        .store(seq.wrapping_add(1), Ordering::SeqCst);
    String::from_utf8(plain).map_err(|_| "e2ee_invalid_frame")
}

pub fn emit_frame(
    out: &mpsc::UnboundedSender<Message>,
    map: &FrameE2eeSessions,
    sid: &str,
    stream: &str,
    body: String,
) {
    let session = read_map(map).get(sid).cloned();
    if let Some(session) = session {
        let mut locked = session
            .next_s2c
            .lock()
            .unwrap_or_else(|poisoned| poisoned.into_inner());
        let seq = *locked;
        *locked = seq.wrapping_add(1);
        let aad = frame_aad(&session.eph_pk, stream, seq, KIND_S2C);
        let record = match session.key.seal(&aad, body.as_bytes()) {
            Ok(record) => record,
            Err(_) => return,
        };
        let body = B64.encode(&record);
        let outbound = serde_json::json!({
            "v": 1_u32,
            "stream": stream,
            "kind": "frame",
            "from": "server",
            "to": format!("client:{sid}"),
            "body": body,
        })
        .to_string();
        let _ = out.send(Message::Text(outbound));
        return;
    }
    let outbound = serde_json::json!({
        "v": 1_u32,
        "stream": stream,
        "kind": "frame",
        "from": "server",
        "to": format!("client:{sid}"),
        "body": body,
    })
    .to_string();
    let _ = out.send(Message::Text(outbound));
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::relay::e2ee::E2eeTestEnv;

    #[test]
    fn frame_roundtrip_and_unexpected_seq() {
        let dir = std::env::temp_dir().join(format!("atmos-e2ee-frame-{}", std::process::id()));
        let _ = std::fs::create_dir_all(&dir);
        let path = dir.join("relay_e2ee.json");
        let _ = std::fs::remove_file(&path);
        let _env = E2eeTestEnv::lock_path(&path);
        let static_key = e2ee::load_or_create_static_key().unwrap();
        let eph_secret = x25519_dalek::StaticSecret::random_from_rng(rand_core::OsRng);
        let eph_public = x25519_dalek::PublicKey::from(&eph_secret);
        let eph_pk = base64::engine::general_purpose::URL_SAFE_NO_PAD.encode(eph_public.as_bytes());
        let client =
            SessionKey::derive_from_eph(&eph_secret, &eph_public, &static_key.public_bytes())
                .unwrap();
        let map = new_session_map();
        insert_session(
            &map,
            "sid-1".into(),
            open_from_e2ee_open(&format!(
                r#"{{"v":1,"alg":"{}","eph_pk":"{eph_pk}"}}"#,
                e2ee::ALG
            ))
            .unwrap(),
        );
        let sealed = client
            .seal(&frame_aad(&eph_pk, "app", 0, KIND_C2S), b"hello-frame")
            .unwrap();
        let opened = open_c2s(&map, "sid-1", "app", &B64.encode(&sealed)).unwrap();
        assert_eq!(opened, "hello-frame");
        let replay = open_c2s(&map, "sid-1", "app", &B64.encode(&sealed));
        assert_eq!(replay.unwrap_err(), "e2ee_open_failed");
        insert_session(
            &map,
            "sid-1".into(),
            open_from_e2ee_open(&format!(
                r#"{{"v":1,"alg":"{}","eph_pk":"{eph_pk}"}}"#,
                e2ee::ALG
            ))
            .unwrap(),
        );
        let second = client
            .seal(&frame_aad(&eph_pk, "app", 1, KIND_C2S), b"again")
            .unwrap();
        assert_eq!(
            open_c2s(&map, "sid-1", "app", &B64.encode(&second)).unwrap(),
            "again"
        );
        drop(_env);
        let _ = std::fs::remove_file(&path);
        let _ = std::fs::remove_dir(&dir);
    }

    #[test]
    fn plaintext_passthrough_without_session() {
        let map = new_session_map();
        assert_eq!(
            open_c2s(
                &map,
                "sid-plain",
                "terminal",
                r#"{"type":"terminal_input"}"#
            )
            .unwrap(),
            r#"{"type":"terminal_input"}"#
        );
    }
}
