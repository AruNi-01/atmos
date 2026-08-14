//! Bounded permits for concurrent directory measure (`du` / walk).

use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::{Arc, Condvar, Mutex};
use std::time::Duration;

/// Counting semaphore that parks waiters instead of spinning on `yield_now`.
pub struct MeasureBudget {
    remaining: Mutex<usize>,
    cv: Condvar,
}

impl MeasureBudget {
    pub fn new(permits: usize) -> Self {
        Self {
            remaining: Mutex::new(permits.max(1)),
            cv: Condvar::new(),
        }
    }

    /// Acquire one permit. Returns `false` if `cancel` is set while waiting.
    pub fn acquire(&self, cancel: Option<&Arc<AtomicBool>>) -> bool {
        let mut guard = self.remaining.lock().unwrap_or_else(|e| e.into_inner());
        loop {
            if cancel.map(|c| c.load(Ordering::Relaxed)).unwrap_or(false) {
                return false;
            }
            if *guard > 0 {
                *guard -= 1;
                return true;
            }
            let (next, _) = self
                .cv
                .wait_timeout(guard, Duration::from_millis(50))
                .unwrap_or_else(|e| e.into_inner());
            guard = next;
        }
    }

    pub fn release(&self) {
        let mut guard = self.remaining.lock().unwrap_or_else(|e| e.into_inner());
        *guard = guard.saturating_add(1);
        self.cv.notify_one();
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::sync::atomic::AtomicUsize;
    use std::time::Instant;

    #[test]
    fn acquire_blocks_until_release() {
        let budget = Arc::new(MeasureBudget::new(1));
        assert!(budget.acquire(None));
        let started = Instant::now();
        let released = Arc::new(AtomicUsize::new(0));
        let waiter = {
            let budget = Arc::clone(&budget);
            let released = Arc::clone(&released);
            std::thread::spawn(move || {
                assert!(budget.acquire(None));
                released.fetch_add(1, Ordering::SeqCst);
                budget.release();
            })
        };
        std::thread::sleep(Duration::from_millis(30));
        assert_eq!(released.load(Ordering::SeqCst), 0);
        budget.release();
        waiter.join().expect("waiter");
        assert!(started.elapsed() >= Duration::from_millis(30));
        assert_eq!(released.load(Ordering::SeqCst), 1);
    }

    #[test]
    fn acquire_returns_false_when_cancelled() {
        let budget = MeasureBudget::new(1);
        assert!(budget.acquire(None));
        let cancel = Arc::new(AtomicBool::new(true));
        assert!(!budget.acquire(Some(&cancel)));
        budget.release();
    }
}
