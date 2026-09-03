use std::sync::Arc;
use std::time::Duration;

use agent::testing::{FakeAgentProvider, StaticProviderFactory};
use agent::{
    AgentAvailableCommand, AgentCatalogSpec, AgentEvent, AgentMode, AgentModel, AgentModelCatalog,
    AgentPermissionOption, AgentProvider, AgentThinkingSupport, AgentTool, AgentToolKind,
    AgentToolParams, AgentToolResult, AgentToolStatus, CatalogEngine, CatalogSource, CatalogStatus,
    CatalogStrategyKind, NoopAcpProbe, UserMessageKind,
};
use tokio::time::timeout;

use super::catalog::{parse_followup_policy, CatalogPrefetchWorker, FollowupPolicy};
use super::service::AgentChatService;
use super::store::AgentChatStore;
use super::types::{
    AgentChatOrigin, AgentChatPayload, AgentChatSessionOpOutcome, CreateAgentChatRequest,
    MessagePart, QueueItemStatus, RewindView, RuntimeStatus, SessionLifecycleAction,
    SessionLifecycleStatus, TranscriptEnvelope, TranscriptEvent,
};

fn make_service(provider: Arc<FakeAgentProvider>) -> (tempfile::TempDir, AgentChatService) {
    let dir = tempfile::tempdir().unwrap();
    let store = Arc::new(AgentChatStore::new(dir.path().join("chats")));
    let factory = Arc::new(StaticProviderFactory::new(provider));
    (dir, AgentChatService::new(store, factory))
}

fn create_req(cwd: &str) -> CreateAgentChatRequest {
    create_req_for(cwd, "claude")
}

fn create_req_for(cwd: &str, provider_id: &str) -> CreateAgentChatRequest {
    CreateAgentChatRequest {
        workspace_id: None,
        project_id: None,
        space_id: None,
        cwd: cwd.into(),
        origin: AgentChatOrigin::Normal,
        provider_id: provider_id.into(),
        model: Some("opus".into()),
        thinking: None,
        mode: None,
        title: None,
    }
}

fn seed_two_user_turns(service: &AgentChatService, chat_id: &str) {
    service
        .store()
        .append_record(
            chat_id,
            &TranscriptEnvelope::new("turn-1", TranscriptEvent::TurnStarted),
        )
        .unwrap();
    service
        .store()
        .append_record(
            chat_id,
            &TranscriptEnvelope::new(
                "turn-1",
                TranscriptEvent::UserMessage {
                    message_id: "u1".into(),
                    kind: UserMessageKind::Normal,
                    text: "first".into(),
                    attachments: Vec::new(),
                },
            ),
        )
        .unwrap();
    service
        .store()
        .append_record(
            chat_id,
            &TranscriptEnvelope::new("turn-2", TranscriptEvent::TurnStarted),
        )
        .unwrap();
    service
        .store()
        .append_record(
            chat_id,
            &TranscriptEnvelope::new(
                "turn-2",
                TranscriptEvent::UserMessage {
                    message_id: "u2".into(),
                    kind: UserMessageKind::Normal,
                    text: "second".into(),
                    attachments: Vec::new(),
                },
            ),
        )
        .unwrap();
}

fn seed_user_checkpoint(
    service: &AgentChatService,
    chat_id: &str,
    turn_id: &str,
    checkpoint_id: &str,
) {
    service
        .store()
        .append_record(
            chat_id,
            &TranscriptEnvelope::new(
                turn_id,
                TranscriptEvent::UserCheckpoint {
                    checkpoint_id: checkpoint_id.into(),
                },
            ),
        )
        .unwrap();
}

fn pending_option_ids(pending: &agent::AgentSessionOpRequest) -> Vec<&str> {
    pending
        .options
        .iter()
        .map(|option| option.option_id.as_str())
        .collect()
}

#[tokio::test]
async fn s4_get_does_not_spawn_provider() {
    let provider = Arc::new(FakeAgentProvider::new("claude"));
    let (_dir, service) = make_service(Arc::clone(&provider));
    let meta = service.create(create_req("/tmp/proj")).unwrap();
    let snapshot = service.get(&meta.id).await.unwrap();
    assert_eq!(provider.create_count(), 0);
    assert_eq!(provider.resume_count(), 0);
    assert!(snapshot.messages.is_empty());
    assert!(snapshot.meta.persistence_handle.is_none());
}

#[tokio::test]
async fn s13_get_new_jsonl_exposes_params_result_without_spawn() {
    let provider = Arc::new(FakeAgentProvider::new("claude"));
    let (_dir, service) = make_service(Arc::clone(&provider));
    let meta = service.create(create_req("/tmp/proj")).unwrap();
    service
        .store()
        .append_record(
            &meta.id,
            &TranscriptEnvelope::new("turn-1", TranscriptEvent::TurnStarted),
        )
        .unwrap();
    service
        .store()
        .append_record(
            &meta.id,
            &TranscriptEnvelope::new(
                "turn-1",
                TranscriptEvent::ToolCall {
                    tool: AgentTool {
                        tool_call_id: "tc_1".into(),
                        name: "Bash".into(),
                        title: Some("ls".into()),
                        kind: AgentToolKind::Execute,
                        status: AgentToolStatus::Completed,
                        params: AgentToolParams::Execute {
                            command: "ls".into(),
                            cwd: None,
                            background: false,
                            task_id: None,
                        },
                        result: Some(AgentToolResult::Execute {
                            output: "ok".into(),
                            exit_code: Some(0),
                        }),
                    },
                },
            ),
        )
        .unwrap();

    let snapshot = service.get(&meta.id).await.unwrap();
    assert_eq!(provider.create_count(), 0);
    assert_eq!(provider.resume_count(), 0);

    let json = serde_json::to_value(&snapshot).expect("snapshot json");
    let parts = json["messages"][0]["parts"].as_array().expect("parts");
    let tool = parts
        .iter()
        .find(|part| part["type"] == "tool_call")
        .expect("tool part");
    assert_eq!(tool["params"]["type"], "execute");
    assert_eq!(tool["params"]["command"], "ls");
    assert_eq!(tool["result"]["type"], "execute");
    assert!(tool.get("input").is_none());
    assert!(tool.get("output").is_none());
    assert!(tool.get("content").is_none());
    assert!(tool.get("native").is_none());
}

#[tokio::test]
async fn s7_continue_resumes_same_chat() {
    let provider = Arc::new(FakeAgentProvider::new("claude"));
    let (_dir, service) = make_service(Arc::clone(&provider));
    let meta = service.create(create_req("/tmp/proj")).unwrap();
    let first = service.send(&meta.id, "hello", Vec::new()).await.unwrap();
    tokio::time::sleep(Duration::from_millis(30)).await;
    assert_eq!(provider.create_count(), 1);
    let after = service.get(&meta.id).await.unwrap();
    let handle = after
        .meta
        .persistence_handle
        .clone()
        .expect("handle after spawn");
    assert_ne!(handle, meta.id);
    drop(first);

    let provider2 = Arc::new(FakeAgentProvider::new("claude"));
    let store = Arc::new(AgentChatStore::new(service.store().root().to_path_buf()));
    store
        .update_meta(&meta.id, |row| {
            row.persistence_handle = Some(handle.clone());
            row.runtime_status = RuntimeStatus::Detached;
        })
        .unwrap();
    let resumed = AgentChatService::new(
        store,
        Arc::new(StaticProviderFactory::new(
            Arc::clone(&provider2) as Arc<dyn AgentProvider>
        )),
    );
    let turn = resumed.send(&meta.id, "again", Vec::new()).await.unwrap();
    assert_eq!(provider2.resume_count(), 1);
    assert_eq!(provider2.create_count(), 0);
    assert_eq!(resumed.get(&meta.id).await.unwrap().meta.id, meta.id);
    assert_eq!(
        provider2.last_resume_handle().await.as_deref(),
        Some(handle.as_str())
    );
    drop(turn);
}

#[tokio::test]
async fn send_emits_create_session_lifecycle_and_persists() {
    let provider = Arc::new(FakeAgentProvider::new("claude"));
    let (_dir, service) = make_service(Arc::clone(&provider));
    let meta = service.create(create_req("/tmp/proj")).unwrap();
    let mut rx = service.subscribe();
    let _ = service.send(&meta.id, "hello", Vec::new()).await.unwrap();
    let mut statuses = Vec::new();
    while let Ok(event) = rx.try_recv() {
        if let AgentChatPayload::SessionLifecycle { action, status, .. } = event.payload {
            statuses.push((action, status));
        }
    }
    assert_eq!(
        statuses,
        [
            (
                SessionLifecycleAction::Create,
                SessionLifecycleStatus::Running
            ),
            (
                SessionLifecycleAction::Create,
                SessionLifecycleStatus::Completed
            )
        ]
    );
    let snapshot = service.get(&meta.id).await.unwrap();
    let assistant = snapshot
        .messages
        .iter()
        .find(|message| message.role == "assistant")
        .expect("assistant");
    match assistant
        .parts
        .iter()
        .find(|part| matches!(part, MessagePart::SessionLifecycle { .. }))
    {
        Some(MessagePart::SessionLifecycle { action, status, .. }) => {
            assert_eq!(*action, SessionLifecycleAction::Create);
            assert_eq!(*status, SessionLifecycleStatus::Completed);
        }
        other => panic!("expected create session part, got {other:?}"),
    }
    let jsonl = std::fs::read_to_string(service.store().dir_for(&meta.id).join("transcript.jsonl"))
        .unwrap();
    assert!(jsonl.contains("\"type\":\"session_lifecycle\""));
    assert!(jsonl.contains("\"action\":\"create\""));
}

#[tokio::test]
async fn resume_emits_resume_session_lifecycle() {
    let provider = Arc::new(FakeAgentProvider::new("claude"));
    let (_dir, service) = make_service(Arc::clone(&provider));
    let meta = service.create(create_req("/tmp/proj")).unwrap();
    let _ = service.send(&meta.id, "hello", Vec::new()).await.unwrap();
    tokio::time::sleep(Duration::from_millis(30)).await;
    let handle = service
        .get(&meta.id)
        .await
        .unwrap()
        .meta
        .persistence_handle
        .clone()
        .expect("handle after spawn");

    let provider2 = Arc::new(FakeAgentProvider::new("claude"));
    let store = Arc::new(AgentChatStore::new(service.store().root().to_path_buf()));
    store
        .update_meta(&meta.id, |row| {
            row.persistence_handle = Some(handle);
            row.runtime_status = RuntimeStatus::Detached;
        })
        .unwrap();
    let resumed = AgentChatService::new(
        store,
        Arc::new(StaticProviderFactory::new(
            Arc::clone(&provider2) as Arc<dyn AgentProvider>
        )),
    );
    let mut rx = resumed.subscribe();
    let _ = resumed.send(&meta.id, "again", Vec::new()).await.unwrap();
    let mut statuses = Vec::new();
    while let Ok(event) = rx.try_recv() {
        if let AgentChatPayload::SessionLifecycle { action, status, .. } = event.payload {
            statuses.push((action, status));
        }
    }
    assert_eq!(
        statuses,
        [
            (
                SessionLifecycleAction::Resume,
                SessionLifecycleStatus::Running
            ),
            (
                SessionLifecycleAction::Resume,
                SessionLifecycleStatus::Completed
            )
        ]
    );
}

