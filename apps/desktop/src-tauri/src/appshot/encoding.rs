const BASE64_TABLE: &[u8; 64] = b"ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
pub const DATA_URL_PREFIX: &str = "data:image/png;base64,";
pub const MAX_INLINE_SNAPSHOT_BYTES: usize = 384 * 1024;
pub const OVERSIZED_SNAPSHOT_WARNING: &str =
    "Screenshot preview was hidden because the inline image payload is too large.";

pub fn png_data_url_len(byte_len: u64) -> u64 {
    DATA_URL_PREFIX.len() as u64 + byte_len.div_ceil(3) * 4
}

pub fn fits_inline_png_data_url(byte_len: u64) -> bool {
    png_data_url_len(byte_len) <= MAX_INLINE_SNAPSHOT_BYTES as u64
}

pub fn base64_encode(bytes: &[u8]) -> String {
    let mut out = String::with_capacity(bytes.len().div_ceil(3) * 4);
    let mut index = 0;

    while index + 3 <= bytes.len() {
        let chunk = &bytes[index..index + 3];
        out.push(BASE64_TABLE[(chunk[0] >> 2) as usize] as char);
        out.push(
            BASE64_TABLE[(((chunk[0] & 0b0000_0011) << 4) | (chunk[1] >> 4)) as usize] as char,
        );
        out.push(
            BASE64_TABLE[(((chunk[1] & 0b0000_1111) << 2) | (chunk[2] >> 6)) as usize] as char,
        );
        out.push(BASE64_TABLE[(chunk[2] & 0b0011_1111) as usize] as char);
        index += 3;
    }

    match bytes.len() - index {
        1 => {
            let byte = bytes[index];
            out.push(BASE64_TABLE[(byte >> 2) as usize] as char);
            out.push(BASE64_TABLE[((byte & 0b0000_0011) << 4) as usize] as char);
            out.push('=');
            out.push('=');
        }
        2 => {
            let first = bytes[index];
            let second = bytes[index + 1];
            out.push(BASE64_TABLE[(first >> 2) as usize] as char);
            out.push(BASE64_TABLE[(((first & 0b0000_0011) << 4) | (second >> 4)) as usize] as char);
            out.push(BASE64_TABLE[((second & 0b0000_1111) << 2) as usize] as char);
            out.push('=');
        }
        _ => {}
    }

    out
}

#[cfg(test)]
mod tests {
    use super::base64_encode;

    #[test]
    fn encodes_base64_padding_cases() {
        assert_eq!(base64_encode(b""), "");
        assert_eq!(base64_encode(b"f"), "Zg==");
        assert_eq!(base64_encode(b"fo"), "Zm8=");
        assert_eq!(base64_encode(b"foo"), "Zm9v");
        assert_eq!(base64_encode(b"hello world"), "aGVsbG8gd29ybGQ=");
    }
}
