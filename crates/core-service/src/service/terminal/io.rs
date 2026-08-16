//! One `pipe-pane` attachment per tmux pane; N WebSocket observers (APP-062).

use std::collections::HashMap;
use std::sync::atomic::{AtomicU16, AtomicUsize, Ordering};
use std::sync::{Arc, Mutex};
use std::time::Duration;

use core_engine::{MouseModeState, TmuxEngine};
use infra::utils::debug_logging::DebugLogger;
use tokio::io::{AsyncReadExt, AsyncWriteExt};
use tokio::sync::mpsc::error::TrySendError;
use tokio::sync::{mpsc, watch};
use tracing::{debug, info, warn};

use crate::error::{Result, ServiceError};

use super::is_usable_browser_size;
use super::run_log_tee::RunLogTee;

const OBSERVER_WATERMARK: usize = 256;

/// N2: tear `pipe-pane` after this long with zero observers. The tmux window stays.
pub const PANE_IDLE_TEAR_DEFAULT: Duration = Duration::from_secs(15 * 60);

fn dbg() -> DebugLogger {
    DebugLogger::new("terminal-pipe")
}

#[derive(Debug, Clone, PartialEq, Eq, Hash)]
pub struct PaneIoKey {
    pub tmux_session: String,
    pub window_index: u32,
}

impl PaneIoKey {
    pub fn new(tmux_session: impl Into<String>, window_index: u32) -> Self {
        Self {
            tmux_session: tmux_session.into(),
            window_index,
        }
    }

    pub fn as_log(&self) -> String {
        format!("{}:{}", self.tmux_session, self.window_index)
    }
}

pub enum AttachedPipe {
    #[cfg(unix)]
    Unix(std::os::unix::net::UnixStream),
    #[cfg(test)]
    Memory {
        output_rx: mpsc::UnboundedReceiver<Vec<u8>>,
        input_tx: mpsc::UnboundedSender<Vec<u8>>,
    },
}

pub trait PanePipeDriver: Send + Sync + 'static {
    fn attach(&self, key: &PaneIoKey) -> Result<AttachedPipe>;
    fn detach(&self, key: &PaneIoKey) -> Result<()>;
    fn resize_window(&self, key: &PaneIoKey, cols: u16, rows: u16) -> Result<()>;
    fn persist_mouse(&self, key: &PaneIoKey, state: &MouseModeState) -> Result<()>;
    fn load_mouse(&self, key: &PaneIoKey) -> Option<MouseModeState> {
        let _ = key;
        None
    }
}

pub struct TmuxPipeDriver {
    engine: Arc<TmuxEngine>,
}

impl TmuxPipeDriver {
    pub fn new(engine: Arc<TmuxEngine>) -> Self {
        Self { engine }
    }
}

impl PanePipeDriver for TmuxPipeDriver {
    fn attach(&self, key: &PaneIoKey) -> Result<AttachedPipe> {
        #[cfg(unix)]
        {
            let spec = self
                .engine
                .attach_pane_pipe(&key.tmux_session, key.window_index)
                .map_err(|e| ServiceError::Processing(e.to_string()))?;
            Ok(AttachedPipe::Unix(spec.stream))
        }
        #[cfg(not(unix))]
        {
            let _ = key;
            Err(ServiceError::Processing(
                "tmux pipe-pane live path requires Unix".to_string(),
            ))
        }
    }

    fn detach(&self, key: &PaneIoKey) -> Result<()> {
        #[cfg(unix)]
        {
            self.engine
                .detach_pane_pipe(&key.tmux_session, key.window_index)
                .map_err(|e| ServiceError::Processing(e.to_string()))
        }
        #[cfg(not(unix))]
        {
            let _ = key;
            Ok(())
        }
    }

    fn resize_window(&self, key: &PaneIoKey, cols: u16, rows: u16) -> Result<()> {
        self.engine
            .resize_window(&key.tmux_session, key.window_index, cols, rows)
            .map_err(|e| ServiceError::Processing(e.to_string()))
    }

    fn persist_mouse(&self, key: &PaneIoKey, state: &MouseModeState) -> Result<()> {
        self.engine
            .set_pane_mouse_tracking(&key.tmux_session, key.window_index, state)
            .map_err(|e| ServiceError::Processing(e.to_string()))
    }

    fn load_mouse(&self, key: &PaneIoKey) -> Option<MouseModeState> {
        self.engine
            .get_pane_mouse_tracking(&key.tmux_session, key.window_index)
            .ok()
            .flatten()
    }
}

