use std::sync::atomic::{AtomicUsize, Ordering};
use std::sync::Arc;
use std::time::{Duration, Instant};

use async_trait::async_trait;
use infra::jobs::{JobId, LocalScheduler};

use crate::{
    AuthState, AuthStateStatus, FetchState, FetchStateStatus, ProviderDescriptor, ProviderError,
    ProviderKind, ProviderStatus, QuotaProvider, QuotaUsageService,
    QUOTA_USAGE_AUTO_REFRESH_JOB_ID,
};

#[derive(Clone)]
struct MockProvider {
    id: &'static str,
    label: &'static str,
    latency: Duration,
    timeout: Duration,
}

#[async_trait]
impl QuotaProvider for MockProvider {
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
        footer_carousel_show: false,
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

/// Serialize tests that mutate `ATMOS_QUOTA_USAGE_DIR` / provider_state.json.
static QUOTA_DIR_LOCK: std::sync::Mutex<()> = std::sync::Mutex::new(());

struct IsolatedQuotaDir {
    path: std::path::PathBuf,
    _guard: std::sync::MutexGuard<'static, ()>,
}

impl IsolatedQuotaDir {
    fn enter() -> Self {
        let guard = QUOTA_DIR_LOCK
            .lock()
            .unwrap_or_else(|poisoned| poisoned.into_inner());
        let path = std::env::temp_dir().join(format!(
            "atmos-quota-usage-test-{}-{}",
            std::process::id(),
            std::time::SystemTime::now()
                .duration_since(std::time::UNIX_EPOCH)
                .map(|d| d.as_nanos())
                .unwrap_or(0)
        ));
        let _ = std::fs::remove_dir_all(&path);
        std::fs::create_dir_all(&path).expect("create isolated quota dir");
        // SAFETY: guarded by QUOTA_DIR_LOCK so no concurrent test mutates this env.
        std::env::set_var("ATMOS_QUOTA_USAGE_DIR", &path);
        Self {
            path,
            _guard: guard,
        }
    }
}

impl Drop for IsolatedQuotaDir {
    fn drop(&mut self) {
        std::env::remove_var("ATMOS_QUOTA_USAGE_DIR");
        let _ = std::fs::remove_dir_all(&self.path);
    }
}

#[tokio::test(flavor = "current_thread")]
async fn get_overview_refreshes_all_providers_in_parallel_and_preserves_order() {
    let _iso = IsolatedQuotaDir::enter();
    let service = QuotaUsageService::new(vec![
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
async fn cold_overview_skips_collect_for_disabled_providers() {
    let _iso = IsolatedQuotaDir::enter();
    let count_a = Arc::new(AtomicUsize::new(0));
    let count_b = Arc::new(AtomicUsize::new(0));
    let service = QuotaUsageService::new(vec![
        Arc::new(CountingProvider {
            id: "alpha",
            label: "Alpha",
            collect_count: Arc::clone(&count_a),
        }),
        Arc::new(CountingProvider {
            id: "beta",
            label: "Beta",
            collect_count: Arc::clone(&count_b),
        }),
    ]);

    // Disable alpha before any overview load (simulates user prefs on disk).
    let _ = service.set_provider_switch("alpha", false).await;
    // Clear in-memory cache so the next get_overview is a true cold path.
    // set_provider_switch seeds cache; force a fresh process-like read by
    // constructing a new service over the same on-disk switches.
    let service = QuotaUsageService::new(vec![
        Arc::new(CountingProvider {
            id: "alpha",
            label: "Alpha",
            collect_count: Arc::clone(&count_a),
        }),
        Arc::new(CountingProvider {
            id: "beta",
            label: "Beta",
            collect_count: Arc::clone(&count_b),
        }),
    ]);
    count_a.store(0, Ordering::SeqCst);
    count_b.store(0, Ordering::SeqCst);

    let overview = service.get_overview(false, None).await;

    assert_eq!(
        count_a.load(Ordering::SeqCst),
        0,
        "disabled alpha must not collect"
    );
    assert_eq!(
        count_b.load(Ordering::SeqCst),
        1,
        "enabled beta must collect once"
    );
    let alpha = overview
        .providers
        .iter()
        .find(|p| p.id == "alpha")
        .expect("alpha row");
    assert!(!alpha.switch_enabled);
    assert_eq!(alpha.fetch_state.status, FetchStateStatus::Unavailable);
    let beta = overview
        .providers
        .iter()
        .find(|p| p.id == "beta")
        .expect("beta row");
    assert!(beta.switch_enabled);
    assert_eq!(beta.fetch_state.status, FetchStateStatus::Ready);
}

#[tokio::test(flavor = "current_thread")]
async fn all_providers_off_cold_overview_collects_nothing() {
    let _iso = IsolatedQuotaDir::enter();
    let count = Arc::new(AtomicUsize::new(0));
    let service = QuotaUsageService::new(vec![
        Arc::new(CountingProvider {
            id: "one",
            label: "One",
            collect_count: Arc::clone(&count),
        }),
        Arc::new(CountingProvider {
            id: "two",
            label: "Two",
            collect_count: Arc::clone(&count),
        }),
    ]);

    let overview = service.set_all_provider_switch(false).await;
    assert_eq!(
        count.load(Ordering::SeqCst),
        0,
        "turning all off must not collect"
    );
    assert!(overview.providers.iter().all(|p| !p.switch_enabled));

    // Fresh service, cold cache, all switches still off on disk.
    let service = QuotaUsageService::new(vec![
        Arc::new(CountingProvider {
            id: "one",
            label: "One",
            collect_count: Arc::clone(&count),
        }),
        Arc::new(CountingProvider {
            id: "two",
            label: "Two",
            collect_count: Arc::clone(&count),
        }),
    ]);
    count.store(0, Ordering::SeqCst);

    let overview = service.get_overview(false, None).await;
    assert_eq!(
        count.load(Ordering::SeqCst),
        0,
        "cold overview with all switches off must not collect"
    );
    assert_eq!(overview.providers.len(), 2);
    assert!(overview.providers.iter().all(|p| !p.switch_enabled));
    assert!(overview
        .providers
        .iter()
        .all(|p| p.fetch_state.status == FetchStateStatus::Unavailable));
}

#[tokio::test(flavor = "current_thread")]
async fn provider_specific_refresh_updates_generated_at() {
    let _iso = IsolatedQuotaDir::enter();
    let service = QuotaUsageService::new(vec![Arc::new(MockProvider {
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

#[tokio::test(flavor = "current_thread")]
async fn attach_jobs_registers_and_cancels_auto_refresh() {
    let _iso = IsolatedQuotaDir::enter();
    let collect_count = Arc::new(AtomicUsize::new(0));
    let counter = Arc::clone(&collect_count);
    let service = QuotaUsageService::new(vec![Arc::new(CountingProvider {
        id: "counter",
        label: "Counter",
        collect_count: counter,
    })]);
    let jobs = Arc::new(LocalScheduler::new());
    let job_id = JobId::new(QUOTA_USAGE_AUTO_REFRESH_JOB_ID);

    // No timer until jobs are attached.
    assert!(!jobs.is_registered(&job_id).await);

    service
        .set_auto_refresh_interval(Some(1))
        .await
        .expect("set interval");
    // Still unregistered until attach_jobs.
    assert!(!jobs.is_registered(&job_id).await);

    service.attach_jobs(Arc::clone(&jobs)).await;
    assert!(jobs.is_registered(&job_id).await);

    service
        .set_auto_refresh_interval(None)
        .await
        .expect("disable");
    assert!(!jobs.is_registered(&job_id).await);

    jobs.shutdown().await.unwrap();
}

#[derive(Clone)]
struct CountingProvider {
    id: &'static str,
    label: &'static str,
    collect_count: Arc<AtomicUsize>,
}

#[async_trait]
impl QuotaProvider for CountingProvider {
    fn descriptor(&self) -> ProviderDescriptor {
        ProviderDescriptor {
            id: self.id.to_string(),
            label: self.label.to_string(),
        }
    }

    fn timeout(&self) -> Duration {
        Duration::from_millis(500)
    }

    async fn collect(&self) -> Result<ProviderStatus, ProviderError> {
        self.collect_count.fetch_add(1, Ordering::SeqCst);
        Ok(mock_status(self.id, self.label))
    }
}
