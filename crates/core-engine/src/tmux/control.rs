//! tmux control mode protocol helpers.
//!
//! Control mode sends pane output as textual `%output` notifications. The
//! payload is not raw bytes: tmux escapes non-printable bytes and backslashes as
//! octal sequences, so callers must decode it before forwarding to a terminal
//! emulator.

/// A tmux control mode event that Atmos cares about.
#[derive(Debug, Clone, PartialEq, Eq)]
pub enum ControlModeEvent {
    Output {
        pane_id: String,
        data: Vec<u8>,
    },
    ExtendedOutput {
        pane_id: String,
        age_ms: u64,
        data: Vec<u8>,
    },
    Begin,
    End,
    Error(String),
    Exit(Option<String>),
    Notification(String),
}

/// Parse one newline-delimited tmux control mode line.
pub fn parse_control_line(line: &str) -> Option<ControlModeEvent> {
    parse_control_line_bytes(line.as_bytes())
}

/// Parse one newline-delimited tmux control mode line as bytes.
///
/// tmux's control protocol is line-oriented, but `%output` payloads can contain
/// raw high-bit bytes. Reading stdout into a UTF-8 `String` would kill the
/// control client as soon as a TUI emits non-UTF-8 bytes, so the runtime parser
/// works byte-first and only decodes ASCII metadata lossily.
pub fn parse_control_line_bytes(line: &[u8]) -> Option<ControlModeEvent> {
    let line = trim_control_line_end(line);

    if let Some(rest) = strip_prefix(line, b"%output ") {
        let (pane_id, value) = split_once_whitespace_bytes(rest)?;
        return Some(ControlModeEvent::Output {
            pane_id: bytes_to_string(pane_id),
            data: decode_tmux_escaped_bytes(value),
        });
    }

    if let Some(rest) = strip_prefix(line, b"%extended-output ") {
        let (head, value) = split_extended_output_bytes(rest)?;
        let mut parts = head.split(|byte| byte.is_ascii_whitespace());
        let pane_id = bytes_to_string(parts.next()?);
        let age_ms = parts
            .next()
            .and_then(|v| std::str::from_utf8(v).ok())
            .and_then(|v| v.parse().ok())
            .unwrap_or(0);
        return Some(ControlModeEvent::ExtendedOutput {
            pane_id,
            age_ms,
            data: decode_tmux_escaped_bytes(value),
        });
    }

    if line.starts_with(b"%begin ") {
        return Some(ControlModeEvent::Begin);
    }
    if line.starts_with(b"%end ") {
        return Some(ControlModeEvent::End);
    }
    if line.starts_with(b"%error ") {
        return Some(ControlModeEvent::Error(bytes_to_string(line)));
    }
    if let Some(rest) = strip_prefix(line, b"%exit") {
        let reason = trim_ascii(rest);
        return Some(ControlModeEvent::Exit(
            (!reason.is_empty()).then(|| bytes_to_string(reason)),
        ));
    }
    if line.starts_with(b"%") {
        return Some(ControlModeEvent::Notification(bytes_to_string(line)));
    }

    None
}

/// Decode a tmux control mode escaped payload into raw pane bytes.
pub fn decode_tmux_escaped(value: &str) -> Vec<u8> {
    decode_tmux_escaped_bytes(value.as_bytes())
}

/// Decode a tmux control mode escaped payload into raw pane bytes.
pub fn decode_tmux_escaped_bytes(value: &[u8]) -> Vec<u8> {
    let mut bytes = Vec::with_capacity(value.len());
    let mut index = 0;

    while index < value.len() {
        if value[index] != b'\\' {
            bytes.push(value[index]);
            index += 1;
            continue;
        }

        let octal_end = (index + 4).min(value.len());
        if octal_end == index + 4 {
            let octal = &value[index + 1..octal_end];
            if octal.iter().all(|byte| (b'0'..=b'7').contains(byte)) {
                let decoded = (octal[0] - b'0') * 64 + (octal[1] - b'0') * 8 + (octal[2] - b'0');
                bytes.push(decoded);
                index = octal_end;
                continue;
            }
        }

        if value.get(index + 1) == Some(&b'\\') {
            bytes.push(b'\\');
            index += 2;
        } else {
            bytes.push(b'\\');
            index += 1;
        }
    }

    bytes
}