struct LivePane {
    key: PaneIoKey,
    input_tx: mpsc::UnboundedSender<Vec<u8>>,
    observers: Mutex<HashMap<String, mpsc::Sender<Vec<u8>>>>,
    last_cols: AtomicU16,
    last_rows: AtomicU16,
    stop_tx: watch::Sender<bool>,
}

struct RunLogTarget {
    tee: Arc<RunLogTee>,
    root: std::path::PathBuf,
    window: String,
}

pub struct PaneIoRegistry {
    inner: Arc<PaneIoInner>,
}

struct PaneIoInner {
    panes: Mutex<HashMap<PaneIoKey, Arc<LivePane>>>,
    driver: Arc<dyn PanePipeDriver>,
    attach_invocations: AtomicUsize,
    /// Serializes first-open so two WS clients cannot each `pipe-pane`.
    opening: tokio::sync::Mutex<()>,
    idle_timeout: Duration,
    idle_cancels: Mutex<HashMap<PaneIoKey, watch::Sender<bool>>>,
}

impl PaneIoRegistry {
    pub fn new(driver: Arc<dyn PanePipeDriver>) -> Self {
        Self::new_with_idle_timeout(driver, PANE_IDLE_TEAR_DEFAULT)
    }

    pub fn new_with_idle_timeout(driver: Arc<dyn PanePipeDriver>, idle_timeout: Duration) -> Self {
        Self {
            inner: Arc::new(PaneIoInner {
                panes: Mutex::new(HashMap::new()),
                driver,
                attach_invocations: AtomicUsize::new(0),
                opening: tokio::sync::Mutex::new(()),
                idle_timeout,
                idle_cancels: Mutex::new(HashMap::new()),
            }),
        }
    }

    #[cfg(test)]
    pub fn attach_invocations(&self) -> usize {
        self.inner.attach_invocations.load(Ordering::SeqCst)
    }

    #[cfg(test)]
    pub fn contains(&self, key: &PaneIoKey) -> bool {
        self.inner
            .panes
            .lock()
            .unwrap_or_else(|e| e.into_inner())
            .contains_key(key)
    }

    #[cfg(test)]
    pub fn observer_count(&self, key: &PaneIoKey) -> usize {
        let panes = self.inner.panes.lock().unwrap_or_else(|e| e.into_inner());
        panes
            .get(key)
            .map(|live| {
                live.observers
                    .lock()
                    .unwrap_or_else(|e| e.into_inner())
                    .len()
            })
            .unwrap_or(0)
    }

    pub async fn ensure_and_subscribe(
        &self,
        key: PaneIoKey,
        session_id: String,
        cols: u16,
        rows: u16,
        run_log: Option<(Arc<RunLogTee>, std::path::PathBuf, String)>,
    ) -> Result<mpsc::Receiver<Vec<u8>>> {
        let _open = self.inner.opening.lock().await;
        self.cancel_idle_tear(&key);
        if let Some(live) = self.get_live(&key) {
            self.resize(&key, cols, rows)?;
            return Ok(self.subscribe(&live, session_id));
        }

        self.inner.attach_invocations.fetch_add(1, Ordering::SeqCst);
        let driver = Arc::clone(&self.inner.driver);
        let attach_key = key.clone();
        let attached = tokio::task::spawn_blocking(move || driver.attach(&attach_key))
            .await
            .map_err(|error| ServiceError::Processing(format!("pipe attach task failed: {error}")))?
            .inspect_err(|error| {
                dbg().log(
                    "PIPE_ATTACH_FAIL",
                    "pipe-pane attach failed",
                    Some(serde_json::json!({
                        "pane": key.as_log(),
                        "error": error.to_string(),
                    })),
                );
            })?;

        let live = match self.spawn_live(key.clone(), attached, cols, rows, run_log) {
            Ok(live) => live,
            Err(error) => {
                let _ = self.inner.driver.detach(&key);
                return Err(error);
            }
        };
        {
            let mut panes = self.inner.panes.lock().unwrap_or_else(|e| e.into_inner());
            panes.insert(key.clone(), Arc::clone(&live));
        }

        if is_usable_browser_size(cols, rows) {
            if let Err(error) = self.inner.driver.resize_window(&key, cols, rows) {
                warn!(
                    "Failed to pin tmux window size for {}: {}",
                    key.as_log(),
                    error
                );
            }
        }

        dbg().log(
            "PIPE_ATTACH",
            "pipe-pane live",
            Some(serde_json::json!({
                "pane": key.as_log(),
                "cols": cols,
                "rows": rows,
            })),
        );
        info!("Pane pipe live for {}", key.as_log());
        Ok(self.subscribe(&live, session_id))
    }

