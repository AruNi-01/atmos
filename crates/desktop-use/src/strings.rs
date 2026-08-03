//! User-facing copy for Desktop Use. Keep free of third-party vendor brands.

pub const PRODUCT_NAME: &str = "Desktop Use";
pub const CLI_NAME: &str = "desktop-use";
pub const USER_DATA_DIR_NAME: &str = "desktop-use";

pub const ERR_ENGINE_NOT_INSTALLED: &str =
    "Desktop control engine is not installed. Run: atmos desktop-use driver ensure (Settings → Desktop Use)";
pub const ERR_ENGINE_FAILED: &str = "Desktop control engine failed";
pub const ERR_CAPTURE_UNSUPPORTED: &str = "Desktop capture is not supported on this platform";
pub const ERR_CAPTURE_FAILED: &str = "Desktop capture failed";
pub const HINT_ENSURE: &str =
    "Run `atmos desktop-use driver ensure` to install the control engine.";

/// Tokens that must never appear in user-facing Desktop Use strings.
const FORBIDDEN_VENDOR_TOKENS: &[&str] = &["cua", "Cua", "CUA", "trycua", "cua.ai", "CuaDriver"];

/// Returns true if `text` contains a forbidden vendor brand token.
pub fn contains_vendor_brand(text: &str) -> bool {
    FORBIDDEN_VENDOR_TOKENS.iter().any(|t| text.contains(t))
}

/// Assert helper for tests and debug checks.
pub fn assert_vendor_free(text: &str) {
    assert!(
        !contains_vendor_brand(text),
        "user-facing Desktop Use text must not contain vendor brands: {text}"
    );
}

/// Scrub accidental vendor tokens from an error for public display (defense in depth).
pub fn scrub_vendor(text: &str) -> String {
    let mut out = text.to_string();
    for token in FORBIDDEN_VENDOR_TOKENS {
        if out.contains(token) {
            out = out.replace(token, "control engine");
        }
    }
    out
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn product_copy_is_vendor_free() {
        for s in [
            PRODUCT_NAME,
            CLI_NAME,
            ERR_ENGINE_NOT_INSTALLED,
            ERR_ENGINE_FAILED,
            ERR_CAPTURE_UNSUPPORTED,
            ERR_CAPTURE_FAILED,
            HINT_ENSURE,
        ] {
            assert_vendor_free(s);
        }
    }

    #[test]
    fn detects_vendor_tokens() {
        assert!(contains_vendor_brand("install cua now"));
        assert!(contains_vendor_brand("trycua/foo"));
        assert!(!contains_vendor_brand("Desktop Use control engine"));
    }

    #[test]
    fn scrub_replaces_vendor() {
        let s = scrub_vendor("failed talking to CuaDriver");
        assert!(!contains_vendor_brand(&s));
        assert!(s.contains("control engine"));
    }
}
