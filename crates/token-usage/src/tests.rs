use std::sync::atomic::{AtomicUsize, Ordering};
use std::sync::Arc;
use std::time::Duration;
use std::{fs, path::PathBuf};

use async_trait::async_trait;
use tokio::time::{sleep, timeout, Instant};

use crate::models::{TokenUsageGroupBy, TokenUsageQuery};
use crate::service::{CollectedTokenUsageReports, TokenUsageCollector};
use crate::{TokenUsageError, TokenUsageService};

struct FakeCollector {
    calls: Arc<AtomicUsize>,
}

#[async_trait]
impl TokenUsageCollector for FakeCollector {
    async fn collect(
        &self,
        _query: &TokenUsageQuery,
    ) -> Result<CollectedTokenUsageReports, TokenUsageError> {
        self.calls.fetch_add(1, Ordering::SeqCst);
        Ok(sample_reports())
    }
}

struct DelayedCollector {
    calls: Arc<AtomicUsize>,
    delay: Duration,
}

#[async_trait]
impl TokenUsageCollector for DelayedCollector {
    async fn collect(
        &self,
        _query: &TokenUsageQuery,
    ) -> Result<CollectedTokenUsageReports, TokenUsageError> {
        self.calls.fetch_add(1, Ordering::SeqCst);
        sleep(self.delay).await;
        Ok(sample_reports())
    }
}

#[tokio::test]
async fn get_overview_uses_cache_for_normalized_queries() {
    let calls = Arc::new(AtomicUsize::new(0));
    let service = TokenUsageService::new(
        Arc::new(FakeCollector {
            calls: Arc::clone(&calls),
        }),
        Duration::from_secs(300),
    );

    let first = TokenUsageQuery {
        clients: Some(vec![" Claude ".into(), "codex".into()]),
        since: Some("2026-03-01".into()),
        until: None,
        year: None,
        group_by: TokenUsageGroupBy::ClientModel,
    };
    let second = TokenUsageQuery {
        clients: Some(vec!["codex".into(), "claude".into()]),
        since: Some("2026-03-01".into()),
        until: None,
        year: None,
        group_by: TokenUsageGroupBy::ClientModel,
    };

    let overview = service.get_overview(first, false).await.unwrap();
    assert_eq!(overview.summary.total_tokens, 710);
    assert_eq!(overview.by_client.len(), 2);
    assert_eq!(overview.by_client[0].client_id, "codex");
    assert_eq!(overview.by_client[0].total_tokens, 500);
    assert_eq!(overview.by_client[1].client_id, "claude");
    assert_eq!(overview.by_client[1].total_tokens, 210);
    assert_eq!(overview.by_day[0].breakdown.reasoning_tokens, 20);
    assert_eq!(overview.by_month[0].breakdown.total_tokens, 685);
    assert_eq!(overview.available_years, vec!["2026"]);

    let cached = service.get_overview(second, false).await.unwrap();
    assert_eq!(cached.summary.total_messages, 3);
    assert_eq!(calls.load(Ordering::SeqCst), 1);
}

#[tokio::test]
async fn get_overview_publishes_updates_for_fresh_fetches() {
    let calls = Arc::new(AtomicUsize::new(0));
    let service = TokenUsageService::new(
        Arc::new(FakeCollector {
            calls: Arc::clone(&calls),
        }),
        Duration::from_secs(300),
    );
    let mut updates = service.subscribe_updates();

    let query = TokenUsageQuery {
        clients: None,
        since: None,
        until: None,
        year: Some("2026".into()),
        group_by: TokenUsageGroupBy::ClientProviderModel,
    };

    let overview = service.get_overview(query.clone(), true).await.unwrap();
    let update = updates.recv().await.unwrap();

    assert_eq!(overview.summary.total_messages, 3);
    assert_eq!(update.overview.query.year.as_deref(), Some("2026"));
    assert_eq!(update.overview.by_model.len(), 2);
    assert_eq!(
        update.overview.by_day[1].by_client[0]
            .breakdown
            .total_tokens,
        210
    );
    assert_eq!(calls.load(Ordering::SeqCst), 1);
}