    pub fn write(&self, key: &PaneIoKey, data: Vec<u8>) -> Result<()> {
        let live = self.get_live(key).ok_or_else(|| {
            ServiceError::NotFound(format!("Pane pipe not live: {}", key.as_log()))
        })?;
        live.input_tx
            .send(data)
            .map_err(|_| ServiceError::Processing("Pane pipe writer has exited".to_string()))
    }

    pub fn resize(&self, key: &PaneIoKey, cols: u16, rows: u16) -> Result<()> {
        if !is_usable_browser_size(cols, rows) {
            return Ok(());
        }
        let live = self.get_live(key).ok_or_else(|| {
            ServiceError::NotFound(format!("Pane pipe not live: {}", key.as_log()))
        })?;
        let last_cols = live.last_cols.load(Ordering::SeqCst);
        let last_rows = live.last_rows.load(Ordering::SeqCst);
        if cols == last_cols && rows == last_rows {
            return Ok(());
        }
        self.inner.driver.resize_window(key, cols, rows)?;
        live.last_cols.store(cols, Ordering::SeqCst);
        live.last_rows.store(rows, Ordering::SeqCst);
        Ok(())
    }

    pub fn unsubscribe(&self, key: &PaneIoKey, session_id: &str) {
        let last_gone = if let Some(live) = self.get_live(key) {
            let mut observers = live.observers.lock().unwrap_or_else(|e| e.into_inner());
            observers.remove(session_id);
            observers.is_empty()
        } else {
            false
        };
        if last_gone {
            self.schedule_idle_tear(key);
        }
    }

    /// Tear the pipe. Does not kill the tmux window.
    pub fn destroy_pipe(&self, key: &PaneIoKey) {
        self.cancel_idle_tear(key);
        let live = {
            let mut panes = self.inner.panes.lock().unwrap_or_else(|e| e.into_inner());
            panes.remove(key)
        };
        if let Some(live) = live {
            let _ = live.stop_tx.send(true);
            live.observers
                .lock()
                .unwrap_or_else(|e| e.into_inner())
                .clear();
        }
        if let Err(error) = self.inner.driver.detach(key) {
            debug!("pipe detach for {}: {}", key.as_log(), error);
        }
        dbg().log(
            "PIPE_DETACH",
            "pipe-pane detached",
            Some(serde_json::json!({ "pane": key.as_log() })),
        );
    }

    pub fn destroy_all_pipes(&self) {
        let keys: Vec<PaneIoKey> = {
            let panes = self.inner.panes.lock().unwrap_or_else(|e| e.into_inner());
            panes.keys().cloned().collect()
        };
        for key in keys {
            self.destroy_pipe(&key);
        }
    }

    fn live_observer_count(&self, key: &PaneIoKey) -> usize {
        self.get_live(key)
            .map(|live| {
                live.observers
                    .lock()
                    .unwrap_or_else(|e| e.into_inner())
                    .len()
            })
            .unwrap_or(0)
    }

    fn cancel_idle_tear(&self, key: &PaneIoKey) {
        let tx = {
            let mut cancels = self
                .inner
                .idle_cancels
                .lock()
                .unwrap_or_else(|e| e.into_inner());
            cancels.remove(key)
        };
        if let Some(tx) = tx {
            let _ = tx.send(true);
        }
    }

    fn schedule_idle_tear(&self, key: &PaneIoKey) {
        self.cancel_idle_tear(key);
        let timeout = self.inner.idle_timeout;
        if timeout.is_zero() {
            return;
        }
        let (tx, mut rx) = watch::channel(false);
        {
            let mut cancels = self
                .inner
                .idle_cancels
                .lock()
                .unwrap_or_else(|e| e.into_inner());
            cancels.insert(key.clone(), tx);
        }
        let registry = PaneIoRegistry {
            inner: Arc::clone(&self.inner),
        };
        let tear_key = key.clone();
        tokio::spawn(async move {
            tokio::select! {
                _ = tokio::time::sleep(timeout) => {
                    let _opening = registry.inner.opening.lock().await;
                    {
                        let mut cancels = registry
                            .inner
                            .idle_cancels
                            .lock()
                            .unwrap_or_else(|e| e.into_inner());
                        cancels.remove(&tear_key);
                    }
                    if registry.live_observer_count(&tear_key) == 0 && registry.contains_live(&tear_key)
                    {
                        dbg().log(
                            "PIPE_IDLE_TEAR",
                            "pipe-pane idle timeout; detaching (window stays)",
                            Some(serde_json::json!({ "pane": tear_key.as_log() })),
                        );
                        registry.destroy_pipe(&tear_key);
                    }
                }
                _ = rx.changed() => {}
            }
        });
    }