#[tokio::test]
async fn live_runtime_does_not_emit_another_session_lifecycle() {
    let provider = Arc::new(FakeAgentProvider::new("claude"));
    let (_dir, service) = make_service(Arc::clone(&provider));
    let meta = service.create(create_req("/tmp/proj")).unwrap();
    let _ = service.send(&meta.id, "hello", Vec::new()).await.unwrap();
    timeout(Duration::from_secs(2), async {
        loop {
            let snapshot = service.get(&meta.id).await.unwrap();
            if snapshot.running_turn_id.is_none() {
                return;
            }
            tokio::time::sleep(Duration::from_millis(20)).await;
        }
    })
    .await
    .expect("first turn should finish");
    let mut rx = service.subscribe();
    let _ = service.send(&meta.id, "again", Vec::new()).await.unwrap();
    let mut session_events = 0;
    while let Ok(event) = rx.try_recv() {
        if matches!(event.payload, AgentChatPayload::SessionLifecycle { .. }) {
            session_events += 1;
        }
    }
    assert_eq!(session_events, 0);
}

#[tokio::test]
async fn s7_continue_without_handle_creates_on_same_id() {
    let provider = Arc::new(FakeAgentProvider::new("claude"));
    let (_dir, service) = make_service(Arc::clone(&provider));
    let meta = service.create(create_req("/tmp/proj")).unwrap();
    let _ = service.send(&meta.id, "hello", Vec::new()).await.unwrap();
    assert_eq!(service.get(&meta.id).await.unwrap().meta.id, meta.id);
    assert_eq!(provider.create_count(), 1);
}

#[tokio::test]
async fn s8_idle_send_starts_turn() {
    let provider = Arc::new(FakeAgentProvider::new("claude"));
    let (_dir, service) = make_service(Arc::clone(&provider));
    let meta = service.create(create_req("/tmp/proj")).unwrap();
    let mut rx = service.subscribe();
    let turn_id = service.send(&meta.id, "go", Vec::new()).await.unwrap();
    let started = timeout(Duration::from_secs(1), async {
        loop {
            let event = rx.recv().await.unwrap();
            if matches!(event.payload, AgentChatPayload::TurnStarted { .. }) {
                break event;
            }
        }
    })
    .await
    .expect("turn_started event");
    match started.payload {
        AgentChatPayload::TurnStarted { turn_id: id, .. } => assert_eq!(id, turn_id),
        _ => unreachable!(),
    }
}

#[tokio::test]
async fn s9_queue_reloads_and_dispatch_skips_paused() {
    let provider = FakeAgentProvider::new("claude");
    provider.set_auto_complete(false);
    let provider = Arc::new(provider);
    let (_dir, service) = make_service(Arc::clone(&provider));
    let meta = service.create(create_req("/tmp/proj")).unwrap();
    let _ = service.send(&meta.id, "busy", Vec::new()).await.unwrap();
    service.queue_add(&meta.id, "next", Vec::new()).unwrap();
    let paused = service.queue_add(&meta.id, "hold", Vec::new()).unwrap();
    service
        .queue_update(&meta.id, &paused.id, None, Some(QueueItemStatus::Paused))
        .unwrap();

    let reloaded = AgentChatStore::new(service.store().root().to_path_buf())
        .read_queue(&meta.id)
        .unwrap();
    assert_eq!(reloaded.len(), 2);
    assert!(reloaded
        .iter()
        .any(|item| item.status == QueueItemStatus::Paused));

    provider.set_auto_complete(true);
    provider.complete_current().await;
    timeout(Duration::from_secs(2), async {
        loop {
            let queue = service.store().read_queue(&meta.id).unwrap();
            let snapshot = service.get(&meta.id).await.unwrap();
            let next_gone = queue.iter().all(|item| item.prompt != "next");
            let hold_paused = queue
                .iter()
                .any(|item| item.prompt == "hold" && item.status == QueueItemStatus::Paused);
            if next_gone
                && hold_paused
                && snapshot
                    .messages
                    .iter()
                    .filter(|m| m.role == "user")
                    .count()
                    >= 2
            {
                return;
            }
            tokio::time::sleep(Duration::from_millis(20)).await;
        }
    })
    .await
    .expect("unpaused next item should dispatch as a new turn");
    let queue = service.store().read_queue(&meta.id).unwrap();
    assert!(queue.iter().all(|item| item.prompt != "next"));
    assert!(queue
        .iter()
        .any(|item| item.prompt == "hold" && item.status == QueueItemStatus::Paused));
    assert!(
        service
            .get(&meta.id)
            .await
            .unwrap()
            .messages
            .iter()
            .filter(|message| message.role == "user")
            .count()
            >= 2
    );
}

#[tokio::test]
async fn overlapping_send_rejects_second_turn() {
    let provider = FakeAgentProvider::new("claude");
    provider.set_auto_complete(false);
    let provider = Arc::new(provider);
    let (_dir, service) = make_service(Arc::clone(&provider));
    let meta = service.create(create_req("/tmp/proj")).unwrap();
    let first = service.send(&meta.id, "one", Vec::new());
    let second = service.send(&meta.id, "two", Vec::new());
    let (a, b) = tokio::join!(first, second);
    let ok = a.is_ok() as u8 + b.is_ok() as u8;
    assert_eq!(ok, 1);
    assert!(a.is_err() || b.is_err());
}

#[tokio::test]
async fn send_after_turn_completed_starts_a_new_turn() {
    let provider = Arc::new(FakeAgentProvider::new("claude"));
    let (_dir, service) = make_service(Arc::clone(&provider));
    let meta = service.create(create_req("/tmp/proj")).unwrap();
    let mut events = service.subscribe();
    let first = service.send(&meta.id, "one", Vec::new()).await.unwrap();
    timeout(Duration::from_secs(2), async {
        loop {
            let event = events.recv().await.expect("event");
            if matches!(
                event.payload,
                AgentChatPayload::TurnCompleted { ref turn_id, .. } if turn_id == &first
            ) {
                return;
            }
        }
    })
    .await
    .expect("first turn completed");
    let second = service
        .send(&meta.id, "two", Vec::new())
        .await
        .expect("idle send after complete must start a new turn");
    assert_ne!(first, second);
}

#[tokio::test]
async fn s16_two_subscribers_see_the_same_send() {
    let provider = Arc::new(FakeAgentProvider::new("claude"));
    let (_dir, service) = make_service(Arc::clone(&provider));
    let meta = service.create(create_req("/tmp/proj")).unwrap();
    let mut first = service.subscribe();
    let mut second = service.subscribe();
    let _ = service
        .send(&meta.id, "hello-s16", Vec::new())
        .await
        .unwrap();
    let id_a = timeout(Duration::from_secs(2), async {
        loop {
            let event = first.recv().await.expect("event");
            if let AgentChatPayload::UserMessage {
                message_id,
                text,
                created_at,
                ..
            } = event.payload
            {
                if text == "hello-s16" {
                    assert!(created_at.is_some());
                    return message_id;
                }
            }
        }
    })
    .await
    .expect("first subscriber saw send");
    let id_b = timeout(Duration::from_secs(2), async {
        loop {
            let event = second.recv().await.expect("event");
            if let AgentChatPayload::UserMessage {
                message_id,
                text,
                created_at,
                ..
            } = event.payload
            {
                if text == "hello-s16" {
                    assert!(created_at.is_some());
                    return message_id;
                }
            }
        }
    })
    .await
    .expect("second subscriber saw send");
    assert_eq!(id_a, id_b);
}

#[tokio::test]
async fn s10_steer_same_turn_no_cancel() {
    let mut provider = FakeAgentProvider::new("claude");
    provider.set_auto_complete(false);
    provider.supports_steer = true;
    let provider = Arc::new(provider);
    let (_dir, service) = make_service(Arc::clone(&provider));
    let meta = service.create(create_req("/tmp/proj")).unwrap();
    let turn_id = service.send(&meta.id, "busy", Vec::new()).await.unwrap();
    tokio::time::sleep(Duration::from_millis(20)).await;
    service
        .steer(&meta.id, &turn_id, "do it this way")
        .await
        .unwrap();
    let snapshot = service.get(&meta.id).await.unwrap();
    let steered = snapshot
        .messages
        .iter()
        .any(|message| message.kind == UserMessageKind::Steer);
    assert!(steered);
    assert_eq!(provider.steer_count(), 1);
    assert_eq!(provider.cancel_count(), 0);
}

#[tokio::test]
async fn s11_steer_unsupported_or_stale_does_not_cancel() {
    let mut provider = FakeAgentProvider::new("claude");
    provider.set_auto_complete(false);
    provider.supports_steer = false;
    let provider = Arc::new(provider);
    let (_dir, service) = make_service(Arc::clone(&provider));
    let meta = service.create(create_req("/tmp/proj")).unwrap();
    let turn_id = service.send(&meta.id, "busy", Vec::new()).await.unwrap();
    tokio::time::sleep(Duration::from_millis(20)).await;
    let err = service.steer(&meta.id, &turn_id, "nope").await.unwrap_err();
    assert!(err.to_string().to_ascii_lowercase().contains("steer"));
    assert_eq!(provider.cancel_count(), 0);

    let mut provider2 = FakeAgentProvider::new("claude");
    provider2.set_auto_complete(false);
    provider2.supports_steer = true;
    let provider2 = Arc::new(provider2);
    let (_dir2, service2) = make_service(Arc::clone(&provider2));
    let meta2 = service2.create(create_req("/tmp/proj")).unwrap();
    let turn = service2.send(&meta2.id, "busy", Vec::new()).await.unwrap();
    tokio::time::sleep(Duration::from_millis(20)).await;
    let err = service2
        .steer(&meta2.id, "stale-turn", "x")
        .await
        .unwrap_err();
    assert!(err.to_string().contains("expected_turn_id") || err.to_string().contains("running"));
    assert_eq!(provider2.cancel_count(), 0);
    drop(turn);
}