/// Build tmux `send-keys -H` commands for raw input bytes.
pub fn encode_send_keys_hex_commands(pane_id: &str, data: &[u8], chunk_size: usize) -> Vec<String> {
    if data.is_empty() {
        return Vec::new();
    }

    let chunk_size = chunk_size.max(1);
    data.chunks(chunk_size)
        .map(|chunk| {
            let hex = chunk
                .iter()
                .map(|byte| format!("{byte:02x}"))
                .collect::<Vec<_>>()
                .join(" ");
            format!("send-keys -t {pane_id} -H {hex}")
        })
        .collect()
}

/// Build a tmux `refresh-client -r` command for terminal emulator reports.
///
/// Control-mode clients must return terminal reports (OSC colour responses,
/// device attributes, cursor position reports, etc.) via `refresh-client -r`.
/// Sending these bytes with `send-keys` makes them ordinary keyboard input,
/// which can echo into the shell or corrupt TUI state.
pub fn encode_refresh_client_report_command(pane_id: &str, data: &[u8]) -> Option<String> {
    if data.is_empty() {
        return None;
    }

    let mut report = String::new();
    for &byte in data {
        match byte {
            b'\x1b' => report.push_str("\\e"),
            b'\r' => report.push_str("\\r"),
            b'\n' => report.push_str("\\n"),
            b'\t' => report.push_str("\\t"),
            b'\\' => report.push_str("\\\\"),
            b'"' => report.push_str("\\\""),
            b'$' => report.push_str("\\$"),
            b';' => report.push_str("\\;"),
            0x20..=0x7e => report.push(byte as char),
            byte => report.push_str(&format!("\\{byte:03o}")),
        }
    }

    Some(format!("refresh-client -r \"{pane_id}:{report}\"",))
}

const ESC: u8 = 0x1b;
const TMUX_PASSTHROUGH_PREFIX: &[u8] = b"\x1bPtmux;";
const SYNC_OUTPUT_BEGIN: &[u8] = b"\x1b[?2026h";
const SYNC_OUTPUT_END: &[u8] = b"\x1b[?2026l";

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
enum PassthroughState {
    Normal,
    Inside,
    AfterEsc,
}

impl Default for PassthroughState {
    fn default() -> Self {
        Self::Normal
    }
}

/// Stateful tmux DCS passthrough unwrapper.
///
/// Control mode does not guarantee output chunk boundaries align with DCS
/// boundaries, so callers that process a stream should keep one unwrapper per
/// tmux client and feed every pane output through it in order.
#[derive(Debug, Default, Clone)]
pub struct TmuxPassthroughUnwrapper {
    prefix_len: usize,
    state: PassthroughState,
}

impl TmuxPassthroughUnwrapper {
    pub fn push(&mut self, data: &[u8]) -> Vec<u8> {
        let mut output = Vec::with_capacity(data.len());

        for &byte in data {
            self.push_byte(byte, &mut output);
        }

        output
    }

    fn push_byte(&mut self, byte: u8, output: &mut Vec<u8>) {
        match self.state {
            PassthroughState::Normal => self.push_normal_byte(byte, output),
            PassthroughState::Inside => {
                if byte == ESC {
                    self.state = PassthroughState::AfterEsc;
                } else {
                    output.push(byte);
                }
            }
            PassthroughState::AfterEsc => match byte {
                b'\\' => {
                    self.state = PassthroughState::Normal;
                }
                ESC => {
                    output.push(ESC);
                    self.state = PassthroughState::Inside;
                }
                _ => {
                    output.push(ESC);
                    output.push(byte);
                    self.state = PassthroughState::Inside;
                }
            },
        }
    }