    fn contains_live(&self, key: &PaneIoKey) -> bool {
        self.inner
            .panes
            .lock()
            .unwrap_or_else(|e| e.into_inner())
            .contains_key(key)
    }

    fn get_live(&self, key: &PaneIoKey) -> Option<Arc<LivePane>> {
        self.inner
            .panes
            .lock()
            .unwrap_or_else(|e| e.into_inner())
            .get(key)
            .cloned()
    }

    fn subscribe(&self, live: &LivePane, session_id: String) -> mpsc::Receiver<Vec<u8>> {
        let (tx, rx) = mpsc::channel(OBSERVER_WATERMARK);
        live.observers
            .lock()
            .unwrap_or_else(|e| e.into_inner())
            .insert(session_id, tx);
        rx
    }

    fn spawn_live(
        &self,
        key: PaneIoKey,
        attached: AttachedPipe,
        cols: u16,
        rows: u16,
        run_log: Option<(Arc<RunLogTee>, std::path::PathBuf, String)>,
    ) -> Result<Arc<LivePane>> {
        let (input_tx, input_rx) = mpsc::unbounded_channel::<Vec<u8>>();
        let (stop_tx, stop_rx) = watch::channel(false);
        let live = Arc::new(LivePane {
            key: key.clone(),
            input_tx,
            observers: Mutex::new(HashMap::new()),
            last_cols: AtomicU16::new(cols),
            last_rows: AtomicU16::new(rows),
            stop_tx,
        });
        let run_log = run_log.map(|(tee, root, window)| RunLogTarget { tee, root, window });
        let mouse = self.inner.driver.load_mouse(&key).unwrap_or_default();

        match attached {
            #[cfg(unix)]
            AttachedPipe::Unix(stream) => {
                stream.set_nonblocking(true).map_err(|e| {
                    ServiceError::Processing(format!("Failed to set pipe nonblocking: {e}"))
                })?;
                let tokio_stream = tokio::net::UnixStream::from_std(stream).map_err(|e| {
                    ServiceError::Processing(format!("Failed to adopt pipe stream: {e}"))
                })?;
                let (reader, writer) = tokio_stream.into_split();
                self.spawn_unix_tasks(
                    Arc::clone(&self.inner),
                    Arc::clone(&live),
                    reader,
                    writer,
                    input_rx,
                    stop_rx,
                    mouse,
                    run_log,
                );
            }
            #[cfg(test)]
            AttachedPipe::Memory {
                output_rx,
                input_tx: pane_input,
            } => {
                self.spawn_memory_tasks(
                    Arc::clone(&self.inner),
                    Arc::clone(&live),
                    output_rx,
                    pane_input,
                    input_rx,
                    stop_rx,
                    mouse,
                    run_log,
                );
            }
        }

        Ok(live)
    }

