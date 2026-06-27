pub fn sanitize_locale(locale: Option<&str>) -> Option<String> {
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
