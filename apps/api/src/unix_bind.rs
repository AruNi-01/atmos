//! Same-machine Unix listener for the Atmos Server HTTP/WS router.

#[cfg(unix)]
use std::fs;
#[cfg(unix)]
use std::os::unix::fs::PermissionsExt;
#[cfg(unix)]
use std::path::PathBuf;

#[cfg(unix)]
pub fn bind_api_unix_listener() -> Result<(tokio::net::UnixListener, PathBuf), String> {
    let Some(path) = runtime_manager::api_unix_socket_path()? else {
        return Err("unix socket disabled".to_string());
    };
    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent)
            .map_err(|err| format!("Failed to create {}: {err}", parent.display()))?;
        let _ = fs::set_permissions(parent, fs::Permissions::from_mode(0o700));
    }
    if path.exists() {
        let _ = fs::remove_file(&path);
    }
    let listener = tokio::net::UnixListener::bind(&path)
        .map_err(|err| format!("Failed to bind {}: {err}", path.display()))?;
    let _ = fs::set_permissions(&path, fs::Permissions::from_mode(0o600));
    Ok((listener, path))
}

#[cfg(unix)]
pub fn remove_api_unix_socket(path: &std::path::Path) {
    let _ = fs::remove_file(path);
}

#[cfg(all(test, unix))]
mod tests {
    #[tokio::test]
    async fn binds_overridable_socket_path() {
        let sock = std::env::temp_dir().join(format!(
            "atmos-api-unix-test-{}-{}.sock",
            std::process::id(),
            std::time::SystemTime::now()
                .duration_since(std::time::UNIX_EPOCH)
                .unwrap_or_default()
                .as_nanos()
        ));
        let saved = std::env::var_os("ATMOS_API_UNIX_SOCKET");
        unsafe {
            std::env::set_var("ATMOS_API_UNIX_SOCKET", &sock);
        }
        let result = super::bind_api_unix_listener();
        match saved {
            Some(value) => unsafe { std::env::set_var("ATMOS_API_UNIX_SOCKET", value) },
            None => unsafe { std::env::remove_var("ATMOS_API_UNIX_SOCKET") },
        }
        let (listener, path) = result.expect("bind unix");
        assert_eq!(path, sock);
        assert!(path.is_file());
        drop(listener);
        super::remove_api_unix_socket(&path);
    }
}