    #[allow(clippy::too_many_arguments)]
    #[cfg(unix)]
    fn spawn_unix_tasks(
        &self,
        inner: Arc<PaneIoInner>,
        live: Arc<LivePane>,
        mut reader: tokio::net::unix::OwnedReadHalf,
        mut writer: tokio::net::unix::OwnedWriteHalf,
        mut input_rx: mpsc::UnboundedReceiver<Vec<u8>>,
        mut stop_rx: watch::Receiver<bool>,
        mouse: MouseModeState,
        run_log: Option<RunLogTarget>,
    ) {
        let driver = Arc::clone(&inner.driver);
        let write_stop = stop_rx.clone();
        tokio::spawn(async move {
            let mut stop_rx = write_stop;
            loop {
                tokio::select! {
                    _ = stop_rx.changed() => {
                        if *stop_rx.borrow() {
                            break;
                        }
                    }
                    cmd = input_rx.recv() => {
                        let Some(data) = cmd else { break; };
                        if writer.write_all(&data).await.is_err() {
                            break;
                        }
                        if writer.flush().await.is_err() {
                            break;
                        }
                    }
                }
            }
        });

        tokio::spawn(async move {
            let mut buf = vec![0u8; 8192];
            let mut mouse = mouse;
            let mut total: u64 = 0;
            loop {
                tokio::select! {
                    _ = stop_rx.changed() => {
                        if *stop_rx.borrow() {
                            break;
                        }
                    }
                    read = reader.read(&mut buf) => {
                        match read {
                            Ok(0) => break,
                            Ok(n) => {
                                let chunk = &buf[..n];
                                total += n as u64;
                                fanout_chunk(&live, &driver, &mut mouse, run_log.as_ref(), chunk);
                            }
                            Err(_) => break,
                        }
                    }
                }
            }
            dbg().log(
                "PIPE_EOF",
                "pipe reader exited",
                Some(serde_json::json!({
                    "pane": live.key.as_log(),
                    "bytes": total,
                })),
            );
            remove_if_current(&inner, &live);
        });
    }

    #[allow(clippy::too_many_arguments)]
    #[cfg(test)]
    fn spawn_memory_tasks(
        &self,
        inner: Arc<PaneIoInner>,
        live: Arc<LivePane>,
        mut output_rx: mpsc::UnboundedReceiver<Vec<u8>>,
        pane_input: mpsc::UnboundedSender<Vec<u8>>,
        mut input_rx: mpsc::UnboundedReceiver<Vec<u8>>,
        mut stop_rx: watch::Receiver<bool>,
        mouse: MouseModeState,
        run_log: Option<RunLogTarget>,
    ) {
        let write_stop = stop_rx.clone();
        tokio::spawn(async move {
            let mut stop_rx = write_stop;
            loop {
                tokio::select! {
                    _ = stop_rx.changed() => {
                        if *stop_rx.borrow() {
                            break;
                        }
                    }
                    cmd = input_rx.recv() => {
                        let Some(data) = cmd else { break; };
                        if pane_input.send(data).is_err() {
                            break;
                        }
                    }
                }
            }
        });

        let driver = Arc::clone(&inner.driver);
        tokio::spawn(async move {
            let mut mouse = mouse;
            loop {
                tokio::select! {
                    _ = stop_rx.changed() => {
                        if *stop_rx.borrow() {
                            break;
                        }
                    }
                    chunk = output_rx.recv() => {
                        let Some(chunk) = chunk else { break; };
                        fanout_chunk(&live, &driver, &mut mouse, run_log.as_ref(), &chunk);
                    }
                }
            }
            remove_if_current(&inner, &live);
        });
    }
}

fn fanout_chunk(
    live: &LivePane,
    driver: &Arc<dyn PanePipeDriver>,
    mouse: &mut MouseModeState,
    run_log: Option<&RunLogTarget>,
    chunk: &[u8],
) {
    if chunk.is_empty() {
        return;
    }
    if mouse.observe_bytes(chunk) {
        if let Err(error) = driver.persist_mouse(&live.key, mouse) {
            debug!(
                "Failed to persist mouse tracking for {}: {}",
                live.key.as_log(),
                error
            );
        }
    }
    if let Some(log) = run_log {
        log.tee.append(&log.root, &log.window, chunk);
    }

    let mut dropped = Vec::new();
    {
        let observers = live.observers.lock().unwrap_or_else(|e| e.into_inner());
        for (id, tx) in observers.iter() {
            match tx.try_send(chunk.to_vec()) {
                Ok(()) => {}
                Err(TrySendError::Full(_)) | Err(TrySendError::Closed(_)) => {
                    dropped.push(id.clone());
                }
            }
        }
    }
    if !dropped.is_empty() {
        let mut observers = live.observers.lock().unwrap_or_else(|e| e.into_inner());
        for id in &dropped {
            observers.remove(id);
        }
        dbg().log(
            "OBSERVER_DROP",
            "dropped slow or closed observer",
            Some(serde_json::json!({
                "pane": live.key.as_log(),
                "count": dropped.len(),
            })),
        );
    }
}

fn remove_if_current(inner: &PaneIoInner, live: &Arc<LivePane>) {
    let mut panes = inner.panes.lock().unwrap_or_else(|e| e.into_inner());
    if let Some(current) = panes.get(&live.key) {
        if Arc::ptr_eq(current, live) {
            panes.remove(&live.key);
        }
    }
}

