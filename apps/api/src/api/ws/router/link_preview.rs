use std::net::{IpAddr, Ipv4Addr, Ipv6Addr};
use std::time::Duration;

use reqwest::redirect::Policy;
use reqwest::Url;
use serde_json::Value;
use tokio::net::lookup_host;

use core_service::{Result, ServiceError};

use super::{parse_request, LinkPreviewPayload, LinkPreviewRequest, WsMessageService};

const FETCH_TIMEOUT: Duration = Duration::from_secs(8);
const CONNECT_TIMEOUT: Duration = Duration::from_secs(4);
const MAX_HTML_BYTES: usize = 512 * 1024;
const MAX_REDIRECTS: usize = 5;
const USER_AGENT: &str = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36";

impl WsMessageService {
    pub(super) async fn handle_link_preview(&self, data: Value) -> Result<Value> {
        let req: LinkPreviewRequest = parse_request(data)?;
        let preview = fetch_link_preview(&req.url).await?;
        serde_json::to_value(preview)
            .map_err(|e| ServiceError::Processing(format!("Failed to encode link preview: {e}")))
    }
}

async fn fetch_link_preview(raw: &str) -> Result<LinkPreviewPayload> {
    let mut url = parse_public_http_url(raw)?;
    let client = preview_http_client()?;
    let mut response = None;
    for _ in 0..=MAX_REDIRECTS {
        assert_public_host(&url).await?;
        let next = client
            .get(url.clone())
            .header(
                "Accept",
                "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
            )
            .header("Accept-Language", "en-US,en;q=0.9,zh-CN;q=0.8,zh;q=0.7")
            .send()
            .await
            .map_err(|e| ServiceError::Validation(format!("Failed to fetch link preview: {e}")))?;
        if next.status().is_redirection() {
            let location = next
                .headers()
                .get(reqwest::header::LOCATION)
                .and_then(|value| value.to_str().ok())
                .map(str::trim)
                .filter(|value| !value.is_empty())
                .ok_or_else(|| {
                    ServiceError::Validation("Preview redirect is missing Location".to_string())
                })?;
            url = resolve_redirect_url(&url, location)?;
            continue;
        }
        response = Some(next);
        break;
    }
    let response = response
        .ok_or_else(|| ServiceError::Validation("Preview redirected too many times".to_string()))?;
    let final_url = url;

    if !response.status().is_success() {
        return Err(ServiceError::Validation(format!(
            "Link preview HTTP {}",
            response.status().as_u16()
        )));
    }

    let content_type = response
        .headers()
        .get(reqwest::header::CONTENT_TYPE)
        .and_then(|value| value.to_str().ok())
        .unwrap_or("")
        .to_ascii_lowercase();
    if !content_type.is_empty()
        && !content_type.contains("text/html")
        && !content_type.contains("application/xhtml")
        && !content_type.contains("text/plain")
    {
        return Ok(LinkPreviewPayload {
            url: final_url.to_string(),
            title: None,
            description: None,
            image_url: None,
            favicon_url: None,
            site_name: None,
        });
    }

    let bytes = response
        .bytes()
        .await
        .map_err(|e| ServiceError::Validation(format!("Failed to read link preview: {e}")))?;
    let html = if bytes.len() > MAX_HTML_BYTES {
        String::from_utf8_lossy(&bytes[..MAX_HTML_BYTES]).into_owned()
    } else {
        String::from_utf8_lossy(&bytes).into_owned()
    };

    Ok(parse_link_preview_html(&html, &final_url))
}

fn preview_http_client() -> Result<reqwest::Client> {
    reqwest::Client::builder()
        .timeout(FETCH_TIMEOUT)
        .connect_timeout(CONNECT_TIMEOUT)
        .redirect(Policy::none())
        .cookie_store(true)
        .user_agent(USER_AGENT)
        .build()
        .map_err(|e| ServiceError::Processing(format!("Failed to build preview client: {e}")))
}

fn resolve_redirect_url(current: &Url, location: &str) -> Result<Url> {
    let joined = current
        .join(location)
        .map_err(|_| ServiceError::Validation("Invalid preview redirect".to_string()))?;
    parse_public_http_url(joined.as_str())
}

