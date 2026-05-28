const APPSHOT_PROTOCOL_PREFIX: &str = "atmos://appshots/";

pub fn is_valid_timestamp(timestamp: &str) -> bool {
    timestamp.len() == 13 && timestamp.bytes().all(|byte| byte.is_ascii_digit())
}

pub fn format_prompt(timestamp: &str) -> Result<String, String> {
    if !is_valid_timestamp(timestamp) {
        return Err("invalid appshot timestamp".to_string());
    }
    Ok(format!(
        "{prefix}{timestamp}\nAppshot record is stored locally in Atmos appshots records for timestamp {timestamp}. The default location is ~/.atmos/appshots/records/{timestamp}/. Read metadata.json, context.md, and snapshot.png before answering. Inspect snapshot.png when visual context matters.",
        prefix = APPSHOT_PROTOCOL_PREFIX,
    ))
}

#[cfg(test)]
mod tests {
    use super::{format_prompt, is_valid_timestamp};

    #[test]
    fn validates_timestamp_shape() {
        assert!(is_valid_timestamp("1760000000000"));
        assert!(!is_valid_timestamp("176000000000"));
        assert!(!is_valid_timestamp("17600000000000"));
        assert!(!is_valid_timestamp("17600000000aa"));
    }

    #[test]
    fn formats_protocol_prompt() {
        let prompt = format_prompt("1760000000000").unwrap();
        assert!(prompt.starts_with("atmos://appshots/1760000000000\n"));
        assert!(prompt.contains(".atmos/appshots/records/1760000000000/"));
        assert!(prompt.contains("snapshot.png"));
        assert!(!prompt.contains("/Users/"));
        assert!(!prompt.contains("/tmp/"));
    }
}
