use std::env;
use std::net::SocketAddr;

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
    /// Extra `Host` header values accepted besides IP literals and `localhost`.
    /// Needed for named access such as Tailscale MagicDNS (`box.tailnet.ts.net`).
    pub allowed_hosts: Vec<String>,
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

        let allowed_hosts = env::var("ATMOS_ALLOWED_HOSTS")
            .ok()
            .map(|value| {
                value
                    .split(',')
                    .map(|entry| entry.trim().to_ascii_lowercase())
                    .filter(|entry| !entry.is_empty())
                    .collect()
            })
            .unwrap_or_default();

        let config = Self {
            host,
            port,
            cors_origins,
            allow_dynamic_localhost_origins: !is_production && !has_custom_cors_origin,
            local_api_token,
            allow_lan_without_token,
            allowed_hosts,
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
                // Share one predicate with the WebSocket/HTTP origin guard so the
                // two cannot drift apart across dev / desktop / hosted setups.
                let config = self.clone();
                layer.allow_origin(AllowOrigin::predicate(move |origin, _| {
                    origin
                        .to_str()
                        .is_ok_and(|value| config.is_origin_allowed(value))
                }))
            }
        }
    }

    /// This server's own origin, so a UI served from `ATMOS_STATIC_DIR` keeps
    /// working without every launcher having to configure `CORS_ORIGIN`.
    fn is_self_origin(&self, origin: &str) -> bool {
        let Some((scheme, authority)) = origin.split_once("://") else {
            return false;
        };
        if scheme != "http" && scheme != "https" {
            return false;
        }
        let Some((host, port)) = split_host_port(authority) else {
            return false;
        };
        port == Some(self.port) && matches!(host, "127.0.0.1" | "localhost" | "::1")
    }

    /// Single source of truth for "may this browser origin talk to us".
    ///
    /// A WebSocket handshake is not covered by CORS, so this is also enforced as
    /// a request guard (see `middleware::require_allowed_origin`); otherwise any
    /// page could drive `/ws/terminal` on a loopback-trusted connection.
    pub fn is_origin_allowed(&self, origin: &str) -> bool {
        match &self.cors_origins {
            CorsOriginConfig::Any => true,
            CorsOriginConfig::List(origins) => {
                if self.is_self_origin(origin) {
                    return true;
                }
                if self.allow_dynamic_localhost_origins && is_local_host_origin(origin) {
                    return true;
                }
                origins.iter().any(|allowed| allowed == origin)
            }
        }
    }

    /// Reject `Host` values that resolve through DNS, which is how a page on a
    /// public domain rebinds to 127.0.0.1 and reaches us as a same-origin
    /// request that carries no `Origin` header.
    pub fn is_host_allowed(&self, host: &str) -> bool {
        let Some((hostname, _)) = split_host_port(host) else {
            return false;
        };
        if hostname == "localhost" || hostname.parse::<std::net::IpAddr>().is_ok() {
            return true;
        }
        let hostname = hostname.to_ascii_lowercase();
        self.allowed_hosts.contains(&hostname)
    }
}

/// Split `host[:port]` into hostname and port, unwrapping `[::1]` bracket form.
fn split_host_port(authority: &str) -> Option<(&str, Option<u16>)> {
    let authority = authority.split('/').next().unwrap_or("");
    if authority.is_empty() {
        return None;
    }

    if let Some(rest) = authority.strip_prefix('[') {
        let (host, tail) = rest.split_once(']')?;
        return match tail.strip_prefix(':') {
            Some(port) => Some((host, Some(port.parse().ok()?))),
            None if tail.is_empty() => Some((host, None)),
            None => None,
        };
    }

    match authority.rsplit_once(':') {
        Some((host, port)) => Some((host, Some(port.parse().ok()?))),
        None => Some((authority, None)),
    }
}

fn is_local_host_origin(origin: &str) -> bool {
    let Some((scheme, authority)) = origin.split_once("://") else {
        return false;
    };

    if !matches!(scheme, "http" | "https") {
        return false;
    }

    let Some((host, _)) = split_host_port(authority) else {
        return false;
    };

    matches!(host, "localhost" | "127.0.0.1")
}

#[cfg(test)]
mod tests {
    use super::{is_local_host_origin, CorsOriginConfig, ServerConfig};

    fn config(
        cors_origins: CorsOriginConfig,
        allow_dynamic_localhost_origins: bool,
    ) -> ServerConfig {
        ServerConfig {
            host: "127.0.0.1".to_string(),
            port: 30303,
            cors_origins,
            allow_dynamic_localhost_origins,
            local_api_token: None,
            allow_lan_without_token: false,
            allowed_hosts: Vec::new(),
        }
    }

    fn strict_config() -> ServerConfig {
        config(
            CorsOriginConfig::List(vec!["https://app.atmos.land".to_string()]),
            false,
        )
    }

    #[test]
    fn allows_http_localhost_any_port() {
        assert!(is_local_host_origin("http://127.0.0.1:1430"));
        assert!(is_local_host_origin("https://localhost:8443"));
    }

    #[test]
    fn blocks_non_local_origins() {
        assert!(!is_local_host_origin("http://example.com:1430"));
        assert!(!is_local_host_origin("ftp://127.0.0.1:1430"));
    }

    #[test]
    fn rejects_unlisted_origin_even_on_loopback_port() {
        let config = strict_config();
        assert!(!config.is_origin_allowed("https://evil.example"));
        // A page on another local port is not automatically trusted once the
        // dynamic-localhost allowance is off.
        assert!(!config.is_origin_allowed("http://127.0.0.1:4000"));
    }

    #[test]
    fn always_allows_own_origin_so_static_ui_keeps_working() {
        let config = strict_config();
        assert!(config.is_origin_allowed("http://127.0.0.1:30303"));
        assert!(config.is_origin_allowed("http://localhost:30303"));
        assert!(config.is_origin_allowed("http://[::1]:30303"));
        assert!(config.is_origin_allowed("https://app.atmos.land"));
    }

    #[test]
    fn dynamic_localhost_allowance_covers_any_local_port() {
        let config = config(CorsOriginConfig::List(Vec::new()), true);
        assert!(config.is_origin_allowed("http://localhost:3030"));
        assert!(config.is_origin_allowed("http://127.0.0.1:5173"));
        assert!(!config.is_origin_allowed("https://evil.example"));
    }

    #[test]
    fn wildcard_cors_allows_every_origin() {
        let config = config(CorsOriginConfig::Any, false);
        assert!(config.is_origin_allowed("https://evil.example"));
    }

    #[test]
    fn host_guard_accepts_ip_literals_and_localhost() {
        let config = strict_config();
        assert!(config.is_host_allowed("127.0.0.1:30303"));
        assert!(config.is_host_allowed("localhost:30303"));
        assert!(config.is_host_allowed("[::1]:30303"));
        // Tailscale / LAN access by IP stays reachable.
        assert!(config.is_host_allowed("100.101.102.103:30303"));
    }

    #[test]
    fn host_guard_rejects_dns_names_used_for_rebinding() {
        let config = strict_config();
        assert!(!config.is_host_allowed("evil.example:30303"));
        assert!(!config.is_host_allowed("rebind.local:30303"));
    }

    #[test]
    fn host_guard_honors_explicit_allow_list() {
        let mut config = strict_config();
        config.allowed_hosts = vec!["box.tailnet.ts.net".to_string()];
        assert!(config.is_host_allowed("box.tailnet.ts.net:30303"));
        assert!(config.is_host_allowed("BOX.TAILNET.TS.NET:30303"));
        assert!(!config.is_host_allowed("evil.example:30303"));
    }
}
