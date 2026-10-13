//! Retry just-written CLI binaries that fail spawn with a transient OS error.
//!
//! `cargo test --workspace` writes a fake executable then `exec`s it immediately.
//! Linux can return `ETXTBSY` until the writer's fd is fully closed. Other
//! hosts also surface `EINTR` / `EAGAIN` / fd-table exhaustion.

use std::time::Duration;

pub(crate) const TRANSIENT_SPAWN_ATTEMPTS: u32 = 8;

pub(crate) fn is_transient_os_error(code: i32) -> bool {
    // Named libc errnos, not Linux numbers. Darwin EAGAIN is 35 (Linux 11);
    // Darwin EDEADLK is 11 (Linux 35) and must not retry.
    [
        libc::EINTR,
        libc::EAGAIN,
        libc::EWOULDBLOCK,
        libc::ENFILE,
        libc::EMFILE,
        libc::ETXTBSY,
    ]
    .contains(&code)
}

pub(crate) fn is_transient_spawn(error: &std::io::Error) -> bool {
    error.raw_os_error().is_some_and(is_transient_os_error)
}

pub(crate) async fn retry_transient_spawn<T, F, Fut>(mut op: F) -> std::io::Result<T>
where
    F: FnMut() -> Fut,
    Fut: std::future::Future<Output = std::io::Result<T>>,
{
    let mut last = None;
    for attempt in 0..TRANSIENT_SPAWN_ATTEMPTS {
        match op().await {
            Ok(value) => return Ok(value),
            Err(error) if is_transient_spawn(&error) && attempt + 1 < TRANSIENT_SPAWN_ATTEMPTS => {
                last = Some(error);
                tokio::time::sleep(Duration::from_millis(10 * u64::from(attempt + 1))).await;
            }
            Err(error) => return Err(error),
        }
    }
    Err(last.expect("transient retry keeps last error"))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn transient_spawn_uses_named_errnos_not_linux_numbers() {
        assert!(is_transient_os_error(libc::EINTR));
        assert!(is_transient_os_error(libc::EAGAIN));
        assert!(is_transient_os_error(libc::EWOULDBLOCK));
        assert!(is_transient_os_error(libc::ENFILE));
        assert!(is_transient_os_error(libc::EMFILE));
        assert!(is_transient_os_error(libc::ETXTBSY));
        assert!(!is_transient_os_error(libc::EDEADLK));
        assert!(!is_transient_os_error(libc::ENOENT));
        assert_ne!(libc::EAGAIN, libc::EDEADLK);
        assert!(is_transient_spawn(&std::io::Error::from_raw_os_error(
            libc::EAGAIN
        )));
        assert!(!is_transient_spawn(&std::io::Error::from_raw_os_error(
            libc::EDEADLK
        )));
        if cfg!(target_os = "macos") {
            assert_eq!(libc::EAGAIN, 35);
            assert_eq!(libc::EDEADLK, 11);
            assert!(is_transient_os_error(35));
            assert!(!is_transient_os_error(11));
        }
        if cfg!(target_os = "linux") {
            assert_eq!(libc::EAGAIN, 11);
            assert_eq!(libc::EDEADLK, 35);
            assert!(is_transient_os_error(11));
            assert!(!is_transient_os_error(35));
        }
    }

    #[tokio::test]
    async fn retry_transient_spawn_retries_eagain_then_succeeds() {
        let attempts = std::sync::Arc::new(std::sync::atomic::AtomicU32::new(0));
        let value = retry_transient_spawn({
            let attempts = attempts.clone();
            move || {
                let n = attempts.fetch_add(1, std::sync::atomic::Ordering::SeqCst);
                async move {
                    if n == 0 {
                        Err(std::io::Error::from_raw_os_error(libc::EAGAIN))
                    } else {
                        Ok("ok")
                    }
                }
            }
        })
        .await
        .expect("EAGAIN should retry");
        assert_eq!(value, "ok");
        assert_eq!(attempts.load(std::sync::atomic::Ordering::SeqCst), 2);
    }

    #[tokio::test]
    async fn retry_transient_spawn_retries_etxtbsy_then_succeeds() {
        let attempts = std::sync::Arc::new(std::sync::atomic::AtomicU32::new(0));
        let value = retry_transient_spawn({
            let attempts = attempts.clone();
            move || {
                let n = attempts.fetch_add(1, std::sync::atomic::Ordering::SeqCst);
                async move {
                    if n == 0 {
                        Err(std::io::Error::from_raw_os_error(libc::ETXTBSY))
                    } else {
                        Ok("ok")
                    }
                }
            }
        })
        .await
        .expect("ETXTBSY should retry");
        assert_eq!(value, "ok");
        assert_eq!(attempts.load(std::sync::atomic::Ordering::SeqCst), 2);
    }

    #[tokio::test]
    async fn retry_transient_spawn_does_not_retry_edeadlk() {
        let attempts = std::sync::Arc::new(std::sync::atomic::AtomicU32::new(0));
        let error = retry_transient_spawn({
            let attempts = attempts.clone();
            move || {
                attempts.fetch_add(1, std::sync::atomic::Ordering::SeqCst);
                async { Err::<(), _>(std::io::Error::from_raw_os_error(libc::EDEADLK)) }
            }
        })
        .await
        .expect_err("EDEADLK must not retry");
        assert_eq!(error.raw_os_error(), Some(libc::EDEADLK));
        assert_eq!(attempts.load(std::sync::atomic::Ordering::SeqCst), 1);
    }
}