fn parse_public_http_url(raw: &str) -> Result<Url> {
    let trimmed = raw.trim();
    let url = Url::parse(trimmed)
        .map_err(|_| ServiceError::Validation("Invalid preview URL".to_string()))?;
    if url.scheme() != "http" && url.scheme() != "https" {
        return Err(ServiceError::Validation(
            "Preview URL must be http or https".to_string(),
        ));
    }
    let host = url
        .host_str()
        .ok_or_else(|| ServiceError::Validation("Preview URL is missing a host".to_string()))?;
    if host_is_blocked(host) {
        return Err(ServiceError::Validation(
            "Preview URL host is not allowed".to_string(),
        ));
    }
    Ok(url)
}

async fn assert_public_host(url: &Url) -> Result<()> {
    let host = url
        .host_str()
        .ok_or_else(|| ServiceError::Validation("Preview URL is missing a host".to_string()))?;
    if host_is_blocked(host) {
        return Err(ServiceError::Validation(
            "Preview URL host is not allowed".to_string(),
        ));
    }
    let port = url.port_or_known_default().unwrap_or(80);
    let addrs = lookup_host((host, port))
        .await
        .map_err(|e| ServiceError::Validation(format!("Failed to resolve preview host: {e}")))?;
    for addr in addrs {
        if ip_is_unsafe(addr.ip()) {
            return Err(ServiceError::Validation(
                "Preview URL host is not allowed".to_string(),
            ));
        }
    }
    Ok(())
}

fn host_is_blocked(host: &str) -> bool {
    let host = host.trim_end_matches('.').to_ascii_lowercase();
    if host.is_empty()
        || host == "localhost"
        || host.ends_with(".localhost")
        || host.ends_with(".local")
        || host.ends_with(".internal")
        || host == "metadata.google.internal"
    {
        return true;
    }
    if let Ok(ip) = host.parse::<IpAddr>() {
        return ip_is_unsafe(ip);
    }
    false
}

fn ip_is_unsafe(ip: IpAddr) -> bool {
    match ip {
        IpAddr::V4(v4) => ipv4_is_unsafe(v4),
        IpAddr::V6(v6) => ipv6_is_unsafe(v6),
    }
}

fn ipv4_is_unsafe(ip: Ipv4Addr) -> bool {
    ip.is_unspecified()
        || ip.is_loopback()
        || ip.is_private()
        || ip.is_link_local()
        || ip.is_broadcast()
        || ip.is_documentation()
        || ip.is_multicast()
        || is_cgnat(ip)
        || is_benchmarking(ip)
}

fn ipv6_is_unsafe(ip: Ipv6Addr) -> bool {
    if ip.is_unspecified() || ip.is_loopback() || ip.is_multicast() || ip.is_unique_local() {
        return true;
    }
    if ip.is_unicast_link_local() {
        return true;
    }
    if let Some(v4) = ip.to_ipv4_mapped() {
        return ipv4_is_unsafe(v4);
    }
    false
}

fn is_cgnat(ip: Ipv4Addr) -> bool {
    let octets = ip.octets();
    octets[0] == 100 && (octets[1] & 0b1100_0000) == 64
}

fn is_benchmarking(ip: Ipv4Addr) -> bool {
    let octets = ip.octets();
    octets[0] == 198 && (octets[1] == 18 || octets[1] == 19)
}

pub(crate) fn parse_link_preview_html(html: &str, base: &Url) -> LinkPreviewPayload {
    let title =
        meta_content(html, &["og:title", "twitter:title"]).or_else(|| tag_text(html, "title"));
    let description = meta_content(
        html,
        &["og:description", "twitter:description", "description"],
    );
    let image = meta_content(
        html,
        &[
            "og:image",
            "og:image:url",
            "og:image:secure_url",
            "twitter:image",
            "twitter:image:src",
        ],
    )
    .and_then(|value| resolve_url(base, &value));
    let site_name = meta_content(html, &["og:site_name"]);
    let favicon = icon_href(html)
        .and_then(|value| resolve_url(base, &value))
        .or_else(|| base.join("/favicon.ico").ok().map(|url| url.to_string()));

    LinkPreviewPayload {
        url: base.to_string(),
        title,
        description,
        image_url: image,
        favicon_url: favicon,
        site_name,
    }
}

