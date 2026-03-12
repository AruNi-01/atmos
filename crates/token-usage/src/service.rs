use std::collections::{HashMap, HashSet};
use std::sync::Arc;
use std::time::{Duration, SystemTime, UNIX_EPOCH};

use async_trait::async_trait;
use serde::Serialize;
use thiserror::Error;
use tokio::sync::{broadcast, RwLock};

use crate::models::{
    ClientTokenUsage, DailyClientTokenUsage, DailyTokenUsage, ModelTokenUsage, MonthlyTokenUsage,
    TokenBreakdown, TokenUsageOverview, TokenUsageQuery, TokenUsageSummary, TokenUsageUpdate,
};

const DEFAULT_CACHE_TTL_SECS: u64 = 60;

#[derive(Debug, Error, Clone, PartialEq, Eq)]
pub enum TokenUsageError {
    #[error("Token usage fetch failed: {0}")]
    Fetch(String),
}

#[derive(Debug, Clone)]
pub(crate) struct CollectedTokenUsageReports {
    pub(crate) graph: tokscale_core::GraphResult,
    pub(crate) model_report: tokscale_core::ModelReport,
    pub(crate) monthly_report: tokscale_core::MonthlyReport,
}

#[async_trait]
pub(crate) trait TokenUsageCollector: Send + Sync {
    async fn collect(
        &self,
        query: &TokenUsageQuery,
    ) -> Result<CollectedTokenUsageReports, TokenUsageError>;
}

#[derive(Debug, Default)]
struct TokscaleCollector;

#[async_trait]
impl TokenUsageCollector for TokscaleCollector {
    async fn collect(
        &self,
        query: &TokenUsageQuery,
    ) -> Result<CollectedTokenUsageReports, TokenUsageError> {
        let options = tokscale_options(query);

        let graph = tokscale_core::generate_graph(options.clone())
            .await
            .map_err(TokenUsageError::Fetch)?;
        let model_report = tokscale_core::get_model_report(options.clone())
            .await
            .map_err(TokenUsageError::Fetch)?;
        let monthly_report = tokscale_core::get_monthly_report(options)
            .await
            .map_err(TokenUsageError::Fetch)?;

        Ok(CollectedTokenUsageReports {
            graph,
            model_report,
            monthly_report,
        })
    }
}

#[derive(Debug, Clone)]
struct CachedOverview {
    overview: TokenUsageOverview,
    fetched_at: u64,
}

pub struct TokenUsageService {
    collector: Arc<dyn TokenUsageCollector>,
    cache: Arc<RwLock<HashMap<String, CachedOverview>>>,
    cache_ttl: Duration,
    update_tx: broadcast::Sender<TokenUsageUpdate>,
}

impl Default for TokenUsageService {
    fn default() -> Self {
        Self::new(
            Arc::new(TokscaleCollector),
            Duration::from_secs(DEFAULT_CACHE_TTL_SECS),
        )
    }
}

impl TokenUsageService {
    pub(crate) fn new(collector: Arc<dyn TokenUsageCollector>, cache_ttl: Duration) -> Self {
        let (update_tx, _) = broadcast::channel(32);
        Self {
            collector,
            cache: Arc::new(RwLock::new(HashMap::new())),
            cache_ttl,
            update_tx,
        }
    }

    pub async fn get_overview(
        &self,
        query: TokenUsageQuery,
        refresh: bool,
    ) -> Result<TokenUsageOverview, TokenUsageError> {
        let query = query.normalized();
        let cache_key = cache_key(&query);

        if !refresh {
            let cache = self.cache.read().await;
            if let Some(cached) = cache.get(&cache_key) {
                if unix_now().saturating_sub(cached.fetched_at) < self.cache_ttl.as_secs() {
                    return Ok(cached.overview.clone());
                }
            }
        }

        let reports = self.collector.collect(&query).await?;
        let overview = build_overview(query.clone(), reports);

        {
            let mut cache = self.cache.write().await;
            cache.insert(
                cache_key,
                CachedOverview {
                    overview: overview.clone(),
                    fetched_at: unix_now(),
                },
            );
        }

        self.publish_update(TokenUsageUpdate {
            query,
            overview: overview.clone(),
        });

        Ok(overview)
    }

    pub fn subscribe_updates(&self) -> broadcast::Receiver<TokenUsageUpdate> {
        self.update_tx.subscribe()
    }

    fn publish_update(&self, update: TokenUsageUpdate) {
        let _ = self.update_tx.send(update);
    }
}

fn tokscale_options(query: &TokenUsageQuery) -> tokscale_core::ReportOptions {
    tokscale_core::ReportOptions {
        home_dir: None,
        clients: query.clients.clone(),
        since: query.since.clone(),
        until: query.until.clone(),
        year: query.year.clone(),
        group_by: query.group_by.to_tokscale(),
    }
}

