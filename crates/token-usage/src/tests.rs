use std::sync::atomic::{AtomicUsize, Ordering};
use std::sync::Arc;
use std::time::Duration;

use async_trait::async_trait;

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
    assert_eq!(update.query.year.as_deref(), Some("2026"));
    assert_eq!(update.overview.by_model.len(), 2);
    assert_eq!(calls.load(Ordering::SeqCst), 1);
}

fn sample_reports() -> CollectedTokenUsageReports {
    use tokscale_core::{
        ClientContribution, DailyContribution, DailyTotals, DataSummary, GraphMeta, GraphResult,
        ModelReport, ModelUsage, MonthlyReport, MonthlyUsage, TokenBreakdown,
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
        years: vec![],
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
    }
}
