use std::sync::{Arc, Mutex};
use std::time::Duration;

use tokio::sync::{broadcast, RwLock};
use tokio::task::JoinHandle;
use tokio::time::MissedTickBehavior;
use tracing::{debug, info, warn};

use crate::config::{add_provider_api_key, delete_provider_api_key, persist_provider_manual_setup};
use crate::constants::CACHE_TTL_SECS;
use crate::models::{
    AutoRefreshConfig, FetchStateStatus, ProviderStatus, UsageAggregate, UsageFetchIssue,
    UsageOverview,
};
use crate::refresh::{
    apply_provider_state, load_auto_refresh_interval_minutes, persist_all_provider_switch,
    persist_auto_refresh_interval_minutes, persist_provider_state_for_overview,
    persist_provider_state_for_provider, persist_provider_switch, provider_switch_enabled,
};
use crate::runtime::{default_providers, error_status, UsageProvider};
use crate::support::{round_metric, unix_now};

#[derive(Debug, Clone)]
struct CachedOverview {
    overview: UsageOverview,
    fetched_at: u64,
}

#[derive(Clone)]
pub struct UsageService {
    providers: Vec<Arc<dyn UsageProvider>>,
    cache: Arc<RwLock<Option<CachedOverview>>>,
    cache_ttl: Duration,
    auto_refresh_interval_minutes: Arc<RwLock<Option<u64>>>,
    auto_refresh_task: Arc<Mutex<Option<JoinHandle<()>>>>,
    update_tx: broadcast::Sender<UsageOverview>,
}

impl Default for UsageService {
    fn default() -> Self {
        Self::new(default_providers())
    }
}

impl UsageService {
    pub fn new(providers: Vec<Arc<dyn UsageProvider>>) -> Self {
        let interval_minutes = load_auto_refresh_interval_minutes();
        let (update_tx, _) = broadcast::channel(32);

        let service = Self {
            providers,
            cache: Arc::new(RwLock::new(None)),
            cache_ttl: Duration::from_secs(CACHE_TTL_SECS),
            auto_refresh_interval_minutes: Arc::new(RwLock::new(interval_minutes)),
            auto_refresh_task: Arc::new(Mutex::new(None)),
            update_tx,
        };
        service.schedule_auto_refresh_task(interval_minutes);
        service
    }

    pub async fn get_overview(&self, refresh: bool, provider_id: Option<&str>) -> UsageOverview {
        if !refresh && provider_id.is_none() {
            let cache = self.cache.read().await;
            if let Some(cache) = cache.as_ref() {
                if unix_now().saturating_sub(cache.fetched_at) < self.cache_ttl.as_secs() {
                    return self
                        .with_auto_refresh_config(apply_provider_state_and_rebuild(
                            cache.overview.clone(),
                        ))
                        .await;
                }
            }
        }

        let cached_previous = self.cache.read().await.clone();
        let fresh = if refresh {
            match provider_id {
                Some(provider_id) => {
                    self.refresh_provider_overview(provider_id, cached_previous.clone())
                        .await
                }
                None => self.refresh_overview(cached_previous.clone(), true).await,
            }
        } else if provider_id.is_some() {
            cached_previous
                .map(|cached| apply_provider_state_and_rebuild(cached.overview))
                .unwrap_or_else(|| UsageOverview {
                    all: build_aggregate(&[]),
                    providers: vec![],
                    generated_at: unix_now(),
                    partial_failures: vec![],
                    auto_refresh: AutoRefreshConfig::default(),
                })
        } else {
            self.refresh_overview(cached_previous.clone(), false).await
        };
        let fresh = self.with_auto_refresh_config(fresh).await;

        let mut cache = self.cache.write().await;
        *cache = Some(CachedOverview {
            fetched_at: unix_now(),
            overview: fresh.clone(),
        });
        fresh
    }

