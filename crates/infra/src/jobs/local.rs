use std::collections::HashMap;
use std::future::Future;
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::Arc;
use std::time::Duration;

use tokio::sync::Mutex;
use tokio::task::JoinHandle;
use tokio::time::MissedTickBehavior;
use tracing::{debug, warn};

use super::types::{
    IntervalSpec, JobError, JobId, JobResult, JobsError, RetryPolicy,
};

type DynHandler = Arc<dyn Fn() -> std::pin::Pin<Box<dyn Future<Output = JobResult> + Send>> + Send + Sync>;

struct RegisteredJob {
    cancel: Arc<AtomicBool>,
    handle: JoinHandle<()>,
}

/// Process-local interval job scheduler (APP-051 LocalScheduler).
pub struct LocalScheduler {
    jobs: Mutex<HashMap<JobId, RegisteredJob>>,
    shutting_down: AtomicBool,
}

impl Default for LocalScheduler {
    fn default() -> Self {
        Self::new()
    }
}

impl LocalScheduler {
    pub fn new() -> Self {
        Self {
            jobs: Mutex::new(HashMap::new()),
            shutting_down: AtomicBool::new(false),
        }
    }

    /// Register or replace an interval job with the same [`JobId`].
    pub async fn set_interval_job<F, Fut>(
        &self,
        id: JobId,
        spec: IntervalSpec,
        retry: RetryPolicy,
        handler: F,
    ) -> Result<(), JobsError>
    where
        F: Fn() -> Fut + Send + Sync + 'static,
        Fut: Future<Output = JobResult> + Send + 'static,
    {
        if self.shutting_down.load(Ordering::SeqCst) {
            return Err(JobsError::ShuttingDown);
        }
        if spec.every.is_zero() {
            return Err(JobsError::InvalidInterval);
        }

        let dyn_handler: DynHandler = Arc::new(move || {
            let fut = handler();
            Box::pin(fut) as std::pin::Pin<Box<dyn Future<Output = JobResult> + Send>>
        });

        let cancel = Arc::new(AtomicBool::new(false));
        let cancel_for_task = Arc::clone(&cancel);
        let id_for_task = id.clone();
        let every = spec.every;
        let skip_if_running = spec.skip_if_running;
        let fire_immediately = spec.fire_immediately;
        let retry = retry.clone();

        let handle = tokio::spawn(async move {
            let mut interval = tokio::time::interval(every);
            interval.set_missed_tick_behavior(MissedTickBehavior::Skip);

            // First interval.tick() completes immediately; absorb it when not firing immediately.
            interval.tick().await;
            if !fire_immediately {
                // Wait one full period before the first real firing.
                tokio::select! {
                    _ = interval.tick() => {}
                    _ = wait_cancelled(&cancel_for_task) => return,
                }
            }

            let running = Arc::new(AtomicBool::new(false));

            loop {
                if cancel_for_task.load(Ordering::SeqCst) {
                    break;
                }

                if skip_if_running && running.swap(true, Ordering::SeqCst) {
                    debug!(
                        job_id = %id_for_task,
                        "skipping interval tick; previous firing still running"
                    );
                    tokio::select! {
                        _ = interval.tick() => {}
                        _ = wait_cancelled(&cancel_for_task) => break,
                    }
                    continue;
                }

                if !skip_if_running {
                    running.store(true, Ordering::SeqCst);
                }

                let handler = Arc::clone(&dyn_handler);
                let job_id = id_for_task.clone();
                let retry_policy = retry.clone();
                let running_flag = Arc::clone(&running);

                // Run firing without blocking the interval loop when skip_if_running
                // is false we still wait (sequential). When skip_if_running is true,
                // spawn the work so the next tick can observe in-flight and skip.
                if skip_if_running {
                    tokio::spawn(async move {
                        run_with_retry(&job_id, &retry_policy, handler).await;
                        running_flag.store(false, Ordering::SeqCst);
                    });
                } else {
                    run_with_retry(&job_id, &retry_policy, handler).await;
                    running_flag.store(false, Ordering::SeqCst);
                }

                tokio::select! {
                    _ = interval.tick() => {}
                    _ = wait_cancelled(&cancel_for_task) => break,
                }
            }
        });

        let mut jobs = self.jobs.lock().await;
        if let Some(previous) = jobs.remove(&id) {
            previous.cancel.store(true, Ordering::SeqCst);
            previous.handle.abort();
        }
        jobs.insert(
            id,
            RegisteredJob {
                cancel,
                handle,
            },
        );
        Ok(())
    }