fn build_overview(
    query: TokenUsageQuery,
    reports: CollectedTokenUsageReports,
) -> TokenUsageOverview {
    let summary = TokenUsageSummary {
        total_tokens: reports.graph.summary.total_tokens,
        total_cost_usd: finite_cost(reports.graph.summary.total_cost),
        total_messages: reports.model_report.total_messages,
        active_days: reports.graph.summary.active_days,
        range_start: non_empty(reports.graph.meta.date_range_start.clone()),
        range_end: non_empty(reports.graph.meta.date_range_end.clone()),
        processing_time_ms: reports.graph.meta.processing_time_ms
            + reports.model_report.processing_time_ms
            + reports.monthly_report.processing_time_ms,
    };

    TokenUsageOverview {
        query,
        summary,
        by_client: build_client_usage(&reports.graph),
        by_model: build_model_usage(&reports.model_report),
        by_day: build_daily_usage(&reports.graph),
        by_month: build_monthly_usage(&reports.monthly_report),
        available_years: reports
            .graph
            .years
            .iter()
            .map(|year| year.year.clone())
            .collect(),
        generated_at: unix_now(),
        partial_warnings: vec![],
    }
}

fn build_client_usage(graph: &tokscale_core::GraphResult) -> Vec<ClientTokenUsage> {
    #[derive(Default)]
    struct ClientAccumulator {
        total_tokens: i64,
        total_cost: f64,
        message_count: i32,
        models: HashSet<String>,
    }

    let mut by_client: HashMap<String, ClientAccumulator> = HashMap::new();

    for day in &graph.contributions {
        for client in &day.clients {
            let entry = by_client.entry(client.client.clone()).or_default();
            entry.total_tokens += client.tokens.total();
            entry.total_cost += client.cost;
            entry.message_count += client.messages;
            entry.models.insert(client.model_id.clone());
        }
    }

    let mut values = by_client
        .into_iter()
        .map(|(client_id, acc)| ClientTokenUsage {
            client_id,
            total_tokens: acc.total_tokens,
            total_cost_usd: finite_cost(acc.total_cost),
            message_count: acc.message_count,
            model_count: acc.models.len(),
        })
        .collect::<Vec<_>>();

    values.sort_by(|a, b| b.total_tokens.cmp(&a.total_tokens));
    values
}

fn build_model_usage(report: &tokscale_core::ModelReport) -> Vec<ModelTokenUsage> {
    report
        .entries
        .iter()
        .map(|entry| ModelTokenUsage {
            client_id: entry.client.clone(),
            provider_id: entry.provider.clone(),
            model_id: entry.model.clone(),
            input_tokens: entry.input,
            output_tokens: entry.output,
            cache_read_tokens: entry.cache_read,
            cache_write_tokens: entry.cache_write,
            reasoning_tokens: entry.reasoning,
            total_tokens: entry.input
                + entry.output
                + entry.cache_read
                + entry.cache_write
                + entry.reasoning,
            cost_usd: finite_cost(entry.cost),
            message_count: entry.message_count,
        })
        .collect()
}

fn build_daily_usage(graph: &tokscale_core::GraphResult) -> Vec<DailyTokenUsage> {
    graph
        .contributions
        .iter()
        .map(|day| DailyTokenUsage {
            date: day.date.clone(),
            breakdown: token_breakdown_from_tokscale(&day.token_breakdown),
            total_tokens: day.totals.tokens,
            total_cost_usd: finite_cost(day.totals.cost),
            message_count: day.totals.messages,
            by_client: day
                .clients
                .iter()
                .map(|client| DailyClientTokenUsage {
                    client_id: client.client.clone(),
                    model_id: client.model_id.clone(),
                    provider_id: client.provider_id.clone(),
                    breakdown: token_breakdown_from_tokscale(&client.tokens),
                    total_tokens: client.tokens.total(),
                    cost_usd: finite_cost(client.cost),
                    message_count: client.messages,
                })
                .collect(),
        })
        .collect()
}

fn build_monthly_usage(report: &tokscale_core::MonthlyReport) -> Vec<MonthlyTokenUsage> {
    report
        .entries
        .iter()
        .map(|entry| MonthlyTokenUsage {
            month: entry.month.clone(),
            breakdown: TokenBreakdown {
                input_tokens: entry.input,
                output_tokens: entry.output,
                cache_read_tokens: entry.cache_read,
                cache_write_tokens: entry.cache_write,
                reasoning_tokens: 0,
                total_tokens: entry.input + entry.output + entry.cache_read + entry.cache_write,
            },
            total_tokens: entry.input + entry.output + entry.cache_read + entry.cache_write,
            total_cost_usd: finite_cost(entry.cost),
            message_count: entry.message_count,
            models: entry.models.clone(),
        })
        .collect()
}

fn token_breakdown_from_tokscale(value: &tokscale_core::TokenBreakdown) -> TokenBreakdown {
    TokenBreakdown {
        input_tokens: value.input,
        output_tokens: value.output,
        cache_read_tokens: value.cache_read,
        cache_write_tokens: value.cache_write,
        reasoning_tokens: value.reasoning,
        total_tokens: value.total(),
    }
}

fn finite_cost(value: f64) -> Option<f64> {
    if value.is_finite() {
        Some(value)
    } else {
        None
    }
}

fn non_empty(value: String) -> Option<String> {
    if value.is_empty() {
        None
    } else {
        Some(value)
    }
}

fn cache_key(query: &TokenUsageQuery) -> String {
    serialize_key(query).unwrap_or_else(|_| "default".to_string())
}

fn serialize_key<T: Serialize>(value: &T) -> Result<String, serde_json::Error> {
    serde_json::to_string(value)
}

fn unix_now() -> u64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|duration| duration.as_secs())
        .unwrap_or_default()
}
