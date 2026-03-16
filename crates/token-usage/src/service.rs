use std::collections::{HashMap, HashSet};
use std::fs;
use std::path::{Path, PathBuf};
use std::sync::Arc;
use std::time::{Duration, SystemTime, UNIX_EPOCH};

use async_trait::async_trait;
use serde::{Deserialize, Serialize};
use thiserror::Error;
use tokio::sync::{broadcast, Mutex, RwLock};

use crate::models::{
    ClientTokenUsage, DailyClientTokenUsage, DailyTokenUsage, ModelTokenUsage, MonthlyTokenUsage,
    TokenBreakdown, TokenUsageOverview, TokenUsageQuery, TokenUsageSummary, TokenUsageUpdate,
};

const DEFAULT_CACHE_TTL_SECS: u64 = 15 * 60;
const CACHE_FILE_NAME: &str = "overview-cache.json";

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
    pub(crate) processing_time_ms: u32,
    pub(crate) partial_warnings: Vec<String>,
}

#[async_trait]
pub(crate) trait TokenUsageCollector: Send + Sync {
    async fn collect(
        &self,
        query: &TokenUsageQuery,
        force_source_sync: bool,
    ) -> Result<CollectedTokenUsageReports, TokenUsageError>;
}

#[derive(Debug, Default)]
struct TokscaleCollector;