    pub async fn cancel(&self, id: &JobId) -> Result<(), JobsError> {
        let mut jobs = self.jobs.lock().await;
        if let Some(job) = jobs.remove(id) {
            job.cancel.store(true, Ordering::SeqCst);
            job.handle.abort();
            Ok(())
        } else {
            Err(JobsError::NotRegistered(id.as_str().to_string()))
        }
    }

    pub async fn is_registered(&self, id: &JobId) -> bool {
        self.jobs.lock().await.contains_key(id)
    }

    pub async fn shutdown(&self) -> Result<(), JobsError> {
        self.shutting_down.store(true, Ordering::SeqCst);
        let mut jobs = self.jobs.lock().await;
        for (_, job) in jobs.drain() {
            job.cancel.store(true, Ordering::SeqCst);
            job.handle.abort();
        }
        Ok(())
    }
}

async fn wait_cancelled(cancel: &AtomicBool) {
    while !cancel.load(Ordering::SeqCst) {
        tokio::time::sleep(Duration::from_millis(25)).await;
    }
}

async fn run_with_retry(job_id: &JobId, retry: &RetryPolicy, handler: DynHandler) {
    let max_attempts = retry.max_attempts.max(1);
    let mut delay = retry.initial_delay;

    for attempt in 1..=max_attempts {
        if attempt > 1 {
            debug!(
                job_id = %job_id,
                attempt,
                delay_ms = delay.as_millis() as u64,
                "retrying job firing"
            );
            tokio::time::sleep(delay).await;
            let next = Duration::from_secs_f64(
                (delay.as_secs_f64() * retry.multiplier).min(retry.max_delay.as_secs_f64()),
            );
            delay = if next.is_zero() { retry.max_delay } else { next };
        }

        match handler().await {
            Ok(()) => return,
            Err(JobError::Fatal(message)) => {
                warn!(job_id = %job_id, attempt, error = %message, "job firing failed fatally");
                return;
            }
            Err(JobError::Retryable(message)) => {
                warn!(
                    job_id = %job_id,
                    attempt,
                    max_attempts,
                    error = %message,
                    "job firing failed (retryable)"
                );
                if attempt == max_attempts {
                    return;
                }
            }
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::sync::atomic::AtomicUsize;
    use std::time::Duration;

    #[tokio::test]
    async fn interval_job_fires_with_fire_immediately() {
        let scheduler = LocalScheduler::new();
        let counter = Arc::new(AtomicUsize::new(0));
        let c = Arc::clone(&counter);
        scheduler
            .set_interval_job(
                JobId::new("test.fire"),
                IntervalSpec {
                    every: Duration::from_millis(40),
                    skip_if_running: true,
                    fire_immediately: true,
                },
                RetryPolicy::none(),
                move || {
                    let c = Arc::clone(&c);
                    async move {
                        c.fetch_add(1, Ordering::SeqCst);
                        Ok(())
                    }
                },
            )
            .await
            .unwrap();

        tokio::time::sleep(Duration::from_millis(130)).await;
        let count = counter.load(Ordering::SeqCst);
        assert!(count >= 2, "expected >=2 firings, got {count}");
        scheduler.shutdown().await.unwrap();
    }

    #[tokio::test]
    async fn fire_immediately_false_waits_one_period() {
        let scheduler = LocalScheduler::new();
        let counter = Arc::new(AtomicUsize::new(0));
        let c = Arc::clone(&counter);
        scheduler
            .set_interval_job(
                JobId::new("test.delayed"),
                IntervalSpec {
                    every: Duration::from_millis(80),
                    skip_if_running: true,
                    fire_immediately: false,
                },
                RetryPolicy::none(),
                move || {
                    let c = Arc::clone(&c);
                    async move {
                        c.fetch_add(1, Ordering::SeqCst);
                        Ok(())
                    }
                },
            )
            .await
            .unwrap();

        tokio::time::sleep(Duration::from_millis(40)).await;
        assert_eq!(counter.load(Ordering::SeqCst), 0);
        tokio::time::sleep(Duration::from_millis(100)).await;
        assert!(counter.load(Ordering::SeqCst) >= 1);
        scheduler.shutdown().await.unwrap();
    }

    #[tokio::test]
    async fn cancel_stops_future_ticks() {
        let scheduler = LocalScheduler::new();
        let counter = Arc::new(AtomicUsize::new(0));
        let c = Arc::clone(&counter);
        let id = JobId::new("test.cancel");
        scheduler
            .set_interval_job(
                id.clone(),
                IntervalSpec {
                    every: Duration::from_millis(30),
                    skip_if_running: true,
                    fire_immediately: true,
                },
                RetryPolicy::none(),
                move || {
                    let c = Arc::clone(&c);
                    async move {
                        c.fetch_add(1, Ordering::SeqCst);
                        Ok(())
                    }
                },
            )
            .await
            .unwrap();

        tokio::time::sleep(Duration::from_millis(70)).await;
        scheduler.cancel(&id).await.unwrap();
        let after_cancel = counter.load(Ordering::SeqCst);
        tokio::time::sleep(Duration::from_millis(100)).await;
        assert_eq!(counter.load(Ordering::SeqCst), after_cancel);
        assert!(!scheduler.is_registered(&id).await);
    }

    #[tokio::test]
    async fn replace_same_id_switches_handler() {
        let scheduler = LocalScheduler::new();
        let gen = Arc::new(AtomicUsize::new(0));
        let g1 = Arc::clone(&gen);
        let id = JobId::new("test.replace");
        scheduler
            .set_interval_job(
                id.clone(),
                IntervalSpec {
                    every: Duration::from_millis(40),
                    skip_if_running: true,
                    fire_immediately: true,
                },
                RetryPolicy::none(),
                move || {
                    let g1 = Arc::clone(&g1);
                    async move {
                        g1.store(1, Ordering::SeqCst);
                        Ok(())
                    }
                },
            )
            .await
            .unwrap();

        let g2 = Arc::clone(&gen);
        scheduler
            .set_interval_job(
                id.clone(),
                IntervalSpec {
                    every: Duration::from_millis(40),
                    skip_if_running: true,
                    fire_immediately: true,
                },
                RetryPolicy::none(),
                move || {
                    let g2 = Arc::clone(&g2);
                    async move {
                        g2.store(2, Ordering::SeqCst);
                        Ok(())
                    }
                },
            )
            .await
            .unwrap();

        tokio::time::sleep(Duration::from_millis(90)).await;
        assert_eq!(gen.load(Ordering::SeqCst), 2);
        assert!(scheduler.is_registered(&id).await);
        scheduler.shutdown().await.unwrap();
    }

    #[tokio::test]
    async fn skip_if_running_prevents_overlap() {
        let scheduler = LocalScheduler::new();
        let in_flight = Arc::new(AtomicUsize::new(0));
        let max_in_flight = Arc::new(AtomicUsize::new(0));
        let inflight = Arc::clone(&in_flight);
        let max = Arc::clone(&max_in_flight);
        scheduler
            .set_interval_job(
                JobId::new("test.skip"),
                IntervalSpec {
                    every: Duration::from_millis(20),
                    skip_if_running: true,
                    fire_immediately: true,
                },
                RetryPolicy::none(),
                move || {
                    let inflight = Arc::clone(&inflight);
                    let max = Arc::clone(&max);
                    async move {
                        let current = inflight.fetch_add(1, Ordering::SeqCst) + 1;
                        max.fetch_max(current, Ordering::SeqCst);
                        tokio::time::sleep(Duration::from_millis(70)).await;
                        inflight.fetch_sub(1, Ordering::SeqCst);
                        Ok(())
                    }
                },
            )
            .await
            .unwrap();

        tokio::time::sleep(Duration::from_millis(150)).await;
        assert_eq!(max_in_flight.load(Ordering::SeqCst), 1);
        scheduler.shutdown().await.unwrap();
    }

    #[tokio::test]
    async fn retryable_errors_are_retried() {
        let scheduler = LocalScheduler::new();
        let attempts = Arc::new(AtomicUsize::new(0));
        let a = Arc::clone(&attempts);
        let done = Arc::new(AtomicBool::new(false));
        let d = Arc::clone(&done);
        scheduler
            .set_interval_job(
                JobId::new("test.retry"),
                IntervalSpec {
                    every: Duration::from_secs(10),
                    skip_if_running: true,
                    fire_immediately: true,
                },
                RetryPolicy {
                    max_attempts: 3,
                    initial_delay: Duration::from_millis(5),
                    max_delay: Duration::from_millis(20),
                    multiplier: 2.0,
                },
                move || {
                    let a = Arc::clone(&a);
                    let d = Arc::clone(&d);
                    async move {
                        let n = a.fetch_add(1, Ordering::SeqCst) + 1;
                        if n < 3 {
                            Err(JobError::Retryable("transient".into()))
                        } else {
                            d.store(true, Ordering::SeqCst);
                            Ok(())
                        }
                    }
                },
            )
            .await
            .unwrap();

        tokio::time::sleep(Duration::from_millis(200)).await;
        assert!(done.load(Ordering::SeqCst));
        assert!(attempts.load(Ordering::SeqCst) >= 3);
        scheduler.shutdown().await.unwrap();
    }

    #[tokio::test]
    async fn fatal_errors_do_not_retry() {
        let scheduler = LocalScheduler::new();
        let attempts = Arc::new(AtomicUsize::new(0));
        let a = Arc::clone(&attempts);
        scheduler
            .set_interval_job(
                JobId::new("test.fatal"),
                IntervalSpec {
                    every: Duration::from_secs(10),
                    skip_if_running: true,
                    fire_immediately: true,
                },
                RetryPolicy {
                    max_attempts: 5,
                    initial_delay: Duration::from_millis(5),
                    max_delay: Duration::from_millis(20),
                    multiplier: 2.0,
                },
                move || {
                    let a = Arc::clone(&a);
                    async move {
                        a.fetch_add(1, Ordering::SeqCst);
                        Err(JobError::Fatal("boom".into()))
                    }
                },
            )
            .await
            .unwrap();

        tokio::time::sleep(Duration::from_millis(80)).await;
        assert_eq!(attempts.load(Ordering::SeqCst), 1);
        scheduler.shutdown().await.unwrap();
    }

    #[tokio::test]
    async fn shutdown_stops_jobs() {
        let scheduler = LocalScheduler::new();
        let counter = Arc::new(AtomicUsize::new(0));
        let c = Arc::clone(&counter);
        scheduler
            .set_interval_job(
                JobId::new("test.shutdown"),
                IntervalSpec {
                    every: Duration::from_millis(30),
                    skip_if_running: true,
                    fire_immediately: true,
                },
                RetryPolicy::none(),
                move || {
                    let c = Arc::clone(&c);
                    async move {
                        c.fetch_add(1, Ordering::SeqCst);
                        Ok(())
                    }
                },
            )
            .await
            .unwrap();

        tokio::time::sleep(Duration::from_millis(50)).await;
        scheduler.shutdown().await.unwrap();
        let after = counter.load(Ordering::SeqCst);
        tokio::time::sleep(Duration::from_millis(80)).await;
        assert_eq!(counter.load(Ordering::SeqCst), after);
        assert!(matches!(
            scheduler
                .set_interval_job(
                    JobId::new("after"),
                    IntervalSpec::every(Duration::from_millis(10)),
                    RetryPolicy::none(),
                    || async { Ok(()) },
                )
                .await,
            Err(JobsError::ShuttingDown)
        ));
    }
}