#[tokio::test]
async fn get_overview_does_not_publish_updates_for_regular_reads() {
    let service = TokenUsageService::new(
        Arc::new(FakeCollector {
            calls: Arc::new(AtomicUsize::new(0)),
        }),
        Duration::from_secs(300),
    );
    let mut updates = service.subscribe_updates();

    let query = TokenUsageQuery {
        clients: None,
        since: None,
        until: None,
        year: None,
        group_by: TokenUsageGroupBy::ClientModel,
    };

    let _ = service.get_overview(query, false).await.unwrap();

    assert!(matches!(
        updates.try_recv(),
        Err(tokio::sync::broadcast::error::TryRecvError::Empty)
    ));
}

#[tokio::test]
async fn get_overview_returns_stale_cache_and_refreshes_in_background() {
    let calls = Arc::new(AtomicUsize::new(0));
    let service = TokenUsageService::new(
        Arc::new(DelayedCollector {
            calls: Arc::clone(&calls),
            delay: Duration::from_millis(150),
        }),
        Duration::ZERO,
    );
    let mut updates = service.subscribe_updates();

    let query = TokenUsageQuery {
        clients: None,
        since: None,
        until: None,
        year: None,
        group_by: TokenUsageGroupBy::ClientModel,
    };

    let _initial = service.get_overview(query.clone(), false).await.unwrap();
    assert_eq!(calls.load(Ordering::SeqCst), 1);

    let started = Instant::now();
    let cached = service.get_overview(query, false).await.unwrap();

    assert!(
        started.elapsed() < Duration::from_millis(75),
        "expected stale cache read to return quickly, took {:?}",
        started.elapsed()
    );
    assert_eq!(cached.summary.total_tokens, 710);

    timeout(Duration::from_millis(500), async {
        loop {
            if calls.load(Ordering::SeqCst) >= 2 {
                break;
            }
            sleep(Duration::from_millis(10)).await;
        }
    })
    .await
    .expect("background refresh did not start");

    let update = timeout(Duration::from_millis(500), updates.recv())
        .await
        .expect("background refresh did not publish an update")
        .expect("update channel closed unexpectedly");

    assert_eq!(update.overview.summary.total_tokens, 710);
    assert_eq!(calls.load(Ordering::SeqCst), 2);
}

#[tokio::test]
async fn get_overview_loads_cached_overview_from_disk_on_startup() {
    let cache_path = test_cache_path("startup");
    let _ = fs::remove_file(&cache_path);

    let populate_calls = Arc::new(AtomicUsize::new(0));
    let populate_service = TokenUsageService::new_with_cache_path(
        Arc::new(FakeCollector {
            calls: Arc::clone(&populate_calls),
        }),
        Duration::from_secs(300),
        Some(cache_path.clone()),
    );

    let query = TokenUsageQuery {
        clients: None,
        since: None,
        until: None,
        year: None,
        group_by: TokenUsageGroupBy::ClientModel,
    };

    let populated = populate_service
        .get_overview(query.clone(), false)
        .await
        .unwrap();
    assert_eq!(populated.summary.total_tokens, 710);
    assert_eq!(populate_calls.load(Ordering::SeqCst), 1);

    let startup_calls = Arc::new(AtomicUsize::new(0));
    let startup_service = TokenUsageService::new_with_cache_path(
        Arc::new(FakeCollector {
            calls: Arc::clone(&startup_calls),
        }),
        Duration::from_secs(300),
        Some(cache_path.clone()),
    );

    let cached = startup_service.get_overview(query, false).await.unwrap();
    assert_eq!(cached.summary.total_tokens, 710);
    assert_eq!(startup_calls.load(Ordering::SeqCst), 0);

    let _ = fs::remove_file(&cache_path);
}

fn test_cache_path(label: &str) -> PathBuf {
    std::env::temp_dir().join(format!(
        "atmos-token-usage-{label}-{}-{}.json",
        std::process::id(),
        unix_timestamp_nanos(),
    ))
}

fn unix_timestamp_nanos() -> u128 {
    std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|duration| duration.as_nanos())
        .unwrap_or_default()
}