    fn push_normal_byte(&mut self, byte: u8, output: &mut Vec<u8>) {
        if self.prefix_len > 0 {
            if byte == TMUX_PASSTHROUGH_PREFIX[self.prefix_len] {
                self.prefix_len += 1;
                if self.prefix_len == TMUX_PASSTHROUGH_PREFIX.len() {
                    self.prefix_len = 0;
                    self.state = PassthroughState::Inside;
                }
                return;
            }

            output.extend_from_slice(&TMUX_PASSTHROUGH_PREFIX[..self.prefix_len]);
            self.prefix_len = 0;
        }

        if byte == TMUX_PASSTHROUGH_PREFIX[0] {
            self.prefix_len = 1;
        } else {
            output.push(byte);
        }
    }

    /// Flush bytes held only because they might have started a passthrough
    /// prefix. Stream readers normally do not need this until shutdown.
    pub fn finish(&mut self) -> Vec<u8> {
        let mut output = Vec::new();

        if self.prefix_len > 0 {
            output.extend_from_slice(&TMUX_PASSTHROUGH_PREFIX[..self.prefix_len]);
            self.prefix_len = 0;
        }

        if self.state == PassthroughState::AfterEsc {
            output.push(ESC);
            self.state = PassthroughState::Inside;
        }

        output
    }
}

/// Unwrap tmux DCS passthrough sequences before forwarding to xterm.js.
///
/// Programs running inside tmux often emit `ESC Ptmux; ... ESC \` wrappers for
/// terminal feature queries and graphics protocols. Browser xterm.js is the
/// actual terminal emulator here, not tmux, so it needs the inner payload.
pub fn unwrap_tmux_passthrough(data: &[u8]) -> Vec<u8> {
    let mut unwrapper = TmuxPassthroughUnwrapper::default();
    let mut output = unwrapper.push(data);
    output.extend(unwrapper.finish());
    output
}

/// Stateful filter for synchronized output mode markers.
///
/// Synchronized output (`CSI ? 2026 h/l`) is only a rendering throttle hint. It
/// is not required for terminal correctness, and some browser terminal
/// emulators can get stuck buffering when full-screen TUIs emit nested or
/// unbalanced markers across tmux control-mode chunks. Strip the markers before
/// forwarding pane output to xterm.js, while preserving every real drawing byte.
#[derive(Debug, Default, Clone)]
pub struct SynchronizedOutputFilter {
    pending: Vec<u8>,
}

impl SynchronizedOutputFilter {
    pub fn push(&mut self, data: &[u8]) -> Vec<u8> {
        if data.is_empty() {
            return Vec::new();
        }

        let mut input = Vec::with_capacity(self.pending.len() + data.len());
        input.append(&mut self.pending);
        input.extend_from_slice(data);

        let mut output = Vec::with_capacity(input.len());
        let mut index = 0;

        while index < input.len() {
            let rest = &input[index..];

            if rest.starts_with(SYNC_OUTPUT_BEGIN) {
                index += SYNC_OUTPUT_BEGIN.len();
                continue;
            }

            if rest.starts_with(SYNC_OUTPUT_END) {
                index += SYNC_OUTPUT_END.len();
                continue;
            }

            if is_sync_output_prefix(rest) {
                self.pending.extend_from_slice(rest);
                break;
            }

            output.push(input[index]);
            index += 1;
        }

        output
    }

    pub fn finish(&mut self) -> Vec<u8> {
        std::mem::take(&mut self.pending)
    }
}

pub fn strip_synchronized_output(data: &[u8]) -> Vec<u8> {
    let mut filter = SynchronizedOutputFilter::default();
    let mut output = filter.push(data);
    output.extend(filter.finish());
    output
}

fn is_sync_output_prefix(value: &[u8]) -> bool {
    value.len() < SYNC_OUTPUT_BEGIN.len()
        && (SYNC_OUTPUT_BEGIN.starts_with(value) || SYNC_OUTPUT_END.starts_with(value))
}