#[cfg(test)]
pub(super) struct TestPipeDriver {
    pub attach_count: AtomicUsize,
    pub detach_count: AtomicUsize,
    pub resize_count: AtomicUsize,
    pub persist_count: AtomicUsize,
    pub fail_attach: std::sync::atomic::AtomicBool,
    pub last_mouse: Mutex<Option<MouseModeState>>,
    pane_out_tx: Mutex<Option<mpsc::UnboundedSender<Vec<u8>>>>,
    pane_out_rx: Mutex<Option<mpsc::UnboundedReceiver<Vec<u8>>>>,
    pane_in_tx: Mutex<Option<mpsc::UnboundedSender<Vec<u8>>>>,
    pane_in_rx: Mutex<Option<mpsc::UnboundedReceiver<Vec<u8>>>>,
}

#[cfg(test)]
impl TestPipeDriver {
    pub fn new() -> Self {
        let (out_tx, out_rx) = mpsc::unbounded_channel();
        let (in_tx, in_rx) = mpsc::unbounded_channel();
        Self {
            attach_count: AtomicUsize::new(0),
            detach_count: AtomicUsize::new(0),
            resize_count: AtomicUsize::new(0),
            persist_count: AtomicUsize::new(0),
            fail_attach: std::sync::atomic::AtomicBool::new(false),
            last_mouse: Mutex::new(None),
            pane_out_tx: Mutex::new(Some(out_tx)),
            pane_out_rx: Mutex::new(Some(out_rx)),
            pane_in_tx: Mutex::new(Some(in_tx)),
            pane_in_rx: Mutex::new(Some(in_rx)),
        }
    }

    pub fn pane_output(&self) -> mpsc::UnboundedSender<Vec<u8>> {
        self.pane_out_tx
            .lock()
            .unwrap()
            .clone()
            .expect("pane output sender")
    }

    pub fn take_pane_input(&self) -> mpsc::UnboundedReceiver<Vec<u8>> {
        self.pane_in_rx
            .lock()
            .unwrap()
            .take()
            .expect("pane input receiver")
    }
}

#[cfg(test)]
impl PanePipeDriver for TestPipeDriver {
    fn attach(&self, _key: &PaneIoKey) -> Result<AttachedPipe> {
        if self.fail_attach.load(Ordering::SeqCst) {
            return Err(ServiceError::Processing("bind failed".to_string()));
        }
        self.attach_count.fetch_add(1, Ordering::SeqCst);
        let output_rx = self
            .pane_out_rx
            .lock()
            .unwrap()
            .take()
            .ok_or_else(|| ServiceError::Processing("pipe already attached".to_string()))?;
        let input_tx = self
            .pane_in_tx
            .lock()
            .unwrap()
            .take()
            .ok_or_else(|| ServiceError::Processing("pipe already attached".to_string()))?;
        Ok(AttachedPipe::Memory {
            output_rx,
            input_tx,
        })
    }

    fn detach(&self, _key: &PaneIoKey) -> Result<()> {
        self.detach_count.fetch_add(1, Ordering::SeqCst);
        Ok(())
    }

    fn resize_window(&self, _key: &PaneIoKey, _cols: u16, _rows: u16) -> Result<()> {
        self.resize_count.fetch_add(1, Ordering::SeqCst);
        Ok(())
    }

