use serde_json::{json, Value};

use crate::types::{
    BrowserBackendKind, BrowserResult, DEFAULT_SNAPSHOT_FORMAT, EMBEDDED_SNAPSHOT_FORMAT,
};

/// Agent-facing capability table. Honest about backends — never fakes semantic_v2.
pub fn capability_flags(backend: BrowserBackendKind) -> Value {
    match backend {
        BrowserBackendKind::Embedded => json!({
            "tabs": true,
            "query": true,
            "continuation": false,
            "upload": false,
            "press_key": true,
            "ensure_surface": true,
            "snapshot_format": EMBEDDED_SNAPSHOT_FORMAT,
        }),
        BrowserBackendKind::External => json!({
            "tabs": false,
            "query": true,
            "continuation": true,
            "upload": true,
            "press_key": false,
            "ensure_surface": false,
            "snapshot_format": DEFAULT_SNAPSHOT_FORMAT,
        }),
    }
}

fn snapshot_format_for(backend: BrowserBackendKind) -> &'static str {
    match backend {
        BrowserBackendKind::Embedded => EMBEDDED_SNAPSHOT_FORMAT,
        BrowserBackendKind::External => DEFAULT_SNAPSHOT_FORMAT,
    }
}

fn lift_elements_if_present(obj: &mut serde_json::Map<String, Value>) {
    if obj.contains_key("elements") {
        return;
    }
    if let Some(els) = obj
        .get("snapshot")
        .and_then(|s| s.get("elements"))
        .cloned()
        .or_else(|| obj.get("nodes").cloned())
    {
        obj.insert("elements".into(), els);
    }
}

fn is_snapshot_action(action: &str) -> bool {
    matches!(action, "state" | "prepare")
}

/// Flags on every success. Snapshot fields only on real `state` / `prepare`.
/// Never invent `elements: []` on click/tabs — that looks like an empty page.
pub fn fill_result_envelope(result: &mut BrowserResult, backend: BrowserBackendKind) {
    if !result.ok {
        return;
    }
    let flags = capability_flags(backend);
    result.capability_flags = Some(flags.clone());

    let Some(mut payload) = result.result.take() else {
        return;
    };
    if !payload.is_object() {
        payload = json!({ "value": payload });
    }
    let obj = payload.as_object_mut().expect("object payload");
    obj.insert("capability_flags".into(), flags);
    if is_snapshot_action(result.action.as_str()) {
        lift_elements_if_present(obj);
        if obj.contains_key("elements") {
            let count = obj
                .get("elements")
                .and_then(Value::as_array)
                .map(Vec::len)
                .unwrap_or(0);
            obj.entry("element_count").or_insert_with(|| json!(count));
            obj.entry("truncated").or_insert_with(|| json!(false));
            obj.entry("total_candidates")
                .or_insert_with(|| json!(count));
            obj.entry("snapshot_format")
                .or_insert_with(|| json!(snapshot_format_for(backend)));
        }
    }
    result.result = Some(payload);
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::types::BrowserResult;

    #[test]
    fn fills_missing_fields_on_embedded_and_external() {
        let mut embedded = BrowserResult {
            ok: true,
            action: "state".into(),
            backend: "embedded".into(),
            result: Some(json!({ "target_id": "s1", "elements": [{"ref": "g1:e0"}] })),
            ..Default::default()
        };
        fill_result_envelope(&mut embedded, BrowserBackendKind::Embedded);
        let payload = embedded.result.as_ref().unwrap();
        assert_eq!(payload["truncated"], false);
        assert_eq!(payload["total_candidates"], 1);
        assert_eq!(payload["snapshot_format"], EMBEDDED_SNAPSHOT_FORMAT);
        assert_eq!(payload["capability_flags"]["tabs"], true);
        assert_eq!(payload["capability_flags"]["ensure_surface"], true);
        assert_eq!(payload["capability_flags"]["continuation"], false);
        assert!(embedded.capability_flags.is_some());

        let mut external = BrowserResult {
            ok: true,
            action: "state".into(),
            backend: "external".into(),
            result: Some(json!({ "snapshot": { "elements": [{"ref": "p1:0"}, {"ref": "p1:1"}] } })),
            ..Default::default()
        };
        fill_result_envelope(&mut external, BrowserBackendKind::External);
        let payload = external.result.as_ref().unwrap();
        assert_eq!(payload["elements"].as_array().unwrap().len(), 2);
        assert_eq!(payload["total_candidates"], 2);
        assert_eq!(payload["capability_flags"]["upload"], true);
        assert_eq!(payload["capability_flags"]["tabs"], false);
        assert_eq!(payload["capability_flags"]["ensure_surface"], false);
        assert_eq!(payload["snapshot_format"], DEFAULT_SNAPSHOT_FORMAT);
    }

    #[test]
    fn skips_failures() {
        let mut fail = BrowserResult::fail("state", "embedded", "invalid_args", "nope");
        fill_result_envelope(&mut fail, BrowserBackendKind::Embedded);
        assert!(fail.capability_flags.is_none());
        assert!(fail.result.is_none());
    }

    #[test]
    fn does_not_invent_elements_on_click() {
        let mut click = BrowserResult {
            ok: true,
            action: "click".into(),
            backend: "embedded".into(),
            result: Some(json!({ "target_id": "s1", "x": 10, "y": 20 })),
            ..Default::default()
        };
        fill_result_envelope(&mut click, BrowserBackendKind::Embedded);
        let payload = click.result.as_ref().unwrap();
        assert!(payload.get("elements").is_none());
        assert!(payload.get("snapshot_format").is_none());
        assert_eq!(payload["capability_flags"]["tabs"], true);
        assert!(click.capability_flags.is_some());
    }
}
