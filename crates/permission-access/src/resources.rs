#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash)]
pub enum Capability {
    BrowserCookie,
}

impl Capability {
    pub fn as_str(self) -> &'static str {
        match self {
            Self::BrowserCookie => "browser-cookie",
        }
    }

    pub fn parse(raw: &str) -> Option<Self> {
        match raw {
            "browser-cookie" => Some(Self::BrowserCookie),
            _ => None,
        }
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct ResourceSpec {
    pub id: &'static str,
    pub label: &'static str,
    pub capability: Capability,
    pub app_markers: &'static [&'static str],
    pub binaries: &'static [&'static str],
    pub extra_markers: &'static [&'static str],
    pub user_visible: bool,
}

impl ResourceSpec {
    pub fn has_install_fingerprint(self) -> bool {
        !self.app_markers.is_empty() || !self.binaries.is_empty() || !self.extra_markers.is_empty()
    }

    pub fn grant_key(self) -> String {
        grant_key(self.capability, self.id)
    }
}

pub fn grant_key(capability: Capability, resource_id: &str) -> String {
    format!("{}:{resource_id}", capability.as_str())
}

pub const RESOURCES: &[ResourceSpec] = &[
    ResourceSpec {
        id: "cursor",
        label: "Cursor",
        capability: Capability::BrowserCookie,
        app_markers: &["Cursor.app", "Cursor Nightly.app"],
        binaries: &["cursor-agent", "cursor"],
        extra_markers: &[],
        user_visible: true,
    },
    ResourceSpec {
        id: "amp",
        label: "Amp",
        capability: Capability::BrowserCookie,
        app_markers: &["Amp.app"],
        binaries: &[],
        extra_markers: &[".local/share/amp"],
        user_visible: true,
    },
    ResourceSpec {
        id: "factory",
        label: "Factory Droid",
        capability: Capability::BrowserCookie,
        app_markers: &[],
        binaries: &["droid"],
        extra_markers: &[".factory"],
        user_visible: true,
    },
    ResourceSpec {
        id: "opencode",
        label: "OpenCode",
        capability: Capability::BrowserCookie,
        app_markers: &[],
        binaries: &["opencode"],
        extra_markers: &[".local/share/opencode"],
        user_visible: true,
    },
    ResourceSpec {
        id: "zed",
        label: "Zed",
        capability: Capability::BrowserCookie,
        app_markers: &["Zed.app"],
        binaries: &["zed"],
        extra_markers: &[],
        user_visible: true,
    },
    ResourceSpec {
        id: "mimo",
        label: "Xiaomi MiMo",
        capability: Capability::BrowserCookie,
        app_markers: &[],
        binaries: &[],
        extra_markers: &[],
        user_visible: true,
    },
    ResourceSpec {
        id: "minimax",
        label: "MiniMax",
        capability: Capability::BrowserCookie,
        app_markers: &[],
        binaries: &[],
        extra_markers: &[],
        user_visible: true,
    },
    ResourceSpec {
        id: "zai",
        label: "Zhipu AI",
        capability: Capability::BrowserCookie,
        app_markers: &[],
        binaries: &[],
        extra_markers: &[],
        user_visible: true,
    },
    ResourceSpec {
        id: "commandcode",
        label: "CommandCode",
        capability: Capability::BrowserCookie,
        app_markers: &[],
        binaries: &["commandcode"],
        extra_markers: &[".commandcode", ".config/commandcode"],
        user_visible: false,
    },
];

pub const BROWSER_COOKIE_RESOURCE_IDS: &[&str] = &[
    "cursor", "amp", "factory", "opencode", "zed", "mimo", "minimax", "zai",
];

pub fn resource_spec(resource_id: &str, capability: Capability) -> Option<&'static ResourceSpec> {
    RESOURCES
        .iter()
        .find(|spec| spec.id == resource_id && spec.capability == capability)
}