fn meta_content(html: &str, keys: &[&str]) -> Option<String> {
    let lower = html.to_ascii_lowercase();
    let mut from = 0;
    while let Some(rel) = lower[from..].find("<meta") {
        let start = from + rel;
        let Some(end_rel) = lower[start..].find('>') else {
            break;
        };
        let end = start + end_rel + 1;
        let tag = &html[start..end];
        let tag_lower = &lower[start..end];
        from = end;
        let Some(property) = attr(tag, tag_lower, "property")
            .or_else(|| attr(tag, tag_lower, "name"))
            .map(|value| value.to_ascii_lowercase())
        else {
            continue;
        };
        if !keys.iter().any(|key| property == *key) {
            continue;
        }
        if let Some(content) = attr(tag, tag_lower, "content") {
            let decoded = decode_entities(&content);
            if !decoded.is_empty() {
                return Some(decoded);
            }
        }
    }
    None
}

fn icon_href(html: &str) -> Option<String> {
    let lower = html.to_ascii_lowercase();
    let mut from = 0;
    let mut fallback: Option<String> = None;
    while let Some(rel) = lower[from..].find("<link") {
        let start = from + rel;
        let Some(end_rel) = lower[start..].find('>') else {
            break;
        };
        let end = start + end_rel + 1;
        let tag = &html[start..end];
        let tag_lower = &lower[start..end];
        from = end;
        let rel_attr = attr(tag, tag_lower, "rel")
            .map(|value| value.to_ascii_lowercase())
            .unwrap_or_default();
        let href = match attr(tag, tag_lower, "href") {
            Some(value) if !value.trim().is_empty() => value,
            _ => continue,
        };
        if rel_attr.split_whitespace().any(|part| part == "icon") {
            return Some(href);
        }
        if fallback.is_none()
            && (rel_attr.contains("shortcut") || rel_attr.contains("apple-touch-icon"))
        {
            fallback = Some(href);
        }
    }
    fallback
}

fn tag_text(html: &str, tag: &str) -> Option<String> {
    let lower = html.to_ascii_lowercase();
    let open = format!("<{tag}");
    let close = format!("</{tag}>");
    let start = lower.find(&open)?;
    let after_start = start + open.len();
    let gt = lower[after_start..].find('>')? + after_start + 1;
    let end = lower[gt..].find(&close)? + gt;
    let raw = html[gt..end].trim();
    let decoded = decode_entities(raw);
    if decoded.is_empty() {
        None
    } else {
        Some(decoded)
    }
}

fn attr(tag: &str, tag_lower: &str, name: &str) -> Option<String> {
    let needle = format!("{name}=");
    let idx = tag_lower.find(&needle)?;
    let rest = tag[idx + needle.len()..].trim_start();
    let (quote, rest) = match rest.as_bytes().first().copied() {
        Some(b'"') => ('"', &rest[1..]),
        Some(b'\'') => ('\'', &rest[1..]),
        _ => return None,
    };
    let end = rest.find(quote)?;
    Some(rest[..end].trim().to_string())
}

fn resolve_url(base: &Url, value: &str) -> Option<String> {
    let trimmed = value.trim();
    if trimmed.is_empty() {
        return None;
    }
    if trimmed.starts_with("//") {
        let scheme = base.scheme();
        return Url::parse(&format!("{scheme}:{trimmed}"))
            .ok()
            .map(|url| url.to_string());
    }
    base.join(trimmed).ok().map(|url| url.to_string())
}