    pub async fn set_provider_switch(&self, provider_id: &str, enabled: bool) -> UsageOverview {
        persist_provider_switch(provider_id, enabled);

        let mut overview = if let Some(cached) = self.cache.read().await.clone() {
            cached.overview
        } else {
            self.refresh_overview(None, false).await
        };

        if let Some(provider) = overview
            .providers
            .iter_mut()
            .find(|provider| provider.id == provider_id)
        {
            provider.switch_enabled = enabled;
        }

        let overview = self
            .with_auto_refresh_config(apply_provider_state_and_rebuild(overview))
            .await;
        let mut cache = self.cache.write().await;
        *cache = Some(CachedOverview {
            fetched_at: unix_now(),
            overview: overview.clone(),
        });
        overview
    }

    pub async fn set_all_provider_switch(&self, enabled: bool) -> UsageOverview {
        let mut overview = if let Some(cached) = self.cache.read().await.clone() {
            cached.overview
        } else {
            self.refresh_overview(None, false).await
        };

        let provider_ids = overview
            .providers
            .iter()
            .map(|provider| provider.id.clone())
            .collect::<Vec<_>>();
        persist_all_provider_switch(&provider_ids, enabled);

        for provider in &mut overview.providers {
            provider.switch_enabled = enabled;
        }

        let overview = self
            .with_auto_refresh_config(apply_provider_state_and_rebuild(overview))
            .await;
        let mut cache = self.cache.write().await;
        *cache = Some(CachedOverview {
            fetched_at: unix_now(),
            overview: overview.clone(),
        });
        overview
    }

    pub async fn set_provider_manual_setup(
        &self,
        provider_id: &str,
        region: Option<String>,
        api_key: Option<String>,
    ) -> UsageOverview {
        persist_provider_manual_setup(provider_id, region, api_key);

        let cached_previous = self.cache.read().await.clone();
        let overview = self
            .refresh_provider_overview(provider_id, cached_previous)
            .await;
        let overview = self.with_auto_refresh_config(overview).await;

        let mut cache = self.cache.write().await;
        *cache = Some(CachedOverview {
            fetched_at: unix_now(),
            overview: overview.clone(),
        });
        overview
    }

    pub async fn add_provider_api_key(
        &self,
        provider_id: &str,
        region: Option<String>,
        api_key: String,
    ) -> UsageOverview {
        add_provider_api_key(provider_id, region, api_key);

        let cached_previous = self.cache.read().await.clone();
        let overview = self
            .refresh_provider_overview(provider_id, cached_previous)
            .await;
        let overview = self.with_auto_refresh_config(overview).await;

        let mut cache = self.cache.write().await;
        *cache = Some(CachedOverview {
            fetched_at: unix_now(),
            overview: overview.clone(),
        });
        overview
    }

    pub async fn delete_provider_api_key(&self, provider_id: &str, key_id: &str) -> UsageOverview {
        delete_provider_api_key(provider_id, key_id);

        let cached_previous = self.cache.read().await.clone();
        let overview = self
            .refresh_provider_overview(provider_id, cached_previous)
            .await;
        let overview = self.with_auto_refresh_config(overview).await;

        let mut cache = self.cache.write().await;
        *cache = Some(CachedOverview {
            fetched_at: unix_now(),
            overview: overview.clone(),
        });
        overview
    }

    pub async fn set_auto_refresh_interval(
        &self,
        interval_minutes: Option<u64>,
    ) -> Result<UsageOverview, String> {
        if let Some(interval_minutes) = interval_minutes {
            if !matches!(interval_minutes, 1 | 5 | 15 | 30 | 60) {
                return Err("Unsupported auto-refresh interval".to_string());
            }
        }

        persist_auto_refresh_interval_minutes(interval_minutes);
        {
            let mut current = self.auto_refresh_interval_minutes.write().await;
            *current = interval_minutes;
        }

        let refresh = interval_minutes.is_some();
        let overview = self.get_overview(refresh, None).await;
        self.publish_overview_update(&overview);
        self.schedule_auto_refresh_task(interval_minutes);
        Ok(overview)
    }

