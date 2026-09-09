//! Canonical low → high order for thinking / effort ladders.
//!
//! Providers such as Grok advertise `xhigh` first. The Effort slider maps
//! index 0 to the left, so ingest always sorts known levels weakest → strongest.

pub fn sort_thinking_levels(levels: &mut [String]) {
    levels.sort_by_key(|level| thinking_level_rank(level));
}

pub fn thinking_level_rank(level: &str) -> u8 {
    match normalize_thinking_level(level).as_str() {
        "off" | "none" => 0,
        "auto" => 1,
        "minimal" => 2,
        "low" => 3,
        "medium" | "med" => 4,
        "high" => 5,
        "xhigh" | "extrahigh" => 6,
        "max" | "maximum" => 7,
        "ultra" => 8,
        _ => 100,
    }
}

fn normalize_thinking_level(level: &str) -> String {
    level
        .trim()
        .to_ascii_lowercase()
        .replace(['-', '_', ' '], "")
}

#[cfg(test)]
mod tests {
    use super::sort_thinking_levels;

    #[test]
    fn grok_highest_first_becomes_low_to_extra_high() {
        let mut levels = vec!["xhigh".into(), "high".into(), "medium".into(), "low".into()];
        sort_thinking_levels(&mut levels);
        assert_eq!(levels, ["low", "medium", "high", "xhigh"]);
    }

    #[test]
    fn extra_high_aliases_rank_with_xhigh() {
        let mut levels = vec![
            "max".into(),
            "extra-high".into(),
            "low".into(),
            "extra_high".into(),
        ];
        sort_thinking_levels(&mut levels);
        assert_eq!(levels, ["low", "extra-high", "extra_high", "max"]);
    }

    #[test]
    fn unknown_levels_keep_relative_order_after_known() {
        let mut levels = vec![
            "custom".into(),
            "xhigh".into(),
            "other".into(),
            "low".into(),
        ];
        sort_thinking_levels(&mut levels);
        assert_eq!(levels, ["low", "xhigh", "custom", "other"]);
    }
}