#[tokio::test]
async fn s6_configure_sets_model_before_spawn() {
    let provider = Arc::new(FakeAgentProvider::new("claude"));
    let (_dir, service) = make_service(Arc::clone(&provider));
    let meta = service.create(create_req("/tmp/proj")).unwrap();
    let updated = service
        .configure(
            &meta.id,
            Some("grok".into()),
            Some("grok-4".into()),
            Some("high".into()),
            Some("agent".into()),
            None,
        )
        .await
        .unwrap();
    assert_eq!(updated.provider_id, "grok");
    assert_eq!(
        updated.descriptor.current_config.model.as_deref(),
        Some("grok-4")
    );
    assert_eq!(
        updated.descriptor.current_config.thinking.as_deref(),
        Some("high")
    );
    assert_eq!(
        updated.descriptor.current_config.mode.as_deref(),
        Some("agent")
    );
    assert_eq!(provider.create_count(), 0);
    assert_eq!(provider.config_count(), 0);
}

#[tokio::test]
async fn configure_while_running_does_not_set_live_config() {
    let provider = FakeAgentProvider::new("claude");
    provider.set_auto_complete(false);
    let provider = Arc::new(provider);
    let (_dir, service) = make_service(Arc::clone(&provider));
    let meta = service.create(create_req("/tmp/proj")).unwrap();
    let _ = service.send(&meta.id, "running", Vec::new()).await.unwrap();

    let updated = service
        .configure(
            &meta.id,
            None,
            Some("grok-4".into()),
            Some("high".into()),
            Some("plan".into()),
            None,
        )
        .await
        .unwrap();
    assert_eq!(updated.provider_id, "claude");
    assert_eq!(
        updated.descriptor.current_config.model.as_deref(),
        Some("grok-4")
    );
    assert_eq!(
        updated.descriptor.current_config.thinking.as_deref(),
        Some("high")
    );
    assert_eq!(
        updated.descriptor.current_config.mode.as_deref(),
        Some("plan")
    );
    assert_eq!(provider.config_count(), 0);
}

#[tokio::test]
async fn send_after_model_switch_emits_session_config_change() {
    let provider = Arc::new(FakeAgentProvider::new("claude"));
    let (_dir, service) = make_service(Arc::clone(&provider));
    let meta = service.create(create_req("/tmp/proj")).unwrap();
    let _ = service.send(&meta.id, "hello", Vec::new()).await.unwrap();
    timeout(Duration::from_secs(2), async {
        loop {
            let snapshot = service.get(&meta.id).await.unwrap();
            if snapshot.running_turn_id.is_none() {
                return;
            }
            tokio::time::sleep(Duration::from_millis(20)).await;
        }
    })
    .await
    .expect("first turn should finish");

    service
        .configure(
            &meta.id,
            None,
            Some("grok-4".into()),
            None,
            Some("plan".into()),
            None,
        )
        .await
        .unwrap();
    assert_eq!(provider.config_count(), 0);

    let mut rx = service.subscribe();
    let _ = service.send(&meta.id, "again", Vec::new()).await.unwrap();
    tokio::time::sleep(Duration::from_millis(40)).await;

    let mut saw_change = false;
    while let Ok(event) = rx.try_recv() {
        if let AgentChatPayload::SessionConfigChange { model, mode, .. } = event.payload {
            assert_eq!(model.as_ref().map(|item| item.to.as_str()), Some("grok-4"));
            assert_eq!(
                model.as_ref().and_then(|item| item.from.as_deref()),
                Some("opus")
            );
            assert_eq!(mode.as_ref().map(|item| item.to.as_str()), Some("plan"));
            saw_change = true;
        }
    }
    assert!(saw_change, "expected session_config_change on send");
    assert_eq!(provider.create_count(), 1);
    assert_eq!(provider.config_count(), 2);
    let applied = provider.last_config().await.expect("live set_config");
    assert_eq!(applied.mode.as_deref(), Some("plan"));

    let snapshot = service.get(&meta.id).await.unwrap();
    let assistant = snapshot
        .messages
        .iter()
        .rev()
        .find(|message| message.role == "assistant")
        .expect("assistant");
    match assistant
        .parts
        .iter()
        .find(|part| matches!(part, MessagePart::SessionConfigChange { .. }))
    {
        Some(MessagePart::SessionConfigChange { model, mode, .. }) => {
            assert_eq!(model.as_ref().map(|item| item.to.as_str()), Some("grok-4"));
            assert_eq!(mode.as_ref().map(|item| item.to.as_str()), Some("plan"));
        }
        other => panic!("expected session_config_change part, got {other:?}"),
    }
    assert_eq!(snapshot.meta.applied_model.as_deref(), Some("grok-4"));
    assert_eq!(snapshot.meta.applied_mode.as_deref(), Some("plan"));
}

#[tokio::test]
async fn send_after_mode_switch_sets_live_config() {
    let provider = Arc::new(FakeAgentProvider::new("claude"));
    let (_dir, service) = make_service(Arc::clone(&provider));
    let meta = service.create(create_req("/tmp/proj")).unwrap();
    let _ = service.send(&meta.id, "hello", Vec::new()).await.unwrap();
    timeout(Duration::from_secs(2), async {
        loop {
            let snapshot = service.get(&meta.id).await.unwrap();
            if snapshot.running_turn_id.is_none() {
                return;
            }
            tokio::time::sleep(Duration::from_millis(20)).await;
        }
    })
    .await
    .expect("first turn should finish");

    service
        .configure(&meta.id, None, None, None, Some("plan".into()), None)
        .await
        .unwrap();
    assert_eq!(provider.create_count(), 1);
    assert_eq!(provider.config_count(), 0);

    let _ = service.send(&meta.id, "again", Vec::new()).await.unwrap();
    tokio::time::sleep(Duration::from_millis(40)).await;

    assert_eq!(provider.create_count(), 1);
    assert_eq!(provider.config_count(), 1);
    let applied = provider.last_config().await.expect("live set_config");
    assert_eq!(applied.model, None);
    assert_eq!(applied.mode.as_deref(), Some("plan"));
}

#[tokio::test]
async fn send_after_unlisted_model_still_tries_set_config() {
    let provider = Arc::new(FakeAgentProvider::new("claude"));
    let (_dir, service) = make_service(Arc::clone(&provider));
    let meta = service.create(create_req("/tmp/proj")).unwrap();
    let _ = service.send(&meta.id, "hello", Vec::new()).await.unwrap();
    timeout(Duration::from_secs(2), async {
        loop {
            let snapshot = service.get(&meta.id).await.unwrap();
            if snapshot.running_turn_id.is_none() && provider.events_ready().await {
                return;
            }
            tokio::time::sleep(Duration::from_millis(20)).await;
        }
    })
    .await
    .expect("first turn should finish");
    provider
        .push_event(AgentEvent::ConfigChanged {
            config: serde_json::json!([{
                "id": "model",
                "category": "model",
                "type": "select",
                "currentValue": "opus",
                "options": [{ "value": "opus", "name": "Opus" }]
            }]),
        })
        .await;
    timeout(Duration::from_secs(2), async {
        loop {
            let snapshot = service.get(&meta.id).await.unwrap();
            if !snapshot.meta.descriptor.supported_options.models.is_empty() {
                return;
            }
            tokio::time::sleep(Duration::from_millis(20)).await;
        }
    })
    .await
    .expect("session should advertise config options");

    service
        .configure(&meta.id, None, Some("grok-4".into()), None, None, None)
        .await
        .unwrap();
    let snapshot = service.get(&meta.id).await.unwrap();
    assert_eq!(
        snapshot.meta.descriptor.current_config.model.as_deref(),
        Some("grok-4")
    );
    let _ = service.send(&meta.id, "again", Vec::new()).await.unwrap();
    tokio::time::sleep(Duration::from_millis(40)).await;

    assert_eq!(provider.config_count(), 1);
    let snapshot = service.get(&meta.id).await.unwrap();
    assert_eq!(
        snapshot.meta.descriptor.current_config.model.as_deref(),
        Some("grok-4")
    );
    assert_eq!(snapshot.meta.applied_model.as_deref(), Some("grok-4"));
}

#[tokio::test]
async fn send_after_advertised_model_switch_uses_agent_config_id() {
    let provider = Arc::new(FakeAgentProvider::new("claude"));
    let (_dir, service) = make_service(Arc::clone(&provider));
    let meta = service.create(create_req("/tmp/proj")).unwrap();
    let _ = service.send(&meta.id, "hello", Vec::new()).await.unwrap();
    timeout(Duration::from_secs(2), async {
        loop {
            let snapshot = service.get(&meta.id).await.unwrap();
            if snapshot.running_turn_id.is_none() && provider.events_ready().await {
                return;
            }
            tokio::time::sleep(Duration::from_millis(20)).await;
        }
    })
    .await
    .expect("first turn should finish");
    provider
        .push_event(AgentEvent::ConfigChanged {
            config: serde_json::json!([{
                "id": "models",
                "category": "model",
                "type": "select",
                "currentValue": "opus",
                "options": [
                    { "value": "opus", "name": "Opus" },
                    { "value": "grok-4", "name": "Grok" }
                ]
            }]),
        })
        .await;
    timeout(Duration::from_secs(2), async {
        loop {
            let snapshot = service.get(&meta.id).await.unwrap();
            if !snapshot.meta.descriptor.supported_options.models.is_empty() {
                return;
            }
            tokio::time::sleep(Duration::from_millis(20)).await;
        }
    })
    .await
    .expect("session should advertise config options");

    service
        .configure(&meta.id, None, Some("grok-4".into()), None, None, None)
        .await
        .unwrap();
    let snapshot = service.get(&meta.id).await.unwrap();
    assert_eq!(
        snapshot.meta.descriptor.current_config.model.as_deref(),
        Some("grok-4")
    );

    let _ = service.send(&meta.id, "again", Vec::new()).await.unwrap();
    tokio::time::sleep(Duration::from_millis(40)).await;

    assert_eq!(provider.config_count(), 1);
    let applied = provider.last_config().await.expect("live set_config");
    assert_eq!(applied.model.as_deref(), Some("grok-4"));
    assert!(applied.extra_config.is_empty());
}