    pub fn subscribe_updates(&self) -> broadcast::Receiver<UsageOverview> {
        self.update_tx.subscribe()
    }

    fn schedule_auto_refresh_task(&self, interval_minutes: Option<u64>) {
        let mut task = match self.auto_refresh_task.lock() {
            Ok(task) => task,
            Err(error) => {
                warn!(
                    "Failed to lock AI usage auto-refresh task handle: {}",
                    error
                );
                return;
            }
        };

        if let Some(existing) = task.take() {
            existing.abort();
        }

        let Some(interval_minutes) = interval_minutes else {
            info!("AI usage auto-refresh disabled");
            return;
        };

        info!(
            "AI usage auto-refresh scheduled every {} minute(s)",
            interval_minutes
        );

        let service = self.clone();
        *task = Some(tokio::spawn(async move {
            let mut ticker = tokio::time::interval(Duration::from_secs(interval_minutes * 60));
            ticker.set_missed_tick_behavior(MissedTickBehavior::Skip);
            ticker.tick().await;

            loop {
                ticker.tick().await;
                debug!(
                    "Running scheduled AI usage overview refresh (interval={}m)",
                    interval_minutes
                );
                let overview = service.get_overview(true, None).await;
                service.publish_overview_update(&overview);
            }
        }));
    }

    async fn with_auto_refresh_config(&self, mut overview: UsageOverview) -> UsageOverview {
        overview.auto_refresh = AutoRefreshConfig {
            interval_minutes: *self.auto_refresh_interval_minutes.read().await,
        };
        overview
    }

    fn publish_overview_update(&self, overview: &UsageOverview) {
        let _ = self.update_tx.send(overview.clone());
    }

    async fn refresh_overview(
        &self,
        cached_previous: Option<CachedOverview>,
        honor_switches: bool,
    ) -> UsageOverview {
        let mut providers = vec![None; self.providers.len()];
        let mut issues = Vec::new();
        let mut success_count = 0usize;
        let mut refreshed_provider_ids = Vec::new();
        let previous_overview = cached_previous.as_ref().map(|cached| &cached.overview);
        let mut pending_refreshes = Vec::new();

        for (index, provider) in self.providers.iter().enumerate() {
            let descriptor = provider.descriptor();
            let switch_enabled = if honor_switches {
                provider_switch_enabled(&descriptor.id)
            } else {
                true
            };

            if !switch_enabled {
                if let Some(existing) = previous_overview
                    .and_then(|overview| {
                        overview
                            .providers
                            .iter()
                            .find(|item| item.id == descriptor.id)
                    })
                    .cloned()
                {
                    providers[index] = Some(existing);
                } else {
                    let mut status =
                        error_status(&descriptor, "Provider refresh is turned off".to_string());
                    status.switch_enabled = false;
                    status.fetch_state.status = FetchStateStatus::Unavailable;
                    providers[index] = Some(status);
                }
                continue;
            }

            pending_refreshes.push((
                index,
                descriptor,
                tokio::spawn(refresh_provider_status(index, Arc::clone(provider))),
            ));
        }

        for (index, descriptor, handle) in pending_refreshes {
            let refreshed = match handle.await {
                Ok(refreshed) => refreshed,
                Err(error) => {
                    let message = format!("Usage detection task failed: {error}");
                    ProviderRefreshResult {
                        index,
                        status: error_status(&descriptor, message.clone()),
                        issue: Some(UsageFetchIssue {
                            provider_id: descriptor.id.clone(),
                            provider_label: descriptor.label.clone(),
                            message,
                        }),
                        refreshed_provider_id: None,
                        succeeded: false,
                    }
                }
            };

            if refreshed.succeeded {
                success_count += 1;
            }
            if let Some(provider_id) = refreshed.refreshed_provider_id {
                refreshed_provider_ids.push(provider_id);
            }
            if let Some(issue) = refreshed.issue {
                issues.push(issue);
            }
            providers[refreshed.index] = Some(refreshed.status);
        }

        let providers = providers.into_iter().flatten().collect::<Vec<_>>();

        let overview = UsageOverview {
            all: build_aggregate(&providers),
            providers,
            generated_at: unix_now(),
            partial_failures: issues,
            auto_refresh: AutoRefreshConfig::default(),
        };

        if success_count == 0 {
            if let Some(previous) = cached_previous {
                return apply_provider_state_and_rebuild(UsageOverview {
                    partial_failures: overview.partial_failures,
                    generated_at: overview.generated_at,
                    ..previous.overview
                });
            }
        }

        persist_provider_state_for_overview(&overview, &refreshed_provider_ids);

        apply_provider_state_and_rebuild(overview)
    }