    fn persist_mouse(&self, _key: &PaneIoKey, state: &MouseModeState) -> Result<()> {
        self.persist_count.fetch_add(1, Ordering::SeqCst);
        *self.last_mouse.lock().unwrap() = Some(state.clone());
        Ok(())
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use core_engine::{MouseEventMode, MouseFormat};

    fn key() -> PaneIoKey {
        PaneIoKey::new("ws_main", 3)
    }

    #[tokio::test]
    async fn second_subscribe_does_not_reattach() {
        let driver = Arc::new(TestPipeDriver::new());
        let registry = PaneIoRegistry::new(driver.clone());
        let k = key();
        let _a = registry
            .ensure_and_subscribe(k.clone(), "a".into(), 80, 24, None)
            .await
            .unwrap();
        let _b = registry
            .ensure_and_subscribe(k.clone(), "b".into(), 80, 24, None)
            .await
            .unwrap();
        assert_eq!(driver.attach_count.load(Ordering::SeqCst), 1);
        assert_eq!(registry.attach_invocations(), 1);
        assert_eq!(registry.observer_count(&k), 2);
        assert!(registry.contains(&k));
    }

    #[tokio::test]
    async fn fan_out_delivers_to_both_observers() {
        let driver = Arc::new(TestPipeDriver::new());
        let out = driver.pane_output();
        let registry = PaneIoRegistry::new(driver.clone());
        let k = key();
        let mut a = registry
            .ensure_and_subscribe(k.clone(), "a".into(), 80, 24, None)
            .await
            .unwrap();
        let mut b = registry
            .ensure_and_subscribe(k.clone(), "b".into(), 80, 24, None)
            .await
            .unwrap();
        out.send(b"hello".to_vec()).unwrap();
        let got_a = tokio::time::timeout(std::time::Duration::from_secs(1), a.recv())
            .await
            .unwrap()
            .unwrap();
        let got_b = tokio::time::timeout(std::time::Duration::from_secs(1), b.recv())
            .await
            .unwrap()
            .unwrap();
        assert_eq!(got_a, b"hello");
        assert_eq!(got_b, b"hello");
    }

    #[tokio::test]
    async fn unsubscribe_keeps_pipe() {
        let driver = Arc::new(TestPipeDriver::new());
        let registry = PaneIoRegistry::new(driver.clone());
        let k = key();
        let _a = registry
            .ensure_and_subscribe(k.clone(), "a".into(), 80, 24, None)
            .await
            .unwrap();
        registry.unsubscribe(&k, "a");
        assert!(registry.contains(&k));
        assert_eq!(registry.observer_count(&k), 0);
        assert_eq!(driver.detach_count.load(Ordering::SeqCst), 0);
    }

    #[tokio::test]
    async fn idle_tear_detaches_pipe_after_timeout() {
        let driver = Arc::new(TestPipeDriver::new());
        let registry = PaneIoRegistry::new_with_idle_timeout(
            driver.clone(),
            std::time::Duration::from_millis(40),
        );
        let k = key();
        let _a = registry
            .ensure_and_subscribe(k.clone(), "a".into(), 80, 24, None)
            .await
            .unwrap();
        registry.unsubscribe(&k, "a");
        assert!(registry.contains(&k));
        assert_eq!(driver.detach_count.load(Ordering::SeqCst), 0);
        tokio::time::sleep(std::time::Duration::from_millis(90)).await;
        assert!(!registry.contains(&k));
        assert_eq!(driver.detach_count.load(Ordering::SeqCst), 1);
    }

    #[tokio::test]
    async fn resubscribe_cancels_idle_tear() {
        let driver = Arc::new(TestPipeDriver::new());
        let registry = PaneIoRegistry::new_with_idle_timeout(
            driver.clone(),
            std::time::Duration::from_millis(80),
        );
        let k = key();
        let _a = registry
            .ensure_and_subscribe(k.clone(), "a".into(), 80, 24, None)
            .await
            .unwrap();
        registry.unsubscribe(&k, "a");
        let _b = registry
            .ensure_and_subscribe(k.clone(), "b".into(), 80, 24, None)
            .await
            .unwrap();
        tokio::time::sleep(std::time::Duration::from_millis(120)).await;
        assert!(registry.contains(&k));
        assert_eq!(driver.detach_count.load(Ordering::SeqCst), 0);
        assert_eq!(driver.attach_count.load(Ordering::SeqCst), 1);
    }

    #[tokio::test]
    async fn destroy_pipe_detaches_and_drops_key() {
        let driver = Arc::new(TestPipeDriver::new());
        let registry = PaneIoRegistry::new(driver.clone());
        let k = key();
        let _a = registry
            .ensure_and_subscribe(k.clone(), "a".into(), 80, 24, None)
            .await
            .unwrap();
        registry.destroy_pipe(&k);
        assert!(!registry.contains(&k));
        assert_eq!(driver.detach_count.load(Ordering::SeqCst), 1);
    }

    #[tokio::test]
    async fn same_size_resize_is_noop() {
        let driver = Arc::new(TestPipeDriver::new());
        let registry = PaneIoRegistry::new(driver.clone());
        let k = key();
        let _a = registry
            .ensure_and_subscribe(k.clone(), "a".into(), 120, 40, None)
            .await
            .unwrap();
        let after_ensure = driver.resize_count.load(Ordering::SeqCst);
        registry.resize(&k, 120, 40).unwrap();
        assert_eq!(driver.resize_count.load(Ordering::SeqCst), after_ensure);
    }

    #[tokio::test]
    async fn grid_change_resizes_once() {
        let driver = Arc::new(TestPipeDriver::new());
        let registry = PaneIoRegistry::new(driver.clone());
        let k = key();
        let _a = registry
            .ensure_and_subscribe(k.clone(), "a".into(), 80, 24, None)
            .await
            .unwrap();
        let after_ensure = driver.resize_count.load(Ordering::SeqCst);
        registry.resize(&k, 120, 40).unwrap();
        assert_eq!(driver.resize_count.load(Ordering::SeqCst), after_ensure + 1);
    }

    #[tokio::test]
    async fn write_is_raw_bytes() {
        let driver = Arc::new(TestPipeDriver::new());
        let mut input = driver.take_pane_input();
        let registry = PaneIoRegistry::new(driver);
        let k = key();
        let _a = registry
            .ensure_and_subscribe(k.clone(), "a".into(), 80, 24, None)
            .await
            .unwrap();
        registry.write(&k, b"abc\x00".to_vec()).unwrap();
        let got = tokio::time::timeout(std::time::Duration::from_secs(1), input.recv())
            .await
            .unwrap()
            .unwrap();
        assert_eq!(got, b"abc\x00");
    }

    #[tokio::test]
    async fn attach_failure_does_not_insert_key() {
        let driver = Arc::new(TestPipeDriver::new());
        driver.fail_attach.store(true, Ordering::SeqCst);
        let registry = PaneIoRegistry::new(driver);
        let k = key();
        let err = registry
            .ensure_and_subscribe(k.clone(), "a".into(), 80, 24, None)
            .await
            .unwrap_err();
        assert!(err.to_string().contains("bind failed"));
        assert!(!registry.contains(&k));
    }

    #[tokio::test]
    async fn decset_on_pipe_persists_mouse() {
        let driver = Arc::new(TestPipeDriver::new());
        let out = driver.pane_output();
        let registry = PaneIoRegistry::new(driver.clone());
        let k = key();
        let _a = registry
            .ensure_and_subscribe(k.clone(), "a".into(), 80, 24, None)
            .await
            .unwrap();
        out.send(b"\x1b[?1000;1003;1006h".to_vec()).unwrap();
        tokio::time::timeout(std::time::Duration::from_secs(1), async {
            loop {
                if driver.persist_count.load(Ordering::SeqCst) > 0 {
                    break;
                }
                tokio::task::yield_now().await;
            }
        })
        .await
        .unwrap();
        let state = driver.last_mouse.lock().unwrap().clone().unwrap();
        assert_eq!(state.event, MouseEventMode::Any);
        assert_eq!(state.format, MouseFormat::Sgr);
        assert!(registry.contains(&k));
    }

    #[tokio::test]
    async fn unsubscribe_keeps_dec_observation_on_pipe() {
        let driver = Arc::new(TestPipeDriver::new());
        let out = driver.pane_output();
        let registry = PaneIoRegistry::new(driver.clone());
        let k = key();
        let _a = registry
            .ensure_and_subscribe(k.clone(), "a".into(), 80, 24, None)
            .await
            .unwrap();
        registry.unsubscribe(&k, "a");
        assert!(registry.contains(&k));
        assert_eq!(driver.detach_count.load(Ordering::SeqCst), 0);
        out.send(b"\x1b[?1000;1003;1006h".to_vec()).unwrap();
        tokio::time::timeout(std::time::Duration::from_secs(1), async {
            loop {
                if driver.persist_count.load(Ordering::SeqCst) > 0 {
                    break;
                }
                tokio::task::yield_now().await;
            }
        })
        .await
        .unwrap();
        assert!(registry.contains(&k));
        assert_eq!(driver.detach_count.load(Ordering::SeqCst), 0);
    }

    #[tokio::test]
    async fn report_bytes_are_raw_pipe_writes() {
        let driver = Arc::new(TestPipeDriver::new());
        let mut input = driver.take_pane_input();
        let registry = PaneIoRegistry::new(driver);
        let k = key();
        let _a = registry
            .ensure_and_subscribe(k.clone(), "a".into(), 80, 24, None)
            .await
            .unwrap();
        let report = b"\x1b]11;rgb:00/00/00\x1b\\";
        registry.write(&k, report.to_vec()).unwrap();
        let got = tokio::time::timeout(std::time::Duration::from_secs(1), input.recv())
            .await
            .unwrap()
            .unwrap();
        assert_eq!(got, report);
    }
}