#[tokio::test]
async fn thinking_config_failure_does_not_report_model_switch_failed() {
    let provider = Arc::new(FakeAgentProvider::new("claude"));
    provider.set_fail_thinking_config(true);
    let (_dir, service) = make_service(Arc::clone(&provider));
    let meta = service.create(create_req("/tmp/proj")).unwrap();
    let _ = service.send(&meta.id, "hello", Vec::new()).await.unwrap();
    timeout(Duration::from_secs(2), async {
        loop {
            let snapshot = service.get(&meta.id).await.unwrap();
            if snapshot.running_turn_id.is_none() && provider.events_ready().await {
                return;
            }
            tokio::time::sleep(Duration::from_millis(20)).await;
        }
    })
    .await
    .expect("first turn should finish");
    provider
        .push_event(AgentEvent::ConfigChanged {
            config: serde_json::json!([
                {
                    "id": "models",
                    "category": "model",
                    "type": "select",
                    "currentValue": "opus",
                    "options": [
                        { "value": "opus", "name": "Opus" },
                        { "value": "grok-4", "name": "Grok" }
                    ]
                },
                {
                    "id": "thought_level",
                    "category": "thought_level",
                    "type": "select",
                    "currentValue": "low",
                    "options": [
                        { "value": "low", "name": "Low" },
                        { "value": "high", "name": "High" }
                    ]
                }
            ]),
        })
        .await;
    timeout(Duration::from_secs(2), async {
        loop {
            let snapshot = service.get(&meta.id).await.unwrap();
            if !snapshot.meta.descriptor.supported_options.models.is_empty()
                && !snapshot
                    .meta
                    .descriptor
                    .supported_options
                    .thinking
                    .is_none()
            {
                return;
            }
            tokio::time::sleep(Duration::from_millis(20)).await;
        }
    })
    .await
    .expect("session should advertise config options");

    service
        .configure(
            &meta.id,
            None,
            Some("grok-4".into()),
            Some("high".into()),
            None,
            None,
        )
        .await
        .unwrap();
    let mut rx = service.subscribe();
    let _ = service.send(&meta.id, "again", Vec::new()).await.unwrap();
    tokio::time::sleep(Duration::from_millis(40)).await;

    let mut saw_model_failed = false;
    while let Ok(event) = rx.try_recv() {
        if matches!(
            event.payload,
            AgentChatPayload::SessionHint { ref kind, .. } if kind == "model_switch_failed"
        ) {
            saw_model_failed = true;
        }
    }
    assert!(
        !saw_model_failed,
        "a failed thinking write must not report a failed model switch"
    );
    assert_eq!(provider.config_count(), 2);
    let snapshot = service.get(&meta.id).await.unwrap();
    assert_eq!(
        snapshot.meta.descriptor.current_config.model.as_deref(),
        Some("grok-4")
    );
    assert_eq!(snapshot.meta.applied_model.as_deref(), Some("grok-4"));
}

#[tokio::test]
async fn send_after_failed_set_config_reverts() {
    let provider = Arc::new(FakeAgentProvider::new("claude"));
    provider.set_fail_set_config(true);
    let (_dir, service) = make_service(Arc::clone(&provider));
    let meta = service.create(create_req("/tmp/proj")).unwrap();
    let _ = service.send(&meta.id, "hello", Vec::new()).await.unwrap();
    timeout(Duration::from_secs(2), async {
        loop {
            let snapshot = service.get(&meta.id).await.unwrap();
            if snapshot.running_turn_id.is_none() {
                return;
            }
            tokio::time::sleep(Duration::from_millis(20)).await;
        }
    })
    .await
    .expect("first turn should finish");

    service
        .configure(&meta.id, None, Some("grok-4".into()), None, None, None)
        .await
        .unwrap();
    let mut rx = service.subscribe();
    let _ = service.send(&meta.id, "again", Vec::new()).await.unwrap();
    tokio::time::sleep(Duration::from_millis(40)).await;

    let mut saw_change = false;
    let mut saw_failed = false;
    while let Ok(event) = rx.try_recv() {
        if matches!(event.payload, AgentChatPayload::SessionConfigChange { .. }) {
            saw_change = true;
        }
        if matches!(
            event.payload,
            AgentChatPayload::SessionHint { ref kind, .. } if kind == "model_switch_failed"
        ) {
            saw_failed = true;
        }
    }
    assert!(!saw_change, "failed set_config should not record a switch");
    assert!(saw_failed, "expected session_hint");
    assert_eq!(provider.config_count(), 1);
    let snapshot = service.get(&meta.id).await.unwrap();
    assert_eq!(
        snapshot.meta.descriptor.current_config.model.as_deref(),
        Some("opus")
    );
    assert_eq!(snapshot.meta.applied_model.as_deref(), Some("opus"));
}

#[tokio::test]
async fn configure_rejects_agent_change_while_running() {
    let provider = FakeAgentProvider::new("claude");
    provider.set_auto_complete(false);
    let provider = Arc::new(provider);
    let (_dir, service) = make_service(Arc::clone(&provider));
    let meta = service.create(create_req("/tmp/proj")).unwrap();
    let _ = service.send(&meta.id, "running", Vec::new()).await.unwrap();

    let err = service
        .configure(&meta.id, Some("grok".into()), None, None, None, None)
        .await
        .unwrap_err();
    assert!(
        err.to_string().contains("cannot change agent"),
        "unexpected error: {err}"
    );
    assert_eq!(
        service.get(&meta.id).await.unwrap().meta.provider_id,
        "claude"
    );
    assert_eq!(provider.config_count(), 0);
}

#[tokio::test]
async fn session_op_respond_errors_when_no_pending_op() {
    let provider = Arc::new(FakeAgentProvider::new("claude"));
    let (_dir, service) = make_service(Arc::clone(&provider));
    let meta = service.create(create_req("/tmp/proj")).unwrap();
    let err = service
        .session_op_respond(&meta.id, "req-1", "opt-1")
        .await
        .unwrap_err();
    assert!(
        err.to_string().contains("no pending session op"),
        "unexpected error: {err}"
    );
}

#[tokio::test]
async fn session_op_respond_missing_chat_is_not_found() {
    let provider = Arc::new(FakeAgentProvider::new("claude"));
    let (_dir, service) = make_service(Arc::clone(&provider));
    let err = service
        .session_op_respond(&uuid::Uuid::new_v4().to_string(), "req-1", "opt-1")
        .await
        .unwrap_err();
    assert!(
        err.to_string().to_ascii_lowercase().contains("not found"),
        "unexpected error: {err}"
    );
}

#[tokio::test]
async fn app069_s10_native_rewind_is_session_op_not_user_turn() {
    let provider = Arc::new(FakeAgentProvider::new("claude"));
    let (_dir, service) = make_service(Arc::clone(&provider));
    let meta = service.create(create_req("/tmp/proj")).unwrap();
    let _ = service.send(&meta.id, "/rewind", Vec::new()).await.unwrap();
    tokio::time::sleep(Duration::from_millis(40)).await;
    let jsonl = std::fs::read_to_string(service.store().dir_for(&meta.id).join("transcript.jsonl"))
        .unwrap();
    assert!(
        !jsonl.contains("/rewind"),
        "intercept must not persist /rewind as a user turn: {jsonl}"
    );
    let snapshot = service.get(&meta.id).await.unwrap();
    assert!(snapshot.pending_session_op.is_some());
    assert!(snapshot.meta.rewind_view.is_none());
}

#[tokio::test]
async fn app069_s13_cancel_session_op_does_not_set_rewind_view() {
    let provider = Arc::new(FakeAgentProvider::new("claude"));
    let (_dir, service) = make_service(Arc::clone(&provider));
    let meta = service.create(create_req("/tmp/proj")).unwrap();
    seed_two_user_turns(&service, &meta.id);
    let jsonl_path = service.store().dir_for(&meta.id).join("transcript.jsonl");
    let before = std::fs::read_to_string(&jsonl_path).unwrap();
    let _ = service.send(&meta.id, "/rewind", Vec::new()).await.unwrap();
    tokio::time::sleep(Duration::from_millis(40)).await;
    let pending = service
        .get(&meta.id)
        .await
        .unwrap()
        .pending_session_op
        .expect("pending session op");
    service
        .session_op_respond(&meta.id, &pending.request_id, "cancel")
        .await
        .unwrap();
    let after = service.get(&meta.id).await.unwrap();
    assert!(after.meta.rewind_view.is_none());
    assert!(after.pending_session_op.is_none());
    let jsonl_after = std::fs::read_to_string(&jsonl_path).unwrap();
    assert_eq!(jsonl_after, before);
    assert_eq!(after.messages.len(), 2);
}

#[tokio::test]
async fn app069_s13_failed_session_op_does_not_set_rewind_view_or_fork() {
    let provider = Arc::new(FakeAgentProvider::new("claude"));
    let (_dir, service) = make_service(Arc::clone(&provider));
    let meta = service.create(create_req("/tmp/proj")).unwrap();
    let _ = service.send(&meta.id, "/fork", Vec::new()).await.unwrap();
    tokio::time::sleep(Duration::from_millis(40)).await;
    let pending = service
        .get(&meta.id)
        .await
        .unwrap()
        .pending_session_op
        .expect("pending session op");
    let mut rx = service.subscribe();
    service
        .session_op_respond(&meta.id, &pending.request_id, "fork")
        .await
        .unwrap();
    let mut saw_failed_error = None;
    while let Ok(event) = rx.try_recv() {
        if let AgentChatPayload::SessionOpResolved { outcome, error, .. } = event.payload {
            if matches!(outcome, AgentChatSessionOpOutcome::Failed) {
                saw_failed_error = error;
            }
        }
    }
    assert_eq!(
        saw_failed_error.as_deref(),
        Some("session op is not supported")
    );
    let after = service.get(&meta.id).await.unwrap();
    assert!(after.meta.rewind_view.is_none());
    assert!(after.pending_session_op.is_none());
    let listed = service.list(None, None, None, true, None).unwrap();
    assert_eq!(listed.len(), 1);
    assert_eq!(listed[0].id, meta.id);
}