    async fn refresh_provider_overview(
        &self,
        provider_id: &str,
        cached_previous: Option<CachedOverview>,
    ) -> UsageOverview {
        let Some(provider) = self
            .providers
            .iter()
            .find(|provider| provider.descriptor().id == provider_id)
        else {
            return cached_previous
                .map(|cached| apply_provider_state_and_rebuild(cached.overview))
                .unwrap_or_else(|| UsageOverview {
                    all: build_aggregate(&[]),
                    providers: vec![],
                    generated_at: unix_now(),
                    partial_failures: vec![UsageFetchIssue {
                        provider_id: provider_id.to_string(),
                        provider_label: provider_id.to_string(),
                        message: "Unknown usage provider".to_string(),
                    }],
                    auto_refresh: AutoRefreshConfig::default(),
                });
        };

        let mut overview = cached_previous
            .map(|cached| cached.overview)
            .unwrap_or_else(|| UsageOverview {
                all: build_aggregate(&[]),
                providers: vec![],
                generated_at: unix_now(),
                partial_failures: vec![],
                auto_refresh: AutoRefreshConfig::default(),
            });

        if overview.providers.is_empty() {
            return self.refresh_overview(None, false).await;
        }

        let descriptor = provider.descriptor();
        let refreshed_status =
            match tokio::time::timeout(provider.timeout(), provider.collect()).await {
                Ok(Ok(status)) => {
                    persist_provider_state_for_provider(
                        &status.id,
                        provider_switch_enabled(&status.id),
                    );
                    status
                }
                Ok(Err(error)) => error_status(&descriptor, error.to_string()),
                Err(_) => error_status(&descriptor, "Usage detection timed out".to_string()),
            };

        if let Some(existing) = overview
            .providers
            .iter_mut()
            .find(|existing| existing.id == provider_id)
        {
            *existing = refreshed_status;
        } else {
            overview.providers.push(refreshed_status);
        }

        overview
            .partial_failures
            .retain(|issue| issue.provider_id != provider_id);
        if matches!(
            overview
                .providers
                .iter()
                .find(|provider| provider.id == provider_id)
                .map(|provider| &provider.fetch_state.status),
            Some(FetchStateStatus::Error)
        ) {
            if let Some(provider) = overview
                .providers
                .iter()
                .find(|provider| provider.id == provider_id)
            {
                overview.partial_failures.push(UsageFetchIssue {
                    provider_id: provider.id.clone(),
                    provider_label: provider.label.clone(),
                    message: provider
                        .fetch_state
                        .message
                        .clone()
                        .unwrap_or_else(|| "Provider refresh failed".to_string()),
                });
            }
        }

        let generated_at = unix_now();
        overview.generated_at = generated_at;
        overview.all = build_aggregate(&overview.providers);
        let mut overview = apply_provider_state_and_rebuild(overview);
        overview.generated_at = generated_at;
        overview
    }
}

struct ProviderRefreshResult {
    index: usize,
    status: ProviderStatus,
    issue: Option<UsageFetchIssue>,
    refreshed_provider_id: Option<String>,
    succeeded: bool,
}

