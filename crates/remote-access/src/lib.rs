pub mod error;
pub mod gateway;
pub mod providers;
pub mod session;
pub mod types;

pub use error::RemoteAccessError;
pub use gateway::{GatewayHandle, GatewayRuntime, GatewayRuntimeConfig};
pub use providers::{
    build_provider, ProviderAccessMode, ProviderDiagnostics, ProviderKind, ProviderLogEntry,
    ProviderStartRequest, ProviderStatus, ProviderStatusState, TunnelProvider,
};
pub use session::{SessionStore, TunnelSession};
pub use types::{
    CreateSessionRequest, RemoteAccessEvent, RemoteAccessStatus, RemoteAccessStatusSnapshot,
    SessionMode, SessionPermission, SessionValidation,
};
