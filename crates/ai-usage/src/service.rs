use std::sync::Arc;
use std::time::Duration;

use tokio::sync::RwLock;

use crate::config::persist_provider_manual_setup;
use crate::constants::CACHE_TTL_SECS;
use crate::models::{
    FetchStateStatus, ProviderStatus, UsageAggregate, UsageFetchIssue, UsageOverview,
};
use crate::refresh::{
    apply_provider_state, persist_all_provider_switch, persist_provider_state_for_overview,
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
}

impl Default for UsageService {
    fn default() -> Self {
        Self::new(default_providers())
    }
}

impl UsageService {
    pub fn new(providers: Vec<Arc<dyn UsageProvider>>) -> Self {
        Self {
            providers,
            cache: Arc::new(RwLock::new(None)),
            cache_ttl: Duration::from_secs(CACHE_TTL_SECS),
        }
    }

    pub async fn get_overview(&self, refresh: bool, provider_id: Option<&str>) -> UsageOverview {
        if !refresh && provider_id.is_none() {
            let cache = self.cache.read().await;
            if let Some(cache) = cache.as_ref() {
                if unix_now().saturating_sub(cache.fetched_at) < self.cache_ttl.as_secs() {
                    return apply_provider_state_and_rebuild(cache.overview.clone());
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
                })
        } else {
            self.refresh_overview(cached_previous.clone(), false).await
        };

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

        let overview = apply_provider_state_and_rebuild(overview);
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

        let overview = apply_provider_state_and_rebuild(overview);
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

        let mut cache = self.cache.write().await;
        *cache = Some(CachedOverview {
            fetched_at: unix_now(),
            overview: overview.clone(),
        });
        overview
    }

    async fn refresh_overview(
        &self,
        cached_previous: Option<CachedOverview>,
        honor_switches: bool,
    ) -> UsageOverview {
        let mut providers = Vec::with_capacity(self.providers.len());
        let mut issues = Vec::new();
        let mut success_count = 0usize;
        let mut refreshed_provider_ids = Vec::new();
        let previous_overview = cached_previous.as_ref().map(|cached| &cached.overview);

        for provider in &self.providers {
            let descriptor = provider.descriptor();
            let switch_enabled = if honor_switches {
                provider_switch_enabled(&descriptor.id)
            } else {
                true
            };

            if !switch_enabled {
                if let Some(existing) = previous_overview
                    .and_then(|overview| overview.providers.iter().find(|item| item.id == descriptor.id))
                    .cloned()
                {
                    providers.push(existing);
                } else {
                    let mut status =
                        error_status(&descriptor, "Provider refresh is turned off".to_string());
                    status.switch_enabled = false;
                    status.fetch_state.status = FetchStateStatus::Unavailable;
                    providers.push(status);
                }
                continue;
            }

            match tokio::time::timeout(provider.timeout(), provider.collect()).await {
                Ok(Ok(status)) => {
                    success_count += 1;
                    refreshed_provider_ids.push(status.id.clone());
                    providers.push(status);
                }
                Ok(Err(error)) => {
                    issues.push(UsageFetchIssue {
                        provider_id: descriptor.id.clone(),
                        provider_label: descriptor.label.clone(),
                        message: error.to_string(),
                    });
                    providers.push(error_status(&descriptor, error.to_string()));
                }
                Err(_) => {
                    let message = "Usage detection timed out".to_string();
                    issues.push(UsageFetchIssue {
                        provider_id: descriptor.id.clone(),
                        provider_label: descriptor.label.clone(),
                        message: message.clone(),
                    });
                    providers.push(error_status(&descriptor, message));
                }
            }
        }

        let overview = UsageOverview {
            all: build_aggregate(&providers),
            providers,
            generated_at: unix_now(),
            partial_failures: issues,
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
                });
        };

        let mut overview = cached_previous
            .map(|cached| cached.overview)
            .unwrap_or_else(|| UsageOverview {
                all: build_aggregate(&[]),
                providers: vec![],
                generated_at: unix_now(),
                partial_failures: vec![],
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

        overview.all = build_aggregate(&overview.providers);
        apply_provider_state_and_rebuild(overview)
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
        enabled_count: providers.iter().filter(|provider| provider.switch_enabled).count(),
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
