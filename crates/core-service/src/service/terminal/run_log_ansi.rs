//! ANSI / control-sequence stripping for Run log tee plain-text projection.

pub fn strip_ansi_and_controls(input: &str) -> String {
    let bytes = input.as_bytes();
    let mut out = String::with_capacity(input.len());
    let mut i = 0;
    while i < bytes.len() {
        let b = bytes[i];
        if b == 0x1b {
            i += 1;
            if i >= bytes.len() {
                break;
            }
            match bytes[i] {
                b'[' => {
                    i += 1;
                    while i < bytes.len() {
                        let c = bytes[i];
                        i += 1;
                        if (0x40..=0x7e).contains(&c) {
                            break;
                        }
                    }
                }
                b']' => {
                    i += 1;
                    while i < bytes.len() {
                        let c = bytes[i];
                        i += 1;
                        if c == 0x07 {
                            break;
                        }
                        if c == 0x1b && i < bytes.len() && bytes[i] == b'\\' {
                            i += 1;
                            break;
                        }
                    }
                }
                b'P' | b'X' | b'^' | b'_' => {
                    i += 1;
                    while i < bytes.len() {
                        if bytes[i] == 0x1b {
                            i += 1;
                            if i < bytes.len() && bytes[i] == b'\\' {
                                i += 1;
                                break;
                            }
                        } else {
                            i += 1;
                        }
                    }
                }
                b'(' | b')' | b'*' | b'+' => {
                    // charset designation: ESC ( B etc.
                    i += 1;
                    if i < bytes.len() {
                        i += 1;
                    }
                }
                _ => {
                    // Single-char ESC sequences
                    i += 1;
                }
            }
            continue;
        }
        // Keep tab and newline; drop other C0 controls and DEL.
        if b == b'\n' || b == b'\t' || b == b'\r' {
            if b == b'\r' {
                // Normalize CR to nothing if followed by LF; else treat as newline.
                if i + 1 < bytes.len() && bytes[i + 1] == b'\n' {
                    i += 1;
                    continue;
                }
                out.push('\n');
            } else {
                out.push(b as char);
            }
            i += 1;
            continue;
        }
        if b < 0x20 || b == 0x7f {
            i += 1;
            continue;
        }
        // UTF-8: take valid leading bytes as chars via lossy slice walk
        let ch = input[i..].chars().next().unwrap_or('\u{FFFD}');
        let len = ch.len_utf8();
        out.push(ch);
        i += len;
    }
    out
}
