use sha2::{Digest, Sha256};

pub fn hex_sha256(bytes: &[u8]) -> String {
    Sha256::digest(bytes)
        .iter()
        .map(|b| format!("{b:02x}"))
        .collect()
}

pub fn assert_checksum(bytes: &[u8], expected: &str) -> Result<(), String> {
    let actual = hex_sha256(bytes);
    if actual.eq_ignore_ascii_case(expected) {
        Ok(())
    } else {
        Err(format!(
            "checksum mismatch (expected {expected}, got {actual})"
        ))
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn checksum_mismatch_is_typed() {
        let err = assert_checksum(b"hello", &"a".repeat(64)).unwrap_err();
        assert!(err.contains("checksum mismatch"));
    }
}
