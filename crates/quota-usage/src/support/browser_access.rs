//! Quota-specific cookie lookup tables. Presence and consent live in
//! `permission-access`.

use crate::constants::COMMANDCODE_COOKIE_NAMES;

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct BrowserCookieSpec {
    pub id: &'static str,
    pub label: &'static str,
    pub domains: &'static [&'static str],
    pub cookie_names: &'static [&'static str],
    pub require_named_session: bool,
}

pub const BROWSER_COOKIE_SPECS: &[BrowserCookieSpec] = &[
    BrowserCookieSpec {
        id: "cursor",
        label: "Cursor",
        domains: &["cursor.com", "www.cursor.com"],
        cookie_names: &["WorkosCursorSessionToken", "team_id"],
        require_named_session: false,
    },
    BrowserCookieSpec {
        id: "amp",
        label: "Amp",
        domains: &["ampcode.com", "www.ampcode.com"],
        cookie_names: &["session"],
        require_named_session: false,
    },
    BrowserCookieSpec {
        id: "factory",
        label: "Factory Droid",
        domains: &["factory.ai", "app.factory.ai", "auth.factory.ai"],
        cookie_names: &[
            "wos-session",
            "__Secure-next-auth.session-token",
            "next-auth.session-token",
            "__Secure-authjs.session-token",
            "__Host-authjs.csrf-token",
            "authjs.session-token",
            "session",
            "access-token",
        ],
        require_named_session: true,
    },
    BrowserCookieSpec {
        id: "opencode",
        label: "OpenCode",
        domains: &["opencode.ai", "www.opencode.ai"],
        cookie_names: &["auth"],
        require_named_session: false,
    },
    BrowserCookieSpec {
        id: "zed",
        label: "Zed",
        domains: &["zed.dev", "cloud.zed.dev", "dashboard.zed.dev"],
        cookie_names: &["zed.session"],
        require_named_session: false,
    },
    BrowserCookieSpec {
        id: "mimo",
        label: "Xiaomi MiMo",
        domains: &["platform.xiaomimimo.com", "xiaomimimo.com"],
        cookie_names: &["api-platform_serviceToken"],
        require_named_session: true,
    },
    BrowserCookieSpec {
        id: "minimax",
        label: "MiniMax",
        domains: &[
            "platform.minimax.io",
            "openplatform.minimax.io",
            "minimax.io",
            "platform.minimaxi.com",
            "openplatform.minimaxi.com",
            "minimaxi.com",
        ],
        cookie_names: &["HERTZ-SESSION"],
        require_named_session: true,
    },
    BrowserCookieSpec {
        id: "zai",
        label: "Zhipu AI",
        domains: &[
            "bigmodel.cn",
            "open.bigmodel.cn",
            "chat.z.ai",
            "z.ai",
            "api.z.ai",
        ],
        cookie_names: &["bigmodel_token_production", "token", "TDC_itoken"],
        require_named_session: true,
    },
    BrowserCookieSpec {
        id: "workos",
        label: "WorkOS",
        domains: &["workos.com"],
        cookie_names: &["__wuid", "__kduid", "wos-session"],
        require_named_session: true,
    },
    BrowserCookieSpec {
        id: "commandcode",
        label: "CommandCode",
        domains: &["commandcode.ai", "www.commandcode.ai"],
        cookie_names: COMMANDCODE_COOKIE_NAMES,
        require_named_session: true,
    },
];

pub fn browser_cookie_spec(provider_id: &str) -> Option<&'static BrowserCookieSpec> {
    BROWSER_COOKIE_SPECS
        .iter()
        .find(|spec| spec.id == provider_id)
}

pub fn may_probe_browser_cookies(provider_id: &str) -> bool {
    let resource_id = if provider_id == "workos" {
        "factory"
    } else {
        provider_id
    };
    permission_access::check(resource_id, permission_access::Capability::BrowserCookie)
        == permission_access::Decision::Allow
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn known_cookie_providers_are_registered() {
        for id in [
            "cursor", "amp", "factory", "opencode", "zed", "mimo", "minimax", "zai",
        ] {
            assert!(browser_cookie_spec(id).is_some(), "{id}");
        }
    }
}