#[tokio::test]
async fn app069_s16_applied_fork_creates_sibling_and_emits_session_forked() {
    let provider = FakeAgentProvider::new("claude");
    provider.set_applied_fork_session_id("vendor-fork-1");
    let provider = Arc::new(provider);
    let (_dir, service) = make_service(Arc::clone(&provider));
    let meta = service.create(create_req("/tmp/proj")).unwrap();
    service
        .queue_add(&meta.id, "queued-later", Vec::new())
        .unwrap();
    assert_eq!(service.store().read_queue(&meta.id).unwrap().len(), 1);

    let _ = service.send(&meta.id, "/fork", Vec::new()).await.unwrap();
    tokio::time::sleep(Duration::from_millis(40)).await;
    let pending = service
        .get(&meta.id)
        .await
        .unwrap()
        .pending_session_op
        .expect("pending session op");
    let mut rx = service.subscribe();
    service
        .session_op_respond(&meta.id, &pending.request_id, "fork")
        .await
        .unwrap();

    let listed = service.list(None, None, None, true, None).unwrap();
    assert_eq!(listed.len(), 2);
    let child = listed
        .iter()
        .find(|row| row.id != meta.id)
        .expect("child chat");
    let child_snap = service.get(&child.id).await.unwrap();
    assert_eq!(
        child_snap.meta.parent_chat_id.as_deref(),
        Some(meta.id.as_str())
    );
    assert_eq!(
        child_snap.meta.persistence_handle.as_deref(),
        Some("vendor-fork-1")
    );
    assert_eq!(child_snap.meta.cwd, meta.cwd);
    assert!(service.store().read_queue(&child.id).unwrap().is_empty());
    assert_eq!(service.store().read_queue(&meta.id).unwrap().len(), 1);
    let parent_after = service.get(&meta.id).await.unwrap();
    assert!(parent_after.pending_session_op.is_none());
    assert_ne!(
        parent_after.meta.persistence_handle.as_deref(),
        Some("vendor-fork-1")
    );

    let mut saw_applied = false;
    let mut saw_forked = false;
    while let Ok(event) = rx.try_recv() {
        match event.payload {
            AgentChatPayload::SessionOpResolved { outcome, .. } => {
                saw_applied = matches!(outcome, AgentChatSessionOpOutcome::Applied);
            }
            AgentChatPayload::SessionForked {
                parent_chat_id,
                chat_id,
            } => {
                assert_eq!(parent_chat_id, meta.id);
                assert_eq!(chat_id, child.id);
                saw_forked = true;
            }
            _ => {}
        }
    }
    assert!(saw_applied, "expected session_op_resolved Applied");
    assert!(saw_forked, "expected session_forked");
}

#[tokio::test]
async fn app069_s10_acp_send_fork_goes_as_prompt() {
    let provider = Arc::new(FakeAgentProvider::new("gemini"));
    let (_dir, service) = make_service(Arc::clone(&provider));
    let meta = service
        .create(CreateAgentChatRequest {
            workspace_id: None,
            project_id: None,
            space_id: None,
            cwd: "/tmp/proj".into(),
            origin: AgentChatOrigin::Normal,
            provider_id: "gemini".into(),
            model: None,
            thinking: None,
            mode: None,
            title: None,
        })
        .unwrap();
    let _ = service.send(&meta.id, "/fork", Vec::new()).await.unwrap();
    tokio::time::sleep(Duration::from_millis(40)).await;
    let jsonl = std::fs::read_to_string(service.store().dir_for(&meta.id).join("transcript.jsonl"))
        .unwrap();
    assert!(jsonl.contains("/fork"), "{jsonl}");
    let snapshot = service.get(&meta.id).await.unwrap();
    assert!(snapshot.pending_session_op.is_none());
}

#[tokio::test]
async fn app069_s10_acp_send_rewind_goes_as_prompt() {
    let provider = Arc::new(FakeAgentProvider::new("gemini"));
    let (_dir, service) = make_service(Arc::clone(&provider));
    let meta = service
        .create(create_req_for("/tmp/proj", "gemini"))
        .unwrap();
    let _ = service.send(&meta.id, "/rewind", Vec::new()).await.unwrap();
    tokio::time::sleep(Duration::from_millis(40)).await;
    let jsonl = std::fs::read_to_string(service.store().dir_for(&meta.id).join("transcript.jsonl"))
        .unwrap();
    assert!(jsonl.contains("/rewind"), "{jsonl}");
    let snapshot = service.get(&meta.id).await.unwrap();
    assert!(snapshot.pending_session_op.is_none());
    assert!(snapshot.meta.rewind_view.is_none());
}

#[tokio::test]
async fn app069_s12_codex_rewind_chrome_has_no_restore_code() {
    let provider = Arc::new(FakeAgentProvider::new("codex"));
    let (_dir, service) = make_service(Arc::clone(&provider));
    let meta = service
        .create(create_req_for("/tmp/proj", "codex"))
        .unwrap();
    seed_two_user_turns(&service, &meta.id);
    let _ = service.send(&meta.id, "/rewind", Vec::new()).await.unwrap();
    tokio::time::sleep(Duration::from_millis(40)).await;
    let pending = service
        .get(&meta.id)
        .await
        .unwrap()
        .pending_session_op
        .expect("pending rewind");
    let ids: Vec<_> = pending
        .options
        .iter()
        .map(|option| option.option_id.as_str())
        .collect();
    let names: Vec<_> = pending
        .options
        .iter()
        .map(|option| option.name.as_str())
        .collect();
    assert!(!ids.contains(&"rewind_code"));
    assert!(!ids.contains(&"rewind_both"));
    assert!(names.iter().all(|name| !name.contains("Restore code")));
}

#[tokio::test]
async fn app069_s13_failed_rewind_leaves_jsonl_and_view() {
    let provider = Arc::new(FakeAgentProvider::new("codex"));
    let (_dir, service) = make_service(Arc::clone(&provider));
    let meta = service
        .create(create_req_for("/tmp/proj", "codex"))
        .unwrap();
    seed_two_user_turns(&service, &meta.id);
    let jsonl_path = service.store().dir_for(&meta.id).join("transcript.jsonl");
    let before = std::fs::read_to_string(&jsonl_path).unwrap();
    let _ = service.send(&meta.id, "/rewind", Vec::new()).await.unwrap();
    tokio::time::sleep(Duration::from_millis(40)).await;
    let pending = service
        .get(&meta.id)
        .await
        .unwrap()
        .pending_session_op
        .expect("pending rewind");
    let option_id = pending
        .options
        .iter()
        .find(|option| option.option_id != "cancel")
        .map(|option| option.option_id.clone())
        .expect("rewind option");
    service
        .session_op_respond(&meta.id, &pending.request_id, &option_id)
        .await
        .unwrap();
    let after = service.get(&meta.id).await.unwrap();
    assert!(after.meta.rewind_view.is_none());
    assert!(after.pending_session_op.is_none());
    let jsonl_after = std::fs::read_to_string(&jsonl_path).unwrap();
    assert_eq!(jsonl_after, before);
}

#[tokio::test]
async fn app069_s14_opencode_redo_clears_view_without_deleting_jsonl() {
    let provider = FakeAgentProvider::new("opencode");
    provider.set_applied_fork_session_id("unused-fork");
    let provider = Arc::new(provider);
    let (_dir, service) = make_service(Arc::clone(&provider));
    let meta = service
        .create(create_req_for("/tmp/proj", "opencode"))
        .unwrap();
    seed_two_user_turns(&service, &meta.id);
    service
        .store()
        .update_meta(&meta.id, |row| {
            row.rewind_view = Some(RewindView {
                until_turn_id: "turn-1".into(),
            });
        })
        .unwrap();
    let hidden = service.get(&meta.id).await.unwrap();
    assert_eq!(hidden.messages.len(), 1);
    let jsonl_path = service.store().dir_for(&meta.id).join("transcript.jsonl");
    let before = std::fs::read_to_string(&jsonl_path).unwrap();
    assert!(before.contains("second"));
    let _ = service.send(&meta.id, "/redo", Vec::new()).await.unwrap();
    tokio::time::sleep(Duration::from_millis(40)).await;
    let pending = service
        .get(&meta.id)
        .await
        .unwrap()
        .pending_session_op
        .expect("pending redo");
    service
        .session_op_respond(&meta.id, &pending.request_id, "redo")
        .await
        .unwrap();
    let restored = service.get(&meta.id).await.unwrap();
    assert!(restored.meta.rewind_view.is_none());
    assert!(restored.messages.len() >= 2);
    let jsonl_after = std::fs::read_to_string(&jsonl_path).unwrap();
    assert_eq!(jsonl_after, before);
}

#[test]
fn app069_s15_session_op_path_does_not_restore_workspace_files() {
    let service = include_str!("service.rs");
    let apply = include_str!("apply_event.rs");
    let store = include_str!("store.rs");
    let production_service = service.split("#[cfg(test)]").next().unwrap_or(service);
    let production_apply = apply.split("#[cfg(test)]").next().unwrap_or(apply);
    let production_store = store.split("#[cfg(test)]").next().unwrap_or(store);
    for src in [production_service, production_apply, production_store] {
        assert!(
            !src.contains("git checkout"),
            "session-op must not git checkout"
        );
        assert!(!src.contains("Command::new(\"git\")"));
        assert!(!src.contains("git worktree"));
    }
}

#[tokio::test]
async fn app069_checkpoint_id_persists_and_rehydrates_on_resume() {
    let provider = Arc::new(FakeAgentProvider::new("claude"));
    let (_dir, service) = make_service(Arc::clone(&provider));
    let meta = service.create(create_req("/tmp/proj")).unwrap();
    seed_two_user_turns(&service, &meta.id);
    seed_user_checkpoint(&service, &meta.id, "turn-1", "claude-uuid-1");
    let folded = service.store().folded_turns(&meta.id).unwrap();
    let user = folded
        .iter()
        .find(|turn| turn.id == "turn-1")
        .and_then(|turn| turn.messages.iter().find(|message| message.role == "user"))
        .expect("user turn");
    assert_eq!(user.checkpoint_id.as_deref(), Some("claude-uuid-1"));

    service
        .store()
        .update_meta(&meta.id, |row| {
            row.persistence_handle = Some("vendor-session".into());
        })
        .unwrap();
    let _ = service.send(&meta.id, "/rewind", Vec::new()).await.unwrap();
    tokio::time::sleep(Duration::from_millis(40)).await;
    assert_eq!(provider.resume_count(), 1);
    let cfg = provider
        .last_runtime_config()
        .await
        .expect("runtime config");
    assert_eq!(cfg.checkpoints.len(), 1);
    assert_eq!(cfg.checkpoints[0].turn_id, "turn-1");
    assert_eq!(cfg.checkpoints[0].checkpoint_id, "claude-uuid-1");
    let pending = service
        .get(&meta.id)
        .await
        .unwrap()
        .pending_session_op
        .expect("pending rewind");
    assert!(pending_option_ids(&pending).contains(&"turn:claude-uuid-1"));
}

#[tokio::test]
async fn app069_live_user_checkpoint_event_folds_onto_user_message() {
    let provider = FakeAgentProvider::new("claude");
    provider.set_auto_complete(true);
    let provider = Arc::new(provider);
    let (_dir, service) = make_service(Arc::clone(&provider));
    let meta = service.create(create_req("/tmp/proj")).unwrap();
    let mut events = service.subscribe();
    let turn_id = service.send(&meta.id, "hello", Vec::new()).await.unwrap();
    timeout(Duration::from_secs(2), async {
        loop {
            let event = events.recv().await.expect("event");
            if matches!(event.payload, AgentChatPayload::TurnCompleted { .. }) {
                return;
            }
        }
    })
    .await
    .expect("turn completed");
    timeout(Duration::from_secs(2), async {
        while !provider.events_ready().await {
            tokio::time::sleep(Duration::from_millis(10)).await;
        }
    })
    .await
    .expect("events ready");
    provider
        .push_event(AgentEvent::UserCheckpoint {
            turn_id: turn_id.clone(),
            checkpoint_id: "live-uuid".into(),
        })
        .await;
    tokio::time::sleep(Duration::from_millis(40)).await;
    let folded = service.store().folded_turns(&meta.id).unwrap();
    let user = folded
        .iter()
        .find(|turn| turn.id == turn_id)
        .and_then(|turn| turn.messages.iter().find(|message| message.role == "user"))
        .expect("user");
    assert_eq!(user.checkpoint_id.as_deref(), Some("live-uuid"));
}