fn split_once_whitespace_bytes(value: &[u8]) -> Option<(&[u8], &[u8])> {
    let idx = value.iter().position(|byte| byte.is_ascii_whitespace())?;
    let (left, right) = value.split_at(idx);
    // tmux separates metadata from the escaped payload with exactly one
    // whitespace byte. Payload bytes may legitimately start with spaces; full
    // screen TUIs use those leading spaces to erase old cells. Do not trim them.
    Some((left, &right[1..]))
}

fn split_extended_output_bytes(value: &[u8]) -> Option<(&[u8], &[u8])> {
    if let Some(idx) = find_bytes(value, b" : ") {
        let (head, rest) = value.split_at(idx);
        return Some((head, &rest[3..]));
    }

    if let Some(idx) = find_bytes(value, b" :") {
        let (head, rest) = value.split_at(idx);
        let value = strip_one_ascii_whitespace(&rest[2..]);
        return Some((head, value));
    }

    None
}

fn strip_prefix<'a>(value: &'a [u8], prefix: &[u8]) -> Option<&'a [u8]> {
    value.starts_with(prefix).then(|| &value[prefix.len()..])
}

fn trim_control_line_end(mut value: &[u8]) -> &[u8] {
    while matches!(value.last(), Some(b'\n' | b'\r')) {
        value = &value[..value.len() - 1];
    }
    value
}

fn trim_ascii(value: &[u8]) -> &[u8] {
    let value = trim_ascii_start(value);
    let end = value
        .iter()
        .rposition(|byte| !byte.is_ascii_whitespace())
        .map(|idx| idx + 1)
        .unwrap_or(0);
    &value[..end]
}

fn trim_ascii_start(value: &[u8]) -> &[u8] {
    let start = value
        .iter()
        .position(|byte| !byte.is_ascii_whitespace())
        .unwrap_or(value.len());
    &value[start..]
}

fn strip_one_ascii_whitespace(value: &[u8]) -> &[u8] {
    match value.first() {
        Some(byte) if byte.is_ascii_whitespace() => &value[1..],
        _ => value,
    }
}

fn find_bytes(haystack: &[u8], needle: &[u8]) -> Option<usize> {
    if needle.is_empty() || haystack.len() < needle.len() {
        return None;
    }
    haystack
        .windows(needle.len())
        .position(|window| window == needle)
}