async fn refresh_provider_status(
    index: usize,
    provider: Arc<dyn UsageProvider>,
) -> ProviderRefreshResult {
    let descriptor = provider.descriptor();
    match tokio::time::timeout(provider.timeout(), provider.collect()).await {
        Ok(Ok(status)) => ProviderRefreshResult {
            index,
            refreshed_provider_id: Some(status.id.clone()),
            status,
            issue: None,
            succeeded: true,
        },
        Ok(Err(error)) => {
            let message = error.to_string();
            ProviderRefreshResult {
                index,
                status: error_status(&descriptor, message.clone()),
                issue: Some(UsageFetchIssue {
                    provider_id: descriptor.id.clone(),
                    provider_label: descriptor.label.clone(),
                    message,
                }),
                refreshed_provider_id: None,
                succeeded: false,
            }
        }
        Err(_) => {
            let message = "Usage detection timed out".to_string();
            ProviderRefreshResult {
                index,
                status: error_status(&descriptor, message.clone()),
                issue: Some(UsageFetchIssue {
                    provider_id: descriptor.id.clone(),
                    provider_label: descriptor.label.clone(),
                    message,
                }),
                refreshed_provider_id: None,
                succeeded: false,
            }
        }
    }
}

fn apply_provider_state_and_rebuild(mut overview: UsageOverview) -> UsageOverview {
    overview = apply_provider_state(overview);
    overview.all = build_aggregate(&overview.providers);
    overview
}

fn build_aggregate(providers: &[ProviderStatus]) -> UsageAggregate {
    let switched: Vec<&ProviderStatus> = providers
        .iter()
        .filter(|provider| provider.switch_enabled)
        .collect();
    let enabled: Vec<&ProviderStatus> = switched
        .iter()
        .copied()
        .filter(|provider| provider.enabled)
        .collect();

    let active_subscription_count = switched
        .iter()
        .filter(|provider| provider.subscription_summary.is_some())
        .count();

    let near_limit_sources = enabled
        .iter()
        .filter_map(|provider| {
            let percent = provider.usage_summary.as_ref()?.percent?;
            if percent >= 80.0 {
                Some(provider.label.clone())
            } else {
                None
            }
        })
        .collect::<Vec<_>>();

    let degraded_sources = switched
        .iter()
        .filter(|provider| {
            matches!(
                provider.fetch_state.status,
                FetchStateStatus::Error | FetchStateStatus::Partial
            )
        })
        .map(|provider| provider.label.clone())
        .collect::<Vec<_>>();

    let soonest_reset_at = enabled
        .iter()
        .filter_map(|provider| provider.subscription_summary.as_ref()?.reset_at)
        .min();

    let mut comparable_currency: Option<String> = None;
    let mut comparable = true;
    let mut total_used = 0.0;
    let mut total_remaining = 0.0;
    let mut found_credit_rows = 0usize;

    for provider in enabled {
        let Some(summary) = provider.usage_summary.as_ref() else {
            continue;
        };
        if summary.unit.as_deref() != Some("credits") {
            continue;
        }
        let currency = summary
            .currency
            .clone()
            .unwrap_or_else(|| "credits".to_string());
        match comparable_currency.as_ref() {
            None => comparable_currency = Some(currency.clone()),
            Some(existing) if existing != &currency => {
                comparable = false;
                break;
            }
            _ => {}
        }
        if let Some(value) = summary.used {
            total_used += value;
        }
        if let Some(value) = summary.remaining {
            total_remaining += value;
        }
        found_credit_rows += 1;
    }

    UsageAggregate {
        enabled_count: providers
            .iter()
            .filter(|provider| provider.switch_enabled)
            .count(),
        total_count: providers.len(),
        active_subscription_count,
        comparable_credit_currency: if comparable && found_credit_rows > 0 {
            comparable_currency
        } else {
            None
        },
        total_credits_used: if comparable && found_credit_rows > 0 {
            Some(round_metric(total_used))
        } else {
            None
        },
        total_credits_remaining: if comparable && found_credit_rows > 0 {
            Some(round_metric(total_remaining))
        } else {
            None
        },
        near_limit_sources,
        degraded_sources,
        soonest_reset_at,
    }
}
