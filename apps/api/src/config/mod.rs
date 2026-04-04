use std::env;
use std::net::SocketAddr;

use tower_http::cors::{AllowOrigin, Any, CorsLayer};
use tracing::info;

#[derive(Debug, Clone)]
pub struct ServerConfig {
    pub host: String,
    pub port: u16,
    pub cors_origins: CorsOriginConfig,
    pub local_api_token: Option<String>,
    pub allow_lan_without_token: bool,
}

#[derive(Debug, Clone)]
pub enum CorsOriginConfig {
    Any,
    List(Vec<String>),
}

impl ServerConfig {
    pub fn from_env() -> Self {
        let host = env::var("SERVER_HOST").unwrap_or_else(|_| "127.0.0.1".to_string());
        let port = env::var("ATMOS_PORT")
            .ok()
            .or_else(|| env::var("SERVER_PORT").ok())
            .and_then(|p| p.parse().ok())
            .unwrap_or(30303);

        let is_production = env::var("RUST_ENV")
            .map(|v| v == "production")
            .unwrap_or(false);

        let cors_origins = match env::var("CORS_ORIGIN") {
            Ok(val) if val == "*" => CorsOriginConfig::Any,
            Ok(val) if !val.is_empty() => {
                let origins: Vec<String> = val.split(',').map(|s| s.trim().to_string()).collect();
                CorsOriginConfig::List(origins)
            }
            _ if is_production => {
                panic!("CORS_ORIGIN must be explicitly set in production (do not use \"*\")");
            }
            _ => CorsOriginConfig::List(vec![
                "http://localhost:3030".to_string(),
                "http://127.0.0.1:3030".to_string(),
                "tauri://localhost".to_string(),
                "https://tauri.localhost".to_string(),
            ]),
        };

        let local_api_token = env::var("ATMOS_LOCAL_TOKEN").ok();

        let allow_lan_without_token = env::var("ATMOS_ALLOW_LAN_TRUST")
            .map(|v| {
                matches!(
                    v.trim().to_ascii_lowercase().as_str(),
                    "1" | "true" | "yes" | "on"
                )
            })
            .unwrap_or(false);

        let config = Self {
            host,
            port,
            cors_origins,
            local_api_token,
            allow_lan_without_token,
        };

        info!("Server config: {}:{}", config.host, config.port);
        info!("CORS origins: {:?}", config.cors_origins);
        info!(
            "Local token auth: {}",
            if config.local_api_token.is_some() {
                "enabled"
            } else {
                "disabled"
            }
        );
        info!(
            "LAN trust without token: {}",
            config.allow_lan_without_token
        );

        config
    }

    pub fn socket_addr(&self) -> SocketAddr {
        format!("{}:{}", self.host, self.port)
            .parse()
            .expect("Invalid SERVER_HOST or SERVER_PORT")
    }

    pub fn cors_layer(&self) -> CorsLayer {
        let layer = CorsLayer::new().allow_methods(Any).allow_headers(Any);

        match &self.cors_origins {
            CorsOriginConfig::Any => layer.allow_origin(Any),
            CorsOriginConfig::List(origins) => {
                let origins: Vec<_> = origins
                    .iter()
                    .map(|o| o.parse().expect("Invalid CORS origin"))
                    .collect();
                layer.allow_origin(AllowOrigin::list(origins))
            }
        }
    }
}