fn bytes_to_string(value: &[u8]) -> String {
    String::from_utf8_lossy(value).to_string()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn parses_output_with_octal_escapes() {
        assert_eq!(
            parse_control_line(r"%output %0 hello\015\012\033[31mred\033[0m"),
            Some(ControlModeEvent::Output {
                pane_id: "%0".to_string(),
                data: b"hello\r\n\x1b[31mred\x1b[0m".to_vec(),
            })
        );
    }

    #[test]
    fn preserves_output_payload_leading_spaces() {
        assert_eq!(
            parse_control_line_bytes(b"%output %0    leading spaces\n"),
            Some(ControlModeEvent::Output {
                pane_id: "%0".to_string(),
                data: b"   leading spaces".to_vec(),
            })
        );
    }

    #[test]
    fn parses_output_with_non_utf8_payload_bytes() {
        assert_eq!(
            parse_control_line_bytes(b"%output %0 raw-\xff-byte\n"),
            Some(ControlModeEvent::Output {
                pane_id: "%0".to_string(),
                data: b"raw-\xff-byte".to_vec(),
            })
        );
    }

    #[test]
    fn parses_extended_output() {
        assert_eq!(
            parse_control_line(r"%extended-output %1 42 ignored : a\\b\012"),
            Some(ControlModeEvent::ExtendedOutput {
                pane_id: "%1".to_string(),
                age_ms: 42,
                data: b"a\\b\n".to_vec(),
            })
        );
    }

    #[test]
    fn decodes_utf8_and_control_bytes() {
        assert_eq!(
            decode_tmux_escaped(r"你\033[0m\134"),
            "你\x1b[0m\\".as_bytes().to_vec()
        );
    }

    #[test]
    fn decodes_escaped_payload_bytes_without_requiring_utf8() {
        assert_eq!(
            decode_tmux_escaped_bytes(b"\xff\\033[0m\\134"),
            b"\xff\x1b[0m\\".to_vec()
        );
    }

    #[test]
    fn encodes_input_as_hex_chunks() {
        assert_eq!(
            encode_send_keys_hex_commands("%0", "你\n".as_bytes(), 3),
            vec![
                "send-keys -t %0 -H e4 bd a0".to_string(),
                "send-keys -t %0 -H 0a".to_string(),
            ]
        );
    }

    #[test]
    fn encodes_terminal_report_for_refresh_client() {
        assert_eq!(
            encode_refresh_client_report_command("%0", b"\x1b]11;rgb:0909/0909/0b0b\x1b\\")
                .as_deref(),
            Some(r#"refresh-client -r "%0:\e]11\;rgb:0909/0909/0b0b\e\\""#),
        );
        assert_eq!(
            encode_refresh_client_report_command("%1", b"\x1b[?2027;0$y").as_deref(),
            Some(r#"refresh-client -r "%1:\e[?2027\;0\$y""#),
        );
    }

    #[test]
    fn unwraps_tmux_passthrough_queries() {
        assert_eq!(
            unwrap_tmux_passthrough(b"a\x1bPtmux;\x1b\x1b[?2026$p\x1b\\b"),
            b"a\x1b[?2026$pb".to_vec()
        );
    }

    #[test]
    fn unwraps_nested_inner_st() {
        assert_eq!(
            unwrap_tmux_passthrough(b"\x1bPtmux;\x1b\x1b_Gdata\x1b\x1b\\\x1b\\"),
            b"\x1b_Gdata\x1b\\".to_vec()
        );
    }

    #[test]
    fn unwraps_passthrough_across_chunks() {
        let mut unwrapper = TmuxPassthroughUnwrapper::default();

        assert_eq!(unwrapper.push(b"a\x1bPtm"), b"a".to_vec());
        assert_eq!(unwrapper.push(b"ux;\x1b"), Vec::<u8>::new());
        assert_eq!(unwrapper.push(b"\x1b[?2026$p"), b"\x1b[?2026$p".to_vec());
        assert_eq!(unwrapper.push(b"\x1b"), Vec::<u8>::new());
        assert_eq!(unwrapper.push(b"\\b"), b"b".to_vec());
    }

    #[test]
    fn preserves_split_non_passthrough_escape_sequences() {
        let mut unwrapper = TmuxPassthroughUnwrapper::default();

        assert_eq!(unwrapper.push(b"\x1b"), Vec::<u8>::new());
        assert_eq!(unwrapper.push(b"[31mred"), b"\x1b[31mred".to_vec());
    }

    #[test]
    fn strips_synchronized_output_markers() {
        assert_eq!(
            strip_synchronized_output(b"a\x1b[?2026hb\x1b[?2026lc"),
            b"abc".to_vec()
        );
    }

    #[test]
    fn strips_synchronized_output_markers_across_chunks() {
        let mut filter = SynchronizedOutputFilter::default();

        assert_eq!(filter.push(b"a\x1b[?20"), b"a".to_vec());
        assert_eq!(filter.push(b"26hb\x1b[?"), b"b".to_vec());
        assert_eq!(filter.push(b"2026lc"), b"c".to_vec());
        assert_eq!(filter.finish(), Vec::<u8>::new());
    }

    #[test]
    fn preserves_non_sync_csi_prefixes() {
        let mut filter = SynchronizedOutputFilter::default();

        assert_eq!(filter.push(b"\x1b[?25lhide"), b"\x1b[?25lhide".to_vec());
        assert_eq!(filter.finish(), Vec::<u8>::new());
    }
}