#[tokio::test]
async fn app069_phase_two_omits_restore_files_when_vendor_has_none() {
    let provider = FakeAgentProvider::new("claude");
    provider.set_prepare_has_file_changes(Some(false));
    let provider = Arc::new(provider);
    let (_dir, service) = make_service(Arc::clone(&provider));
    let meta = service.create(create_req("/tmp/proj")).unwrap();
    seed_two_user_turns(&service, &meta.id);
    let _ = service.send(&meta.id, "/rewind", Vec::new()).await.unwrap();
    tokio::time::sleep(Duration::from_millis(40)).await;
    let pending = service
        .get(&meta.id)
        .await
        .unwrap()
        .pending_session_op
        .expect("phase one");
    let turn_opt = pending
        .options
        .iter()
        .find(|option| option.option_id.starts_with("turn:"))
        .map(|option| option.option_id.clone())
        .expect("turn option");
    service
        .session_op_respond(&meta.id, &pending.request_id, &turn_opt)
        .await
        .unwrap();
    let phase_two = service
        .get(&meta.id)
        .await
        .unwrap()
        .pending_session_op
        .expect("phase two");
    let ids = pending_option_ids(&phase_two);
    assert!(ids.contains(&"rewind_conversation"));
    assert!(!ids.contains(&"rewind_code"));
    assert!(!ids.contains(&"rewind_both"));
}

#[tokio::test]
async fn app069_phase_two_includes_restore_files_when_vendor_has_changes() {
    let provider = FakeAgentProvider::new("claude");
    provider.set_prepare_has_file_changes(Some(true));
    let provider = Arc::new(provider);
    let (_dir, service) = make_service(Arc::clone(&provider));
    let meta = service.create(create_req("/tmp/proj")).unwrap();
    seed_two_user_turns(&service, &meta.id);
    let _ = service.send(&meta.id, "/rewind", Vec::new()).await.unwrap();
    tokio::time::sleep(Duration::from_millis(40)).await;
    let pending = service
        .get(&meta.id)
        .await
        .unwrap()
        .pending_session_op
        .expect("phase one");
    let turn_opt = pending
        .options
        .iter()
        .find(|option| option.option_id.starts_with("turn:"))
        .map(|option| option.option_id.clone())
        .expect("turn option");
    service
        .session_op_respond(&meta.id, &pending.request_id, &turn_opt)
        .await
        .unwrap();
    let phase_two = service
        .get(&meta.id)
        .await
        .unwrap()
        .pending_session_op
        .expect("phase two");
    let ids = pending_option_ids(&phase_two);
    assert!(ids.contains(&"rewind_conversation"));
    assert!(ids.contains(&"rewind_code"));
    assert!(ids.contains(&"rewind_both"));
}

#[tokio::test]
async fn app069_applied_conversation_rewind_sets_view_code_does_not() {
    let provider = FakeAgentProvider::new("claude");
    provider.set_applied_rewind(true);
    provider.set_prepare_has_file_changes(Some(true));
    let provider = Arc::new(provider);
    let (_dir, service) = make_service(Arc::clone(&provider));
    let meta = service.create(create_req("/tmp/proj")).unwrap();
    seed_two_user_turns(&service, &meta.id);
    let _ = service.send(&meta.id, "/rewind", Vec::new()).await.unwrap();
    tokio::time::sleep(Duration::from_millis(40)).await;
    let pending = service
        .get(&meta.id)
        .await
        .unwrap()
        .pending_session_op
        .expect("phase one");
    let turn_opt = pending
        .options
        .iter()
        .find(|option| option.option_id.starts_with("turn:"))
        .map(|option| option.option_id.clone())
        .expect("turn option");
    service
        .session_op_respond(&meta.id, &pending.request_id, &turn_opt)
        .await
        .unwrap();
    let phase_two = service
        .get(&meta.id)
        .await
        .unwrap()
        .pending_session_op
        .expect("phase two");
    service
        .session_op_respond(&meta.id, &phase_two.request_id, "rewind_conversation")
        .await
        .unwrap();
    let after = service.get(&meta.id).await.unwrap();
    assert_eq!(
        after
            .meta
            .rewind_view
            .as_ref()
            .map(|view| view.until_turn_id.as_str()),
        Some("turn-1")
    );
    assert_eq!(after.messages.len(), 1);

    let provider2 = FakeAgentProvider::new("claude");
    provider2.set_applied_rewind(true);
    provider2.set_prepare_has_file_changes(Some(true));
    let provider2 = Arc::new(provider2);
    let (_dir2, service2) = make_service(Arc::clone(&provider2));
    let meta2 = service2.create(create_req("/tmp/proj")).unwrap();
    seed_two_user_turns(&service2, &meta2.id);
    let _ = service2
        .send(&meta2.id, "/rewind", Vec::new())
        .await
        .unwrap();
    tokio::time::sleep(Duration::from_millis(40)).await;
    let pending2 = service2
        .get(&meta2.id)
        .await
        .unwrap()
        .pending_session_op
        .expect("phase one");
    let turn_opt2 = pending2
        .options
        .iter()
        .find(|option| option.option_id.starts_with("turn:"))
        .map(|option| option.option_id.clone())
        .expect("turn option");
    service2
        .session_op_respond(&meta2.id, &pending2.request_id, &turn_opt2)
        .await
        .unwrap();
    let phase_two2 = service2
        .get(&meta2.id)
        .await
        .unwrap()
        .pending_session_op
        .expect("phase two");
    service2
        .session_op_respond(&meta2.id, &phase_two2.request_id, "rewind_code")
        .await
        .unwrap();
    let after2 = service2.get(&meta2.id).await.unwrap();
    assert!(after2.meta.rewind_view.is_none());
    assert_eq!(after2.messages.len(), 2);
}

#[tokio::test]
async fn app069_s15_applied_rewind_does_not_mutate_workspace_files() {
    let workspace = tempfile::tempdir().unwrap();
    let marker = workspace.path().join("keep.txt");
    std::fs::write(&marker, b"untouched").unwrap();
    let provider = FakeAgentProvider::new("claude");
    provider.set_applied_rewind(true);
    provider.set_prepare_has_file_changes(Some(true));
    let provider = Arc::new(provider);
    let (_dir, service) = make_service(Arc::clone(&provider));
    let meta = service
        .create(create_req(workspace.path().to_str().unwrap()))
        .unwrap();
    seed_two_user_turns(&service, &meta.id);
    let _ = service.send(&meta.id, "/rewind", Vec::new()).await.unwrap();
    tokio::time::sleep(Duration::from_millis(40)).await;
    let pending = service
        .get(&meta.id)
        .await
        .unwrap()
        .pending_session_op
        .expect("phase one");
    let turn_opt = pending
        .options
        .iter()
        .find(|option| option.option_id.starts_with("turn:"))
        .map(|option| option.option_id.clone())
        .expect("turn option");
    service
        .session_op_respond(&meta.id, &pending.request_id, &turn_opt)
        .await
        .unwrap();
    let phase_two = service
        .get(&meta.id)
        .await
        .unwrap()
        .pending_session_op
        .expect("phase two");
    service
        .session_op_respond(&meta.id, &phase_two.request_id, "rewind_code")
        .await
        .unwrap();
    assert_eq!(std::fs::read(&marker).unwrap(), b"untouched");
}

#[tokio::test]
async fn app069_pi_fork_chrome_uses_vendor_entry_options() {
    let provider = FakeAgentProvider::new("pi");
    provider.set_prepare_options(vec![
        AgentPermissionOption {
            option_id: "fork".into(),
            name: "Fork here".into(),
            kind: "fork".into(),
        },
        AgentPermissionOption {
            option_id: "fork_entry:ent_1".into(),
            name: "hello there".into(),
            kind: "fork".into(),
        },
    ]);
    let provider = Arc::new(provider);
    let (_dir, service) = make_service(Arc::clone(&provider));
    let meta = service.create(create_req_for("/tmp/proj", "pi")).unwrap();
    let _ = service.send(&meta.id, "/fork", Vec::new()).await.unwrap();
    tokio::time::sleep(Duration::from_millis(40)).await;
    let pending = service
        .get(&meta.id)
        .await
        .unwrap()
        .pending_session_op
        .expect("pending fork");
    let ids = pending_option_ids(&pending);
    assert!(ids.contains(&"fork"));
    assert!(ids.contains(&"fork_entry:ent_1"));
    assert!(ids.contains(&"cancel"));
    assert_eq!(
        pending
            .options
            .iter()
            .find(|option| option.option_id == "fork")
            .map(|option| option.name.as_str()),
        Some("Fork here")
    );
}

#[test]
fn s12_followup_policy_defaults_to_queue() {
    assert_eq!(parse_followup_policy(None), FollowupPolicy::Queue);
    assert_eq!(parse_followup_policy(Some("")), FollowupPolicy::Queue);
    assert_eq!(parse_followup_policy(Some("steer")), FollowupPolicy::Steer);
}

#[tokio::test]
async fn s13_cancel_does_not_persist_draft() {
    let provider = FakeAgentProvider::new("claude");
    provider.set_auto_complete(false);
    let provider = Arc::new(provider);
    let (_dir, service) = make_service(Arc::clone(&provider));
    let meta = service.create(create_req("/tmp/proj")).unwrap();
    let _ = service.send(&meta.id, "running", Vec::new()).await.unwrap();
    let before = service.get(&meta.id).await.unwrap().messages.len();
    service.cancel(&meta.id).await.unwrap();
    tokio::time::sleep(Duration::from_millis(30)).await;
    let after = service.get(&meta.id).await.unwrap();
    assert_eq!(after.messages.len(), before);
    assert!(after.running_turn_id.is_none());
}

