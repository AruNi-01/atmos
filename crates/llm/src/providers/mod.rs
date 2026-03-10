pub mod anthropic_compatible;
pub mod openai_compatible;

pub(crate) fn build_endpoint(base_url: &str, suffix: &str) -> String {
    let trimmed = base_url.trim_end_matches('/');
    if trimmed.ends_with(suffix) {
        trimmed.to_string()
    } else {
        format!("{trimmed}{suffix}")
    }
}
