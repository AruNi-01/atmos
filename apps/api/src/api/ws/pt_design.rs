//! Local PT Design collab room — same wire as Relay `PtDesignRoom`.
//!
//! Used when the user and their Agent are on this machine. Ciphertext only;
//! the API never sees the room key or scene JSON.

use std::collections::HashMap;
use std::sync::Arc;

use axum::{
    extract::{
        ws::{Message, WebSocket},
        Path, State, WebSocketUpgrade,
    },
    http::StatusCode,
    response::IntoResponse,
    Json,
};
use futures_util::{SinkExt, StreamExt};
use serde::{Deserialize, Serialize};
use tokio::sync::{mpsc, Mutex};
use uuid::Uuid;

use crate::app_state::AppState;

const MAX_MESSAGE_CHARS: usize = 1_000_000;

#[derive(Clone, Default)]
pub struct PtDesignHub {
    rooms: Arc<Mutex<HashMap<String, Arc<Mutex<Room>>>>>,
}

struct Room {
    peers: HashMap<String, mpsc::UnboundedSender<String>>,
}

#[derive(Debug, Deserialize)]
struct ClientFrame {
    t: String,
    payload: Option<String>,
    iv: Option<String>,
}

#[derive(Debug, Serialize)]
#[serde(tag = "t")]
enum ServerFrame<'a> {
    #[serde(rename = "ready")]
    Ready {
        #[serde(rename = "socketId")]
        socket_id: String,
    },
    #[serde(rename = "new-user")]
    NewUser {
        #[serde(rename = "socketId")]
        socket_id: String,
    },
    #[serde(rename = "room-user-change")]
    RoomUserChange { clients: Vec<String> },
    #[serde(rename = "client-broadcast")]
    ClientBroadcast { payload: &'a str, iv: &'a str },
}

impl PtDesignHub {
    pub fn new() -> Self {
        Self::default()
    }

    async fn room(&self, room_id: &str) -> Arc<Mutex<Room>> {
        let mut rooms = self.rooms.lock().await;
        rooms
            .entry(room_id.to_ascii_lowercase())
            .or_insert_with(|| {
                Arc::new(Mutex::new(Room {
                    peers: HashMap::new(),
                }))
            })
            .clone()
    }

    async fn drop_if_empty(&self, room_id: &str) {
        let mut rooms = self.rooms.lock().await;
        let key = room_id.to_ascii_lowercase();
        let empty = match rooms.get(&key) {
            Some(room) => room.lock().await.peers.is_empty(),
            None => return,
        };
        if empty {
            rooms.remove(&key);
        }
    }
}

fn valid_room_id(room_id: &str) -> bool {
    let re = regex_lite_room_id(room_id);
    re
}

fn regex_lite_room_id(room_id: &str) -> bool {
    let bytes = room_id.as_bytes();
    if bytes.len() < 16 || bytes.len() > 64 {
        return false;
    }
    bytes.iter().all(|b| b.is_ascii_hexdigit())
}

fn parse_broadcast(raw: &str) -> Option<(String, String)> {
    if raw.len() > MAX_MESSAGE_CHARS {
        return None;
    }
    let parsed: ClientFrame = serde_json::from_str(raw).ok()?;
    if parsed.t != "broadcast" {
        return None;
    }
    let payload = parsed.payload?;
    let iv = parsed.iv?;
    if payload.len() + iv.len() > MAX_MESSAGE_CHARS {
        return None;
    }
    Some((payload, iv))
}

pub async fn health() -> impl IntoResponse {
    Json(serde_json::json!({ "ok": true, "hub": "local" }))
}

pub async fn ws_handler(
    ws: WebSocketUpgrade,
    Path(room_id): Path<String>,
    State(state): State<AppState>,
) -> impl IntoResponse {
    if !valid_room_id(&room_id) {
        return (StatusCode::BAD_REQUEST, "invalid room id").into_response();
    }
    let hub = state.pt_design_hub.clone();
    ws.on_upgrade(move |socket| handle_socket(socket, hub, room_id))
        .into_response()
}

async fn handle_socket(socket: WebSocket, hub: Arc<PtDesignHub>, room_id: String) {
    let socket_id = Uuid::new_v4().to_string();
    let (mut sink, mut stream) = socket.split();
    let (tx, mut rx) = mpsc::unbounded_channel::<String>();
    let room = hub.room(&room_id).await;

    {
        let mut locked = room.lock().await;
        locked.peers.insert(socket_id.clone(), tx);
        let clients: Vec<String> = locked.peers.keys().cloned().collect();
        let _ = send_locked(
            &mut locked,
            Some(&socket_id),
            &ServerFrame::NewUser {
                socket_id: socket_id.clone(),
            },
        );
        let _ = send_all_locked(&mut locked, &ServerFrame::RoomUserChange { clients });
    }

    let ready = serde_json::to_string(&ServerFrame::Ready {
        socket_id: socket_id.clone(),
    })
    .expect("ready frame");
    if sink.send(Message::Text(ready.into())).await.is_err() {
        remove_peer(&hub, &room, &room_id, &socket_id).await;
        return;
    }

    let send_task = tokio::spawn(async move {
        while let Some(msg) = rx.recv().await {
            if sink.send(Message::Text(msg.into())).await.is_err() {
                break;
            }
        }
    });

    while let Some(Ok(message)) = stream.next().await {
        let Message::Text(text) = message else {
            continue;
        };
        let Some((payload, iv)) = parse_broadcast(&text) else {
            continue;
        };
        let mut locked = room.lock().await;
        let _ = send_locked(
            &mut locked,
            Some(&socket_id),
            &ServerFrame::ClientBroadcast {
                payload: &payload,
                iv: &iv,
            },
        );
    }

    send_task.abort();
    remove_peer(&hub, &room, &room_id, &socket_id).await;
}

async fn remove_peer(hub: &PtDesignHub, room: &Arc<Mutex<Room>>, room_id: &str, socket_id: &str) {
    let clients = {
        let mut locked = room.lock().await;
        locked.peers.remove(socket_id);
        locked.peers.keys().cloned().collect::<Vec<_>>()
    };
    {
        let mut locked = room.lock().await;
        let _ = send_all_locked(&mut locked, &ServerFrame::RoomUserChange { clients });
    }
    hub.drop_if_empty(room_id).await;
}

fn send_all_locked(room: &mut Room, frame: &ServerFrame<'_>) -> Result<(), serde_json::Error> {
    let encoded = serde_json::to_string(frame)?;
    room.peers.retain(|_, tx| tx.send(encoded.clone()).is_ok());
    Ok(())
}

fn send_locked(
    room: &mut Room,
    except: Option<&str>,
    frame: &ServerFrame<'_>,
) -> Result<(), serde_json::Error> {
    let encoded = serde_json::to_string(frame)?;
    room.peers.retain(|id, tx| {
        if except.is_some_and(|skip| skip == id) {
            return true;
        }
        tx.send(encoded.clone()).is_ok()
    });
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn accepts_hex_room_ids() {
        assert!(valid_room_id("0123456789abcdef"));
        assert!(!valid_room_id("short"));
        assert!(!valid_room_id("not-hex-not-hex!!"));
    }

    #[test]
    fn parses_broadcast_frames() {
        let raw = r#"{"t":"broadcast","payload":"aaa","iv":"bbb"}"#;
        assert_eq!(parse_broadcast(raw), Some(("aaa".into(), "bbb".into())));
        assert_eq!(parse_broadcast(r#"{"t":"ready"}"#), None);
    }
}
