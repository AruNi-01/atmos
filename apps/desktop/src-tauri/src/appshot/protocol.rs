use std::path::Path;

const APPSHOT_PROTOCOL_PREFIX: &str = "atmos://appshots/";

pub fn is_valid_timestamp(timestamp: &str) -> bool {
    timestamp.len() == 13 && timestamp.bytes().all(|byte| byte.is_ascii_digit())
}

#[cfg(test)]
pub fn format_prompt(timestamp: &str) -> Result<String, String> {
    let record_dir = dirs::home_dir()
        .unwrap_or_else(std::env::temp_dir)
        .join(".atmos")
        .join("appshots")
        .join("records")
        .join(timestamp);
    format_prompt_for_record_dir(timestamp, &record_dir)
}

pub fn format_prompt_for_record_dir(timestamp: &str, record_dir: &Path) -> Result<String, String> {
    if !is_valid_timestamp(timestamp) {
        return Err("invalid appshot timestamp".to_string());
    }
    Ok(format!(
        "{prefix}{timestamp}\nAppshot record is stored locally at {record_dir}/. Read metadata.json, context.md, and snapshot.png in that directory before answering. Inspect snapshot.png when visual context matters.",
        prefix = APPSHOT_PROTOCOL_PREFIX,
        record_dir = record_dir.display(),
    ))
}

#[cfg(test)]
mod tests {
    use super::{format_prompt, format_prompt_for_record_dir, is_valid_timestamp};
    use std::path::Path;

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
    }

    #[test]
    fn formats_protocol_prompt_with_actual_record_dir() {
        let prompt = format_prompt_for_record_dir(
            "1760000000000",
            Path::new("/tmp/atmos-appshots/1760000000000"),
        )
        .unwrap();

        assert!(prompt.contains("/tmp/atmos-appshots/1760000000000/"));
    }
}