fn sample_reports() -> CollectedTokenUsageReports {
    use tokscale_core::{
        ClientContribution, DailyContribution, DailyTotals, DataSummary, GraphMeta, GraphResult,
        ModelReport, ModelUsage, MonthlyReport, MonthlyUsage, TokenBreakdown, YearSummary,
    };

    let graph = GraphResult {
        meta: GraphMeta {
            generated_at: "2026-03-12T00:00:00Z".into(),
            version: "test".into(),
            date_range_start: "2026-03-10".into(),
            date_range_end: "2026-03-11".into(),
            processing_time_ms: 11,
        },
        summary: DataSummary {
            total_tokens: 710,
            total_cost: 1.23,
            total_days: 2,
            active_days: 2,
            average_per_day: 0.615,
            max_cost_in_single_day: 0.73,
            clients: vec!["codex".into(), "claude".into()],
            models: vec!["gpt-5".into(), "claude-3-7-sonnet".into()],
        },
        years: vec![YearSummary {
            year: "2026".into(),
            total_tokens: 710,
            total_cost: 1.23,
            range_start: "2026-03-10".into(),
            range_end: "2026-03-11".into(),
        }],
        contributions: vec![
            DailyContribution {
                date: "2026-03-10".into(),
                totals: DailyTotals {
                    tokens: 500,
                    cost: 0.73,
                    messages: 2,
                },
                intensity: 4,
                token_breakdown: TokenBreakdown {
                    input: 200,
                    output: 250,
                    cache_read: 20,
                    cache_write: 10,
                    reasoning: 20,
                },
                clients: vec![ClientContribution {
                    client: "codex".into(),
                    model_id: "gpt-5".into(),
                    provider_id: "openai".into(),
                    tokens: TokenBreakdown {
                        input: 200,
                        output: 250,
                        cache_read: 20,
                        cache_write: 10,
                        reasoning: 20,
                    },
                    cost: 0.73,
                    messages: 2,
                }],
            },
            DailyContribution {
                date: "2026-03-11".into(),
                totals: DailyTotals {
                    tokens: 210,
                    cost: 0.50,
                    messages: 1,
                },
                intensity: 3,
                token_breakdown: TokenBreakdown {
                    input: 100,
                    output: 90,
                    cache_read: 10,
                    cache_write: 5,
                    reasoning: 5,
                },
                clients: vec![ClientContribution {
                    client: "claude".into(),
                    model_id: "claude-3-7-sonnet".into(),
                    provider_id: "anthropic".into(),
                    tokens: TokenBreakdown {
                        input: 100,
                        output: 90,
                        cache_read: 10,
                        cache_write: 5,
                        reasoning: 5,
                    },
                    cost: 0.50,
                    messages: 1,
                }],
            },
        ],
    };

    let model_report = ModelReport {
        entries: vec![
            ModelUsage {
                client: "codex".into(),
                merged_clients: None,
                model: "gpt-5".into(),
                provider: "openai".into(),
                input: 200,
                output: 250,
                cache_read: 20,
                cache_write: 10,
                reasoning: 20,
                message_count: 2,
                cost: 0.73,
            },
            ModelUsage {
                client: "claude".into(),
                merged_clients: None,
                model: "claude-3-7-sonnet".into(),
                provider: "anthropic".into(),
                input: 100,
                output: 90,
                cache_read: 10,
                cache_write: 5,
                reasoning: 5,
                message_count: 1,
                cost: 0.50,
            },
        ],
        total_input: 300,
        total_output: 340,
        total_cache_read: 30,
        total_cache_write: 15,
        total_messages: 3,
        total_cost: 1.23,
        processing_time_ms: 7,
    };

    let monthly_report = MonthlyReport {
        entries: vec![MonthlyUsage {
            month: "2026-03".into(),
            models: vec!["gpt-5".into(), "claude-3-7-sonnet".into()],
            input: 300,
            output: 340,
            cache_read: 30,
            cache_write: 15,
            message_count: 3,
            cost: 1.23,
        }],
        total_cost: 1.23,
        processing_time_ms: 5,
    };

    CollectedTokenUsageReports {
        graph,
        model_report,
        monthly_report,
        processing_time_ms: 23,
    }
}
