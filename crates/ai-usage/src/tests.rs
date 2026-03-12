use std::sync::Arc;
use std::time::{Duration, Instant};

use async_trait::async_trait;

use crate::{
    AuthState, AuthStateStatus, FetchState, FetchStateStatus, ProviderDescriptor, ProviderError,
    ProviderKind, ProviderStatus, UsageProvider, UsageService,
};

#[derive(Clone)]
struct MockProvider {
    id: &'static str,
    label: &'static str,
    latency: Duration,
    timeout: Duration,
}

#[async_trait]
impl UsageProvider for MockProvider {
    fn descriptor(&self) -> ProviderDescriptor {
        ProviderDescriptor {
            id: self.id.to_string(),
            label: self.label.to_string(),
        }
    }

    fn timeout(&self) -> Duration {
        self.timeout
    }

    async fn collect(&self) -> Result<ProviderStatus, ProviderError> {
        tokio::time::sleep(self.latency).await;
        Ok(mock_status(self.id, self.label))
    }
}

fn mock_status(id: &str, label: &str) -> ProviderStatus {
    ProviderStatus {
        id: id.to_string(),
        label: label.to_string(),
        kind: ProviderKind::Api,
        enabled: true,
        switch_enabled: true,
        healthy: true,
        last_updated_at: None,
        subscription_summary: None,
        usage_summary: None,
        detail_sections: vec![],
        warnings: vec![],
        auth_state: AuthState {
            status: AuthStateStatus::Detected,
            source: Some("test".to_string()),
            detail: None,
            setup_hint: None,
        },
        fetch_state: FetchState {
            status: FetchStateStatus::Ready,
            message: None,
        },
        manual_setup: None,
    }
}

#[tokio::test(flavor = "current_thread")]
async fn get_overview_refreshes_all_providers_in_parallel_and_preserves_order() {
    let service = UsageService::new(vec![
        Arc::new(MockProvider {
            id: "first",
            label: "First",
            latency: Duration::from_millis(120),
            timeout: Duration::from_millis(500),
        }),
        Arc::new(MockProvider {
            id: "second",
            label: "Second",
            latency: Duration::from_millis(120),
            timeout: Duration::from_millis(500),
        }),
        Arc::new(MockProvider {
            id: "third",
            label: "Third",
            latency: Duration::from_millis(120),
            timeout: Duration::from_millis(500),
        }),
    ]);

    let start = Instant::now();
    let overview = service.get_overview(false, None).await;
    let elapsed = start.elapsed();

    assert_eq!(
        overview
            .providers
            .iter()
            .map(|provider| provider.id.as_str())
            .collect::<Vec<_>>(),
        vec!["first", "second", "third"]
    );
    assert!(
        elapsed < Duration::from_millis(240),
        "expected concurrent refresh under 240ms, got {elapsed:?}"
    );
}

#[tokio::test(flavor = "current_thread")]
async fn provider_specific_refresh_updates_generated_at() {
    let service = UsageService::new(vec![Arc::new(MockProvider {
        id: "factory",
        label: "Factory",
        latency: Duration::from_millis(10),
        timeout: Duration::from_millis(500),
    })]);

    let initial = service.get_overview(false, None).await;
    tokio::time::sleep(Duration::from_millis(1_200)).await;
    let refreshed = service.get_overview(true, Some("factory")).await;

    assert!(
        refreshed.generated_at > initial.generated_at,
        "expected provider refresh to advance generated_at (initial={}, refreshed={})",
        initial.generated_at,
        refreshed.generated_at
    );
}