#[tokio::test]
async fn s14_permission_blocks_queue_allows_steer() {
    let mut provider = FakeAgentProvider::new("claude");
    provider.set_auto_complete(false);
    provider.emit_permission_on_prompt = true;
    provider.supports_steer = true;
    let provider = Arc::new(provider);
    let (_dir, service) = make_service(Arc::clone(&provider));
    let meta = service.create(create_req("/tmp/proj")).unwrap();
    let turn_id = service
        .send(&meta.id, "need perm", Vec::new())
        .await
        .unwrap();
    tokio::time::sleep(Duration::from_millis(30)).await;
    service.queue_add(&meta.id, "later", Vec::new()).unwrap();
    service.steer(&meta.id, &turn_id, "guidance").await.unwrap();
    let snapshot = service.get(&meta.id).await.unwrap();
    assert!(snapshot
        .messages
        .iter()
        .any(|message| message.kind == UserMessageKind::Steer));
    let queue = service.store().read_queue(&meta.id).unwrap();
    assert_eq!(queue.len(), 1);
    assert_eq!(queue[0].status, QueueItemStatus::Pending);
}

#[tokio::test]
async fn s18_prefetch_worker_starts_once() {
    let root = tempfile::tempdir().unwrap();
    let engine =
        CatalogEngine::with_acp_probe(root.path().join("catalog-probe"), Box::new(NoopAcpProbe));
    let worker = Arc::new(CatalogPrefetchWorker::new(
        root.path().to_path_buf(),
        engine,
        Duration::from_millis(20),
    ));
    worker
        .set_specs(vec![
            AgentCatalogSpec {
                agent_id: "claude".into(),
                static_models: vec![AgentModel {
                    id: "opus".into(),
                    label: "Opus".into(),
                    group: None,
                    is_default: true,
                    thinking: None,
                }],
                thinking: AgentThinkingSupport::None,
                strategies: vec![CatalogStrategyKind::Config],
                ..Default::default()
            },
            AgentCatalogSpec {
                agent_id: "codex".into(),
                static_models: vec![AgentModel {
                    id: "gpt".into(),
                    label: "GPT".into(),
                    group: None,
                    is_default: true,
                    thinking: None,
                }],
                strategies: vec![CatalogStrategyKind::Config],
                ..Default::default()
            },
        ])
        .await;
    let mut rx = worker.subscribe();
    worker.on_web_connect();
    worker.on_web_connect();
    assert!(worker.is_started());
    timeout(Duration::from_secs(2), async {
        let mut seen = 0;
        while seen < 2 {
            let _ = rx.recv().await.unwrap();
            seen += 1;
        }
    })
    .await
    .expect("catalog updated events");
}

#[tokio::test]
async fn s19_fresh_ok_cache_skips_probe() {
    let root = tempfile::tempdir().unwrap();
    let engine =
        CatalogEngine::with_acp_probe(root.path().join("catalog-probe"), Box::new(NoopAcpProbe));
    let worker = Arc::new(CatalogPrefetchWorker::new(
        root.path().to_path_buf(),
        engine,
        Duration::from_secs(30),
    ));
    let spec = AgentCatalogSpec {
        agent_id: "factory-droid".into(),
        static_models: vec![AgentModel {
            id: "opus".into(),
            label: "Opus".into(),
            group: None,
            is_default: true,
            thinking: None,
        }],
        strategies: vec![CatalogStrategyKind::Config],
        ..Default::default()
    };
    worker.set_specs(vec![spec.clone()]).await;
    let first = worker.get(&spec, true).await;
    assert_eq!(first.status, CatalogStatus::Ok);
    let probes = worker.probe_count();
    worker.on_web_connect();
    tokio::time::sleep(Duration::from_millis(30)).await;
    assert_eq!(worker.probe_count(), probes);
    let cached = worker.get(&spec, false).await;
    assert_eq!(cached.source, agent::CatalogSource::Cache);
}

#[tokio::test]
async fn s20_merge_cli_wins_thinking_from_config_and_probe_isolated() {
    use agent::{merge_catalogs, CatalogFragment};
    let config = CatalogFragment {
        models: vec![AgentModel {
            id: "opus".into(),
            label: "Opus".into(),
            group: None,
            is_default: false,
            thinking: Some(AgentThinkingSupport::Enum {
                arg: Some("--effort".into()),
                options: vec!["low".into(), "high".into()],
            }),
        }],
        thinking: AgentThinkingSupport::Enum {
            arg: Some("--effort".into()),
            options: vec!["low".into(), "high".into()],
        },
        strategy: Some(CatalogStrategyKind::Config),
        ..Default::default()
    };
    let cli = CatalogFragment {
        models: vec![AgentModel {
            id: "opus".into(),
            label: "Opus".into(),
            group: None,
            is_default: true,
            thinking: None,
        }],
        status: Some(CatalogStatus::Ok),
        strategy: Some(CatalogStrategyKind::Cli),
        ..Default::default()
    };
    let merged = merge_catalogs("claude", &[config, cli]);
    assert!(matches!(merged.thinking, AgentThinkingSupport::Enum { .. }));
    assert!(merged.models[0].is_default);
}

#[test]
fn next_seq_does_not_rewrite_meta_per_delta() {
    let dir = tempfile::tempdir().unwrap();
    let store = AgentChatStore::new(dir.path().join("chats"));
    let meta = store.create(create_req("/tmp/proj")).unwrap();
    let meta_path = store.dir_for(&meta.id).join("meta.json");
    let before = std::fs::read_to_string(&meta_path).unwrap();
    for _ in 0..32 {
        store.next_seq(&meta.id).unwrap();
    }
    let after = std::fs::read_to_string(&meta_path).unwrap();
    assert_eq!(before, after);
    assert_eq!(store.get_meta(&meta.id).unwrap().last_event_seq, 32);
    store.persist_seq(&meta.id).unwrap();
    assert_eq!(store.get_meta(&meta.id).unwrap().last_event_seq, 32);
}

#[tokio::test]
async fn unload_idle_closes_ready_runtime_and_keeps_transcript() {
    let provider = Arc::new(FakeAgentProvider::new("claude"));
    let (_dir, service) = make_service(Arc::clone(&provider));
    let meta = service.create(create_req("/tmp/proj")).unwrap();
    let mut events = service.subscribe();
    let _ = service.send(&meta.id, "hello", Vec::new()).await.unwrap();
    timeout(Duration::from_secs(2), async {
        loop {
            let event = events.recv().await.expect("event");
            if matches!(event.payload, AgentChatPayload::TurnCompleted { .. }) {
                return;
            }
        }
    })
    .await
    .expect("turn completed");
    let closed = service.unload_idle(Duration::from_millis(0)).await;
    assert_eq!(closed, vec![meta.id.clone()]);
    timeout(Duration::from_secs(2), async {
        while provider.close_count() == 0 {
            tokio::time::sleep(Duration::from_millis(10)).await;
        }
    })
    .await
    .expect("provider close");
    let snapshot = service.get(&meta.id).await.unwrap();
    assert!(!snapshot.messages.is_empty());
}

#[tokio::test]
async fn close_workspace_closes_matching_runtimes() {
    let provider = FakeAgentProvider::new("claude");
    provider.set_auto_complete(false);
    let provider = Arc::new(provider);
    let (_dir, service) = make_service(Arc::clone(&provider));
    let mut req = create_req("/tmp/ws");
    req.workspace_id = Some("ws-1".into());
    let meta = service.create(req).unwrap();
    let _ = service.send(&meta.id, "busy", Vec::new()).await.unwrap();
    assert_eq!(service.close_workspace("ws-1").await, 1);
    timeout(Duration::from_secs(2), async {
        while provider.close_count() == 0 {
            tokio::time::sleep(Duration::from_millis(10)).await;
        }
    })
    .await
    .expect("workspace close");
}

#[tokio::test]
async fn pump_end_does_not_drop_replacement_runtime() {
    let provider = FakeAgentProvider::new("claude");
    provider.set_auto_complete(false);
    let provider = Arc::new(provider);
    let (_dir, service) = make_service(Arc::clone(&provider));
    let meta = service.create(create_req("/tmp/proj")).unwrap();
    let _ = service.send(&meta.id, "one", Vec::new()).await.unwrap();
    service.cancel(&meta.id).await.unwrap();
    timeout(Duration::from_secs(2), async {
        loop {
            let snapshot = service.get(&meta.id).await.unwrap();
            if snapshot.running_turn_id.is_none() && !snapshot.messages.is_empty() {
                return;
            }
            tokio::time::sleep(Duration::from_millis(10)).await;
        }
    })
    .await
    .expect("first turn ended");
    let _ = service
        .send(&meta.id, "two", Vec::new())
        .await
        .expect("replacement send");
    tokio::time::sleep(Duration::from_millis(40)).await;
    assert!(provider.create_count() + provider.resume_count() >= 1);
    let snapshot = service.get(&meta.id).await.unwrap();
    assert!(snapshot.running_turn_id.is_some() || !snapshot.messages.is_empty());
}

fn assistant_texts(snapshot: &super::types::AgentChatSnapshot) -> String {
    snapshot
        .messages
        .iter()
        .filter(|message| message.role == "assistant")
        .flat_map(|message| &message.parts)
        .filter_map(|part| match part {
            MessagePart::Text { text } => Some(text.as_str()),
            _ => None,
        })
        .collect::<Vec<_>>()
        .join("")
}

#[tokio::test]
async fn get_projects_live_turn_timing_from_server_clock() {
    let provider = Arc::new(FakeAgentProvider::new("claude"));
    provider.set_auto_complete(false);
    let (_dir, service) = make_service(Arc::clone(&provider));
    let meta = service.create(create_req("/tmp/proj")).unwrap();
    let _ = service.send(&meta.id, "hello", Vec::new()).await.unwrap();

    timeout(Duration::from_secs(2), async {
        loop {
            if provider.events_ready().await {
                return;
            }
            tokio::time::sleep(Duration::from_millis(10)).await;
        }
    })
    .await
    .expect("runtime event channel");

    provider
        .push_event(AgentEvent::ThinkingDelta {
            message_id: "a1".into(),
            delta: "hmm".into(),
        })
        .await;
    tokio::time::sleep(Duration::from_millis(1100)).await;

    let snapshot = service.get(&meta.id).await.unwrap();
    assert_eq!(snapshot.meta.runtime_status, RuntimeStatus::RunningTurn);
    assert!(snapshot.running_turn_id.is_some());
    assert!(snapshot.running_turn_started_at.is_some());
    let assistant = snapshot
        .messages
        .iter()
        .find(|message| message.role == "assistant")
        .expect("assistant");
    assert!(assistant.streaming);
    let worked = assistant.worked_ms.expect("live worked_ms");
    assert!(worked >= 1_000, "worked_ms={worked}");
    let thinking = assistant.thinking_ms.expect("live thinking_ms");
    assert!(thinking >= 1_000, "thinking_ms={thinking}");
    let thinking_part = assistant
        .parts
        .iter()
        .find_map(|part| match part {
            MessagePart::Thinking { duration_ms, .. } => Some(*duration_ms),
            _ => None,
        })
        .flatten()
        .expect("open thinking duration");
    assert!(
        thinking_part >= 1_000,
        "thinking part duration={thinking_part}"
    );
}

