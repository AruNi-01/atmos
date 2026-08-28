use std::sync::Arc;
use std::time::Duration;

use agent::testing::{FakeAgentProvider, StaticProviderFactory};
use agent::{
    AgentCatalogSpec, AgentModel, AgentProvider, AgentThinkingSupport, CatalogEngine,
    CatalogStatus, CatalogStrategyKind, NoopAcpProbe, UserMessageKind,
};
use tokio::time::timeout;

use super::catalog::{parse_followup_policy, CatalogPrefetchWorker, FollowupPolicy};
use super::service::AgentChatService;
use super::store::AgentChatStore;
use super::types::{AgentChatPayload, CreateAgentChatRequest, QueueItemStatus, RuntimeStatus};

fn make_service(provider: Arc<FakeAgentProvider>) -> (tempfile::TempDir, AgentChatService) {
    let dir = tempfile::tempdir().unwrap();
    let store = Arc::new(AgentChatStore::new(dir.path().join("chats")));
    let factory = Arc::new(StaticProviderFactory::new(provider));
    (dir, AgentChatService::new(store, factory))
}

fn create_req(cwd: &str) -> CreateAgentChatRequest {
    CreateAgentChatRequest {
        workspace_id: None,
        project_id: None,
        cwd: cwd.into(),
        provider_id: "claude".into(),
        model: Some("opus".into()),
        thinking: None,
        mode: None,
        title: None,
    }
}

#[tokio::test]
async fn s4_get_does_not_spawn_provider() {
    let provider = Arc::new(FakeAgentProvider::new("claude"));
    let (_dir, service) = make_service(Arc::clone(&provider));
    let meta = service.create(create_req("/tmp/proj")).unwrap();
    let snapshot = service.get(&meta.id).unwrap();
    assert_eq!(provider.create_count(), 0);
    assert_eq!(provider.resume_count(), 0);
    assert!(snapshot.messages.is_empty());
    assert!(snapshot.meta.persistence_handle.is_none());
}

#[tokio::test]
async fn s7_continue_resumes_same_chat() {
    let provider = Arc::new(FakeAgentProvider::new("claude"));
    let (_dir, service) = make_service(Arc::clone(&provider));
    let meta = service.create(create_req("/tmp/proj")).unwrap();
    let first = service.send(&meta.id, "hello", Vec::new()).await.unwrap();
    tokio::time::sleep(Duration::from_millis(30)).await;
    assert_eq!(provider.create_count(), 1);
    let after = service.get(&meta.id).unwrap();
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
    assert_eq!(resumed.get(&meta.id).unwrap().meta.id, meta.id);
    assert_eq!(
        provider2.last_resume_handle().await.as_deref(),
        Some(handle.as_str())
    );
    drop(turn);
}

#[tokio::test]
async fn s7_continue_without_handle_creates_on_same_id() {
    let provider = Arc::new(FakeAgentProvider::new("claude"));
    let (_dir, service) = make_service(Arc::clone(&provider));
    let meta = service.create(create_req("/tmp/proj")).unwrap();
    let _ = service.send(&meta.id, "hello", Vec::new()).await.unwrap();
    assert_eq!(service.get(&meta.id).unwrap().meta.id, meta.id);
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
        AgentChatPayload::TurnStarted { turn_id: id } => assert_eq!(id, turn_id),
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
            let snapshot = service.get(&meta.id).unwrap();
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
                message_id, text, ..
            } = event.payload
            {
                if text == "hello-s16" {
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
                message_id, text, ..
            } = event.payload
            {
                if text == "hello-s16" {
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
    let snapshot = service.get(&meta.id).unwrap();
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
async fn configure_sets_model_before_spawn() {
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
        )
        .await
        .unwrap();
    assert_eq!(updated.provider_id, "grok");
    assert_eq!(updated.selected_model.as_deref(), Some("grok-4"));
    assert_eq!(updated.selected_thinking.as_deref(), Some("high"));
    assert_eq!(updated.selected_mode.as_deref(), Some("agent"));
    assert_eq!(provider.create_count(), 0);
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
    let before = service.get(&meta.id).unwrap().messages.len();
    service.cancel(&meta.id).await.unwrap();
    tokio::time::sleep(Duration::from_millis(30)).await;
    let after = service.get(&meta.id).unwrap();
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
    let snapshot = service.get(&meta.id).unwrap();
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
        agent_id: "claude".into(),
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
    let snapshot = service.get(&meta.id).unwrap();
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
            let snapshot = service.get(&meta.id).unwrap();
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
    let snapshot = service.get(&meta.id).unwrap();
    assert!(snapshot.running_turn_id.is_some() || !snapshot.messages.is_empty());
}