fn decode_entities(value: &str) -> String {
    let mut out = String::with_capacity(value.len());
    let mut rest = value;
    while let Some(amp) = rest.find('&') {
        out.push_str(&rest[..amp]);
        rest = &rest[amp..];
        if rest.starts_with("&amp;") {
            out.push('&');
            rest = &rest[5..];
        } else if rest.starts_with("&lt;") {
            out.push('<');
            rest = &rest[4..];
        } else if rest.starts_with("&gt;") {
            out.push('>');
            rest = &rest[4..];
        } else if rest.starts_with("&quot;") {
            out.push('"');
            rest = &rest[6..];
        } else if rest.starts_with("&apos;") || rest.starts_with("&#39;") {
            out.push('\'');
            rest = if rest.starts_with("&apos;") {
                &rest[6..]
            } else {
                &rest[5..]
            };
        } else if rest.starts_with("&nbsp;") {
            out.push(' ');
            rest = &rest[6..];
        } else if let Some(end) = rest.find(';') {
            out.push_str(&rest[..=end]);
            rest = &rest[end + 1..];
        } else {
            out.push_str(rest);
            rest = "";
        }
    }
    out.push_str(rest);
    out.split_whitespace().collect::<Vec<_>>().join(" ")
}

#[cfg(test)]
mod tests {
    use super::*;

    fn base() -> Url {
        Url::parse("https://payloadcms.com/docs/components").unwrap()
    }

    #[test]
    fn parses_og_title_and_image() {
        let html = r#"
            <html>
              <head>
                <title>Fallback</title>
                <meta property="og:title" content="UI Components | Documentation | Payload">
                <meta property="og:image" content="/og.png">
                <meta property="og:site_name" content="Payload">
                <link rel="icon" href="/favicon.ico">
              </head>
            </html>
        "#;
        let preview = parse_link_preview_html(html, &base());
        assert_eq!(
            preview.title.as_deref(),
            Some("UI Components | Documentation | Payload")
        );
        assert_eq!(
            preview.image_url.as_deref(),
            Some("https://payloadcms.com/og.png")
        );
        assert_eq!(preview.site_name.as_deref(), Some("Payload"));
        assert_eq!(
            preview.favicon_url.as_deref(),
            Some("https://payloadcms.com/favicon.ico")
        );
    }

    #[test]
    fn prefers_og_title_over_document_title() {
        let html = r#"<title>Tab title</title><meta name="twitter:title" content="Tweet title">"#;
        let preview = parse_link_preview_html(html, &base());
        assert_eq!(preview.title.as_deref(), Some("Tweet title"));
    }

    #[test]
    fn decodes_entities_in_title() {
        let html = r#"<title>Foo &amp; Bar&#39;s</title>"#;
        let preview = parse_link_preview_html(html, &base());
        assert_eq!(preview.title.as_deref(), Some("Foo & Bar's"));
    }

    #[test]
    fn blocks_localhost_and_private_literals() {
        assert!(parse_public_http_url("http://localhost/docs").is_err());
        assert!(parse_public_http_url("https://127.0.0.1/").is_err());
        assert!(parse_public_http_url("https://10.0.0.8/og").is_err());
        assert!(parse_public_http_url("ftp://example.com").is_err());
        assert!(parse_public_http_url("https://payloadcms.com/docs").is_ok());
    }

    #[test]
    fn cgnat_and_link_local_are_unsafe() {
        assert!(ipv4_is_unsafe(Ipv4Addr::new(100, 64, 1, 1)));
        assert!(ipv4_is_unsafe(Ipv4Addr::new(169, 254, 1, 1)));
        assert!(!ipv4_is_unsafe(Ipv4Addr::new(1, 1, 1, 1)));
    }

    #[test]
    fn reads_document_title_with_attributes() {
        let html = r#"<title data-rh="true">知乎 - 有问题，就会有答案</title>"#;
        let preview = parse_link_preview_html(html, &Url::parse("https://www.zhihu.com/").unwrap());
        assert_eq!(preview.title.as_deref(), Some("知乎 - 有问题，就会有答案"));
    }

    #[test]
    fn protocol_relative_redirect_keeps_https() {
        let current = Url::parse("https://www.zhihu.com/").unwrap();
        let next = resolve_redirect_url(&current, "//www.zhihu.com/signin?next=%2F").unwrap();
        assert_eq!(next.scheme(), "https");
        assert_eq!(next.host_str(), Some("www.zhihu.com"));
        assert_eq!(next.path(), "/signin");
        assert_eq!(next.query().unwrap_or(""), "next=%2F");
    }
}
