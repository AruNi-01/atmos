use std::sync::Arc;
use tokio::sync::RwLock;

pub type SharedString = Arc<RwLock<String>>;
