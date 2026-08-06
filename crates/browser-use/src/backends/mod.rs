pub(crate) mod embedded;
pub(crate) mod external;

pub use embedded::EmbeddedBackend;
pub use external::ExternalBackend;

use crate::types::{BrowserRequest, BrowserResult};

pub trait BrowserBackend {
    fn execute(&self, req: BrowserRequest) -> BrowserResult;
}
