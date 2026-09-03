//! SSE `data:` framing for OpenCode `GET /event`. Not NDJSON.

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct SseEvent {
    pub event: Option<String>,
    pub id: Option<String>,
    pub data: String,
}

#[derive(Debug, Clone, PartialEq)]
pub struct BusEvent {
    pub id: Option<String>,
    pub event_type: String,
    pub properties: serde_json::Value,
}

#[derive(Debug, Default)]
pub struct SseDecoder {
    line_buf: String,
    event: SseBuilder,
}

#[derive(Debug, Default)]
struct SseBuilder {
    event: Option<String>,
    id: Option<String>,
    data: Vec<String>,
}

impl SseBuilder {
    fn reset(&mut self) {
        *self = Self::default();
    }

    fn take_event(&mut self) -> Option<SseEvent> {
        if self.event.is_none() && self.id.is_none() && self.data.is_empty() {
            self.reset();
            return None;
        }
        let data = self.data.join("\n");
        let event = SseEvent {
            event: self.event.take(),
            id: self.id.take(),
            data,
        };
        self.reset();
        Some(event)
    }
}

impl SseDecoder {
    pub fn new() -> Self {
        Self::default()
    }

    pub fn push(&mut self, chunk: &str) -> Vec<SseEvent> {
        self.line_buf.push_str(chunk);
        let mut events = Vec::new();
        loop {
            let Some(newline_at) = self.line_buf.find('\n') else {
                break;
            };
            let mut line: String = self.line_buf.drain(..=newline_at).collect();
            if line.ends_with('\n') {
                line.pop();
            }
            if line.ends_with('\r') {
                line.pop();
            }
            if let Some(event) = self.push_line(&line) {
                events.push(event);
            }
        }
        events
    }

    #[cfg(test)]
    pub fn decode_all(bytes: &str) -> Vec<SseEvent> {
        let mut decoder = Self::new();
        let mut events = decoder.push(bytes);
        events.extend(decoder.finish());
        events
    }

    fn push_line(&mut self, line: &str) -> Option<SseEvent> {
        if line.is_empty() {
            return self.event.take_event();
        }
        if line.starts_with(':') {
            return None;
        }
        let (field, value) = split_field(line);
        match field {
            "event" => self.event.event = Some(value.to_string()),
            "id" => self.event.id = Some(value.to_string()),
            "data" => self.event.data.push(value.to_string()),
            "retry" => {}
            _ => {}
        }
        None
    }

    pub(crate) fn finish(&mut self) -> Vec<SseEvent> {
        if !self.line_buf.is_empty() {
            let rest = std::mem::take(&mut self.line_buf);
            if let Some(event) = self.push_line(rest.trim_end_matches(['\r', '\n'])) {
                return vec![event];
            }
        }
        self.event.take_event().into_iter().collect()
    }
}

fn split_field(line: &str) -> (&str, &str) {
    match line.split_once(':') {
        Some((field, rest)) => {
            let value = rest.strip_prefix(' ').unwrap_or(rest);
            (field, value)
        }
        None => (line, ""),
    }
}

/// Parse JSON from an SSE `data:` payload. The `data:` prefix is already stripped.
pub fn bus_from_sse(event: &SseEvent) -> Option<BusEvent> {
    if event.data.trim().is_empty() {
        return None;
    }
    let value: serde_json::Value = serde_json::from_str(&event.data).ok()?;
    let event_type = value
        .get("type")
        .and_then(|item| item.as_str())
        .unwrap_or("")
        .to_string();
    if event_type.is_empty() {
        return None;
    }
    let id = value
        .get("id")
        .and_then(|item| item.as_str())
        .map(str::to_string)
        .or_else(|| event.id.clone());
    let properties = value
        .get("properties")
        .cloned()
        .unwrap_or(serde_json::Value::Object(Default::default()));
    Some(BusEvent {
        id,
        event_type,
        properties,
    })
}

pub fn is_heartbeat(event: &BusEvent) -> bool {
    event.event_type == "server.heartbeat"
}

/// Incremental UTF-8 decode so SSE chunks that split a codepoint stay valid.
#[derive(Debug, Default)]
pub struct Utf8Buf {
    raw: Vec<u8>,
}

impl Utf8Buf {
    pub fn new() -> Self {
        Self::default()
    }

    pub fn push(&mut self, chunk: &[u8]) -> String {
        self.raw.extend_from_slice(chunk);
        match std::str::from_utf8(&self.raw) {
            Ok(text) => {
                let out = text.to_string();
                self.raw.clear();
                out
            }
            Err(error) => {
                let valid = error.valid_up_to();
                let out = String::from_utf8_lossy(&self.raw[..valid]).into_owned();
                self.raw.drain(..valid);
                out
            }
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn splits_on_blank_line_and_skips_comments() {
        let raw = concat!(
            ": comment\n",
            "\n",
            "data: {\"type\":\"server.connected\",\"properties\":{}}\n",
            "\n",
            "event: ignored\n",
            "id: 1\n",
            "data: {\"type\":\"server.heartbeat\",\"properties\":{}}\n",
            "\n",
        );
        let events = SseDecoder::decode_all(raw);
        assert_eq!(events.len(), 2);
        assert_eq!(
            events[0].data,
            "{\"type\":\"server.connected\",\"properties\":{}}"
        );
        let connected = bus_from_sse(&events[0]).expect("json");
        assert_eq!(connected.event_type, "server.connected");
        let heartbeat = bus_from_sse(&events[1]).expect("json");
        assert!(is_heartbeat(&heartbeat));
    }

    #[test]
    fn concatenates_split_data_lines() {
        let raw = concat!(
            "data: {\"type\":\"server.connected\",\n",
            "data: \"properties\":{}}\n",
            "\n",
        );
        let events = SseDecoder::decode_all(raw);
        assert_eq!(events.len(), 1);
        let bus = bus_from_sse(&events[0]).expect("json");
        assert_eq!(bus.event_type, "server.connected");
    }

    #[test]
    fn does_not_json_parse_data_prefix() {
        let prefixed = "data: {\"type\":\"x\"}";
        assert!(serde_json::from_str::<serde_json::Value>(prefixed).is_err());
        let events = SseDecoder::decode_all("data: {\"type\":\"x\",\"properties\":{}}\n\n");
        assert_eq!(events[0].data, "{\"type\":\"x\",\"properties\":{}}");
        assert_eq!(bus_from_sse(&events[0]).expect("json").event_type, "x");
    }

    #[test]
    fn fixture_sse_yields_one_envelope_per_event() {
        let raw = include_str!("testdata/sse-turn.sse");
        let events = SseDecoder::decode_all(raw);
        let bus: Vec<BusEvent> = events.iter().filter_map(bus_from_sse).collect();
        assert!(bus.iter().any(|item| item.event_type == "server.connected"));
        assert!(bus.iter().any(|item| item.event_type == "server.heartbeat"));
        assert!(bus
            .iter()
            .any(|item| item.event_type == "message.part.delta"));
        assert!(bus.iter().any(|item| item.event_type == "permission.asked"));
        assert!(bus.iter().any(|item| item.event_type == "session.idle"));
        assert!(bus.iter().any(|item| item.event_type == "vendor.mystery"));
    }
}
