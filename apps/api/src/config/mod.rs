use std::env;
use std::net::SocketAddr;

use http::header::HeaderValue;
use tower_http::cors::{AllowOrigin, Any, CorsLayer};
use tracing::info;

#[derive(Debug, Clone)]
pub struct ServerConfig {
    pub host: String,
    pub port: u16,
    pub cors_origins: CorsOriginConfig,
    pub allow_dynamic_localhost_origins: bool,
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
        let has_custom_cors_origin = env::var("CORS_ORIGIN").ok().is_some();

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
                "https://app.atmos.land".to_string(),
                "tauri://localhost".to_string(),
                "http://tauri.localhost".to_string(),
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
            allow_dynamic_localhost_origins: !is_production && !has_custom_cors_origin,
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
        // Default tower CorsLayer allows *no* origins until allow_origin is set.
        // CORS_ORIGIN=* must still call allow_origin(Any), or browsers see no
        // Access-Control-Allow-Origin and "Local Atmos Computer" probe fails.
        let layer = CorsLayer::new().allow_methods(Any).allow_headers(Any);

        match &self.cors_origins {
            CorsOriginConfig::Any => layer.allow_origin(Any),
            CorsOriginConfig::List(_) => {
                if self.allow_dynamic_localhost_origins {
                    let parsed = parse_cors_origins(self.cors_origins_list());
                    let static_origins = parsed.clone();
                    layer.allow_origin(AllowOrigin::predicate(move |origin, _| {
                        is_local_host_origin(origin)
                            || static_origins
                                .iter()
                                .any(|origin_value| origin == origin_value)
                    }))
                } else {
                    let parsed = parse_cors_origins(self.cors_origins_list());
                    layer.allow_origin(AllowOrigin::list(parsed))
                }
            }
        }
    }

    fn cors_origins_list(&self) -> &[String] {
        match &self.cors_origins {
            CorsOriginConfig::List(origins) => origins,
            CorsOriginConfig::Any => panic!("cors_origins_list called for CorsOriginConfig::Any"),
        }
    }
}

fn parse_cors_origins(origins: &[String]) -> Vec<HeaderValue> {
    origins
        .iter()
        .map(|origin| origin.parse().expect("Invalid CORS origin"))
        .collect()
}

fn is_local_host_origin(origin: &HeaderValue) -> bool {
    let origin = match origin.to_str() {
        Ok(v) => v,
        Err(_) => return false,
    };

    let Some((scheme, authority)) = origin.split_once("://") else {
        return false;
    };

    if !matches!(scheme, "http" | "https") {
        return false;
    }

    let host = authority.split('/').next().unwrap_or("");
    let Some((host, port)) = host.rsplit_once(':') else {
        return host == "localhost" || host == "127.0.0.1";
    };

    if host != "localhost" && host != "127.0.0.1" {
        return false;
    }

    port.parse::<u16>().is_ok()
}

#[cfg(test)]
mod tests {
    use super::is_local_host_origin;
    use http::header::HeaderValue;

    #[test]
    fn allows_http_localhost_any_port() {
        assert!(is_local_host_origin(&HeaderValue::from_static(
            "http://127.0.0.1:1430"
        )));
        assert!(is_local_host_origin(&HeaderValue::from_static(
            "https://localhost:8443"
        )));
    }

    #[test]
    fn blocks_non_local_origins() {
        assert!(!is_local_host_origin(&HeaderValue::from_static(
            "http://example.com:1430"
        )));
        assert!(!is_local_host_origin(&HeaderValue::from_static(
            "ftp://127.0.0.1:1430"
        )));
    }
}
