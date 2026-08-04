pub mod cua;
mod embedded;

pub use cua::CuaExternalBackend;
pub use embedded::EmbeddedBackend;

use crate::types::{BrowserRequest, BrowserResult};

pub trait BrowserBackend {
    fn execute(&self, req: BrowserRequest) -> BrowserResult;
}