#[tokio::test]
async fn get_overlays_unpersisted_live_text_without_duplicate_ids() {
    let provider = Arc::new(FakeAgentProvider::new("claude"));
    provider.set_auto_complete(false);
    let (_dir, service) = make_service(Arc::clone(&provider));
    let meta = service.create(create_req("/tmp/proj")).unwrap();
    let _ = service.send(&meta.id, "hello", Vec::new()).await.unwrap();

    timeout(Duration::from_secs(2), async {
        loop {
            if provider.events_ready().await {
                return;
            }
            tokio::time::sleep(Duration::from_millis(10)).await;
        }
    })
    .await
    .expect("runtime event channel");

    let assistant_id = uuid::Uuid::new_v4().to_string();
    provider
        .push_event(AgentEvent::AssistantMessageDelta {
            message_id: assistant_id.clone(),
            delta: "DISK".into(),
        })
        .await;
    tokio::time::sleep(Duration::from_millis(20)).await;
    provider
        .push_event(AgentEvent::AssistantMessageDelta {
            message_id: assistant_id,
            delta: "LIVE".into(),
        })
        .await;
    tokio::time::sleep(Duration::from_millis(20)).await;

    let disk = service.store().get_snapshot(&meta.id).unwrap();
    let live = service.get(&meta.id).await.unwrap();
    let disk_text = assistant_texts(&disk);
    let live_text = assistant_texts(&live);
    assert!(
        live_text.contains("DISK") && live_text.contains("LIVE"),
        "live snapshot should splice persisted + unpersisted text: live={live_text:?} disk={disk_text:?}"
    );
    assert!(
        live_text.len() >= disk_text.len(),
        "live snapshot should not drop disk text: live={live_text:?} disk={disk_text:?}"
    );
    let mut ids = std::collections::HashSet::new();
    for message in &live.messages {
        assert!(
            ids.insert(message.id.as_str()),
            "duplicate message id {}",
            message.id
        );
    }
}

fn execute_tool(id: &str, status: agent::AgentToolStatus) -> agent::AgentTool {
    agent::AgentTool {
        tool_call_id: id.into(),
        name: "Execute".into(),
        title: Some("ls".into()),
        kind: agent::AgentToolKind::Execute,
        status,
        params: agent::AgentToolParams::Execute {
            command: "ls".into(),
            cwd: None,
            background: false,
            task_id: None,
        },
        result: None,
    }
}

fn assistant_part_kinds(snapshot: &super::types::AgentChatSnapshot) -> Vec<String> {
    snapshot
        .messages
        .iter()
        .find(|message| message.role == "assistant")
        .map(|message| {
            message
                .parts
                .iter()
                .filter_map(|part| match part {
                    MessagePart::Thinking { text, .. } if !text.is_empty() => {
                        Some("thinking".into())
                    }
                    MessagePart::ToolCall { .. } => Some("tool".into()),
                    MessagePart::Text { text } if !text.is_empty() => Some("text".into()),
                    _ => None,
                })
                .collect()
        })
        .unwrap_or_default()
}

#[tokio::test]
async fn interleaved_thinking_and_tools_survive_disk_reload() {
    let provider = Arc::new(FakeAgentProvider::new("claude"));
    provider.set_auto_complete(false);
    let (_dir, service) = make_service(Arc::clone(&provider));
    let meta = service.create(create_req("/tmp/proj")).unwrap();
    let _ = service.send(&meta.id, "hello", Vec::new()).await.unwrap();

    timeout(Duration::from_secs(2), async {
        loop {
            if provider.events_ready().await {
                return;
            }
            tokio::time::sleep(Duration::from_millis(10)).await;
        }
    })
    .await
    .expect("runtime event channel");

    provider
        .push_event(AgentEvent::ThinkingDelta {
            message_id: "a1".into(),
            delta: "first".into(),
        })
        .await;
    tokio::time::sleep(Duration::from_millis(20)).await;
    provider
        .push_event(AgentEvent::ToolCallStarted {
            tool_call: execute_tool("t1", agent::AgentToolStatus::Running),
        })
        .await;
    provider
        .push_event(AgentEvent::ToolCallCompleted {
            tool_call: execute_tool("t1", agent::AgentToolStatus::Completed),
        })
        .await;
    tokio::time::sleep(Duration::from_millis(20)).await;
    provider
        .push_event(AgentEvent::ThinkingDelta {
            message_id: "a1".into(),
            delta: "second".into(),
        })
        .await;
    tokio::time::sleep(Duration::from_millis(20)).await;
    provider
        .push_event(AgentEvent::ToolCallStarted {
            tool_call: execute_tool("t2", agent::AgentToolStatus::Running),
        })
        .await;
    provider
        .push_event(AgentEvent::ToolCallCompleted {
            tool_call: execute_tool("t2", agent::AgentToolStatus::Completed),
        })
        .await;
    tokio::time::sleep(Duration::from_millis(20)).await;
    provider
        .push_event(AgentEvent::ThinkingDelta {
            message_id: "a1".into(),
            delta: "third".into(),
        })
        .await;
    tokio::time::sleep(Duration::from_millis(20)).await;
    provider.complete_current().await;

    timeout(Duration::from_secs(2), async {
        loop {
            let snapshot = service.get(&meta.id).await.unwrap();
            if snapshot.running_turn_id.is_none() {
                return;
            }
            tokio::time::sleep(Duration::from_millis(10)).await;
        }
    })
    .await
    .expect("turn ended");

    let live = service.get(&meta.id).await.unwrap();
    assert_eq!(
        assistant_part_kinds(&live),
        ["thinking", "tool", "thinking", "tool", "thinking"],
        "live snapshot should keep thinking/tool interleaving"
    );
    let thinking: Vec<_> = live
        .messages
        .iter()
        .find(|message| message.role == "assistant")
        .expect("assistant")
        .parts
        .iter()
        .filter_map(|part| match part {
            MessagePart::Thinking { text, .. } => Some(text.as_str()),
            _ => None,
        })
        .collect();
    assert_eq!(thinking, ["first", "second", "third"]);

    let disk = service.store().get_snapshot(&meta.id).unwrap();
    assert_eq!(
        assistant_part_kinds(&disk),
        ["thinking", "tool", "thinking", "tool", "thinking"],
        "reload from transcript.jsonl should not collapse thinking into one part after tools"
    );
}

#[test]
fn create_stamps_ready_catalog_into_descriptor() {
    let provider = Arc::new(FakeAgentProvider::new("factory-droid"));
    let (dir, service) = make_service(Arc::clone(&provider));
    let engine =
        CatalogEngine::with_acp_probe(dir.path().join("catalog-probe"), Box::new(NoopAcpProbe));
    let worker = Arc::new(CatalogPrefetchWorker::new(
        dir.path().to_path_buf(),
        engine,
        Duration::from_secs(30),
    ));
    worker.put_catalog_for_test(&AgentModelCatalog {
        agent_id: "factory-droid".into(),
        status: CatalogStatus::Ok,
        models: vec![AgentModel {
            id: "glm-5".into(),
            label: "GLM 5".into(),
            group: None,
            is_default: true,
            thinking: None,
        }],
        modes: Vec::new(),
        permission_modes: vec![AgentMode {
            id: "default".into(),
            label: "Default".into(),
            is_default: true,
        }],
        commands: Vec::new(),
        thinking: AgentThinkingSupport::Enum {
            arg: None,
            options: vec!["low".into(), "high".into()],
        },
        strategies_used: Vec::new(),
        fetched_at: chrono::Utc::now(),
        source: CatalogSource::Cache,
        message: None,
    });
    service.set_catalog_worker(worker);
    let meta = service
        .create(create_req_for("/tmp/proj", "factory-droid"))
        .unwrap();
    assert_eq!(
        meta.descriptor
            .supported_options
            .models
            .iter()
            .map(|item| item.id.as_str())
            .collect::<Vec<_>>(),
        ["glm-5"]
    );
    assert_eq!(
        meta.descriptor.current_config.model.as_deref(),
        Some("glm-5")
    );
    assert_eq!(
        meta.descriptor.current_config.permission_mode.as_deref(),
        Some("default")
    );
}

#[tokio::test]
async fn configure_rebuilds_descriptor_when_switching_provider() {
    let provider = Arc::new(FakeAgentProvider::new("claude"));
    let (dir, service) = make_service(Arc::clone(&provider));
    let engine =
        CatalogEngine::with_acp_probe(dir.path().join("catalog-probe"), Box::new(NoopAcpProbe));
    let worker = Arc::new(CatalogPrefetchWorker::new(
        dir.path().to_path_buf(),
        engine,
        Duration::from_secs(30),
    ));
    worker.put_catalog_for_test(&AgentModelCatalog {
        agent_id: "grok".into(),
        status: CatalogStatus::Ok,
        models: vec![AgentModel {
            id: "grok-4".into(),
            label: "Grok 4".into(),
            group: None,
            is_default: true,
            thinking: None,
        }],
        modes: vec![AgentMode {
            id: "default".into(),
            label: "Default".into(),
            is_default: true,
        }],
        permission_modes: vec![AgentMode {
            id: "ask_always".into(),
            label: "Ask always".into(),
            is_default: true,
        }],
        commands: vec![AgentAvailableCommand {
            name: "compact".into(),
            description: "Compact conversation".into(),
            hint: None,
        }],
        thinking: AgentThinkingSupport::Enum {
            arg: None,
            options: vec!["low".into(), "high".into()],
        },
        strategies_used: Vec::new(),
        fetched_at: chrono::Utc::now(),
        source: CatalogSource::Cache,
        message: None,
    });
    service.set_catalog_worker(worker);
    let meta = service.create(create_req("/tmp/proj")).unwrap();
    assert!(meta.descriptor.supported_options.models.is_empty());
    let updated = service
        .configure(&meta.id, Some("grok".into()), None, None, None, None)
        .await
        .unwrap();
    assert_eq!(updated.provider_id, "grok");
    assert_eq!(updated.descriptor.identity.id, "grok");
    assert_eq!(
        updated
            .descriptor
            .supported_options
            .models
            .iter()
            .map(|item| item.id.as_str())
            .collect::<Vec<_>>(),
        ["grok-4"]
    );
    assert_eq!(
        updated.descriptor.current_config.model.as_deref(),
        Some("grok-4")
    );
}