#[async_trait]
impl TokenUsageCollector for TokscaleCollector {
    async fn collect(
        &self,
        query: &TokenUsageQuery,
        force_source_sync: bool,
    ) -> Result<CollectedTokenUsageReports, TokenUsageError> {
        let sync_outcome = crate::cursor_sync::maybe_sync_cursor_csv(query, force_source_sync).await;

        let options = tokscale_options(query);

        let reports = tokscale_core::generate_usage_reports(options)
            .await
            .map_err(TokenUsageError::Fetch)?;

        Ok(CollectedTokenUsageReports {
            graph: reports.graph,
            model_report: reports.model_report,
            monthly_report: reports.monthly_report,
            processing_time_ms: reports.processing_time_ms,
            partial_warnings: sync_outcome.warnings,
        })
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
struct CachedOverview {
    overview: TokenUsageOverview,
    fetched_at: u64,
}

#[derive(Debug, Clone, Default, Serialize, Deserialize)]
struct CacheFile {
    #[serde(default)]
    entries: HashMap<String, CachedOverview>,
}

pub struct TokenUsageService {
    collector: Arc<dyn TokenUsageCollector>,
    cache: Arc<RwLock<HashMap<String, CachedOverview>>>,
    cache_path: Option<PathBuf>,
    refreshing_keys: Arc<Mutex<HashSet<String>>>,
    cache_ttl: Duration,
    update_tx: broadcast::Sender<TokenUsageUpdate>,
}

impl Default for TokenUsageService {
    fn default() -> Self {
        Self::new_with_cache_path(
            Arc::new(TokscaleCollector),
            Duration::from_secs(DEFAULT_CACHE_TTL_SECS),
            default_cache_path(),
        )
    }
}

impl TokenUsageService {
    #[cfg(test)]
    pub(crate) fn new(collector: Arc<dyn TokenUsageCollector>, cache_ttl: Duration) -> Self {
        Self::new_with_cache_path(collector, cache_ttl, None)
    }

    pub(crate) fn new_with_cache_path(
        collector: Arc<dyn TokenUsageCollector>,
        cache_ttl: Duration,
        cache_path: Option<PathBuf>,
    ) -> Self {
        let (update_tx, _) = broadcast::channel(32);
        let initial_cache = cache_path
            .as_ref()
            .map(load_cache_entries)
            .unwrap_or_default();

        Self {
            collector,
            cache: Arc::new(RwLock::new(initial_cache)),
            cache_path,
            refreshing_keys: Arc::new(Mutex::new(HashSet::new())),
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
                let cached_overview = cached.overview.clone();
                let is_stale =
                    unix_now().saturating_sub(cached.fetched_at) >= self.cache_ttl.as_secs();
                drop(cache);

                if is_stale {
                    self.spawn_background_refresh(query.clone(), cache_key.clone())
                        .await;
                }

                return Ok(cached_overview);
            }
        }

        self.collect_and_store(query, cache_key, refresh, refresh).await
    }

    pub fn subscribe_updates(&self) -> broadcast::Receiver<TokenUsageUpdate> {
        self.update_tx.subscribe()
    }

    fn publish_update(&self, update: TokenUsageUpdate) {
        let _ = self.update_tx.send(update);
    }

    async fn collect_and_store(
        &self,
        query: TokenUsageQuery,
        cache_key: String,
        publish_update: bool,
        force_source_sync: bool,
    ) -> Result<TokenUsageOverview, TokenUsageError> {
        let reports = self.collector.collect(&query, force_source_sync).await?;
        let overview = build_overview(query, reports);

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

        if publish_update {
            self.publish_update(TokenUsageUpdate {
                overview: overview.clone(),
            });
        }

        self.persist_cache_to_disk().await;

        Ok(overview)
    }

    async fn spawn_background_refresh(&self, query: TokenUsageQuery, cache_key: String) {
        let mut refreshing_keys = self.refreshing_keys.lock().await;
        if !refreshing_keys.insert(cache_key.clone()) {
            return;
        }
        drop(refreshing_keys);

        let collector = Arc::clone(&self.collector);
        let cache = Arc::clone(&self.cache);
        let cache_path = self.cache_path.clone();
        let update_tx = self.update_tx.clone();
        let refreshing_keys = Arc::clone(&self.refreshing_keys);

        tokio::spawn(async move {
            let result = collector
                .collect(&query, false)
                .await
                .map(|reports| build_overview(query, reports));

            if let Ok(overview) = result {
                {
                    let mut cache_guard = cache.write().await;
                    cache_guard.insert(
                        cache_key.clone(),
                        CachedOverview {
                            overview: overview.clone(),
                            fetched_at: unix_now(),
                        },
                    );
                }

                let _ = update_tx.send(TokenUsageUpdate { overview });
                persist_cache_snapshot(cache_path.as_deref(), &cache).await;
            }

            let mut refreshing_guard = refreshing_keys.lock().await;
            refreshing_guard.remove(&cache_key);
        });
    }

    async fn persist_cache_to_disk(&self) {
        persist_cache_snapshot(self.cache_path.as_deref(), &self.cache).await;
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
        processing_time_ms: reports.processing_time_ms,
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
        partial_warnings: reports.partial_warnings,
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
        .map(|entry| {
            let total_tokens = entry.input + entry.output + entry.cache_read + entry.cache_write;
            let breakdown = TokenBreakdown {
                input_tokens: entry.input,
                output_tokens: entry.output,
                cache_read_tokens: entry.cache_read,
                cache_write_tokens: entry.cache_write,
                // tokscale_core::MonthlyUsage does not currently expose reasoning tokens.
                // Keep this explicit so a future upstream field addition is easy to spot.
                reasoning_tokens: 0,
                total_tokens,
            };

            MonthlyTokenUsage {
                month: entry.month.clone(),
                total_tokens,
                breakdown,
                total_cost_usd: finite_cost(entry.cost),
                message_count: entry.message_count,
                models: entry.models.clone(),
            }
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

fn default_cache_path() -> Option<PathBuf> {
    if let Ok(data_dir) = std::env::var("ATMOS_DATA_DIR") {
        let trimmed = data_dir.trim();
        if !trimmed.is_empty() {
            return Some(
                PathBuf::from(trimmed)
                    .join("token-usage")
                    .join(CACHE_FILE_NAME),
            );
        }
    }

    dirs::home_dir().map(|home| {
        home.join(".atmos")
            .join("token-usage")
            .join(CACHE_FILE_NAME)
    })
}

fn load_cache_entries(path: &PathBuf) -> HashMap<String, CachedOverview> {
    let Ok(contents) = fs::read_to_string(path) else {
        return HashMap::new();
    };

    serde_json::from_str::<CacheFile>(&contents)
        .map(|file| file.entries)
        .unwrap_or_default()
}

async fn persist_cache_snapshot(
    path: Option<&Path>,
    cache: &Arc<RwLock<HashMap<String, CachedOverview>>>,
) {
    let Some(path) = path else {
        return;
    };

    let snapshot = {
        let cache_guard = cache.read().await;
        CacheFile {
            entries: cache_guard.clone(),
        }
    };

    if let Some(parent) = path.parent() {
        let _ = fs::create_dir_all(parent);
    }

    if let Ok(contents) = serde_json::to_string(&snapshot) {
        let _ = fs::write(path, contents);
    }
}
