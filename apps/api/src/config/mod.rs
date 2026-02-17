use std::env;
use std::net::SocketAddr;

use tower_http::cors::{AllowOrigin, Any, CorsLayer};
use tracing::info;

#[derive(Debug, Clone)]
pub struct ServerConfig {
    pub host: String,
    pub port: u16,
    pub cors_origins: CorsOriginConfig,
}

#[derive(Debug, Clone)]
pub enum CorsOriginConfig {
    Any,
    List(Vec<String>),
}

impl ServerConfig {
    pub fn from_env() -> Self {
        let host = env::var("SERVER_HOST").unwrap_or_else(|_| "0.0.0.0".to_string());
        let port = env::var("SERVER_PORT")
            .ok()
            .and_then(|p| p.parse().ok())
            .unwrap_or(8080);

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
            _ => CorsOriginConfig::Any,
        };

        let config = Self {
            host,
            port,
            cors_origins,
        };

        info!("Server config: {}:{}", config.host, config.port);
        info!("CORS origins: {:?}", config.cors_origins);

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
