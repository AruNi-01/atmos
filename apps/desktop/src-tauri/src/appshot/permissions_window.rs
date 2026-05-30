use tauri::utils::config::Color;
use tauri::Url;
use tauri::{AppHandle, Manager, WebviewUrl, WebviewWindowBuilder};

#[cfg(target_os = "macos")]
use tauri::{LogicalPosition, Position, TitleBarStyle};

const PERMISSIONS_WINDOW_LABEL: &str = "appshot-permissions";

pub fn show_permissions_window(
    app: AppHandle,
    locale: Option<String>,
    api_port: u16,
) -> Result<(), String> {
    if let Some(existing) = app.get_webview_window(PERMISSIONS_WINDOW_LABEL) {
        let _ = existing.navigate(appshot_external_url(
            "appshot-permissions",
            locale.as_deref(),
            api_port,
        )?);
        let _ = existing.show();
        let _ = existing.set_focus();
        return Ok(());
    }

    let mut builder = WebviewWindowBuilder::new(
        &app,
        PERMISSIONS_WINDOW_LABEL,
        appshot_window_url("appshot-permissions", locale.as_deref(), api_port)?,
    )
    .title("Enable Appshots")
    .inner_size(720.0, 520.0)
    .min_inner_size(640.0, 460.0)
    .resizable(false)
    .decorations(true);

    #[cfg(target_os = "macos")]
    {
        builder = builder
            .hidden_title(true)
            .title_bar_style(TitleBarStyle::Overlay)
            .traffic_light_position(Position::Logical(LogicalPosition::new(16.0, 18.0)));
    }

    let window = builder
        .transparent(false)
        .shadow(true)
        .visible(false)
        .build()
        .map_err(|error| format!("failed to open Appshots permissions window: {error}"))?;

    let _ = window.set_background_color(Some(Color(7, 9, 12, 255)));
    let _ = window.center();
    let _ = window.show();
    let _ = window.set_focus();
    Ok(())
}

fn appshot_window_url(
    route: &str,
    locale: Option<&str>,
    api_port: u16,
) -> Result<WebviewUrl, String> {
    Ok(WebviewUrl::External(appshot_external_url(
        route, locale, api_port,
    )?))
}

fn appshot_external_url(route: &str, locale: Option<&str>, api_port: u16) -> Result<Url, String> {
    let route = appshot_window_route(route, locale)?;
    let url = format!("http://127.0.0.1:{api_port}/{route}");
    url.parse::<Url>()
        .map_err(|error| format!("invalid Appshots window URL: {error}"))
}

fn appshot_window_route(route: &str, locale: Option<&str>) -> Result<String, String> {
    let locale = sanitize_locale(locale).ok_or_else(|| {
        "failed to open Appshots permissions window: missing active locale".to_string()
    })?;
    Ok(format!("{locale}/{route}/"))
}

fn sanitize_locale(locale: Option<&str>) -> Option<String> {
    let locale = locale?.trim();
    if locale.len() < 2 || locale.len() > 32 {
        return None;
    }
    if !locale
        .bytes()
        .all(|byte| byte.is_ascii_alphanumeric() || matches!(byte, b'-' | b'_'))
    {
        return None;
    }
    Some(locale.to_string())
}
