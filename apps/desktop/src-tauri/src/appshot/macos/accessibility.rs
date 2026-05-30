use core::ffi::c_int;
use core_foundation::array::CFArray;
use core_foundation::base::{CFType, CFTypeRef, TCFType};
use core_foundation::string::{CFString, CFStringRef};
use core_foundation::url::CFURL;
use std::collections::VecDeque;
use std::ptr;
use std::time::{Duration, Instant};

type AXError = i32;

const AX_ERROR_SUCCESS: AXError = 0;
const TEXT_PREVIEW_LIMIT_CHARS: usize = 260;
const AX_ROLE_ATTRIBUTE: &str = "AXRole";
const AX_ROLE_DESCRIPTION_ATTRIBUTE: &str = "AXRoleDescription";
const AX_TITLE_ATTRIBUTE: &str = "AXTitle";
const AX_DESCRIPTION_ATTRIBUTE: &str = "AXDescription";
const AX_VALUE_ATTRIBUTE: &str = "AXValue";
const AX_HELP_ATTRIBUTE: &str = "AXHelp";
const AX_PLACEHOLDER_VALUE_ATTRIBUTE: &str = "AXPlaceholderValue";
const AX_URL_ATTRIBUTE: &str = "AXURL";
const AX_FOCUSED_WINDOW_ATTRIBUTE: &str = "AXFocusedWindow";
const AX_WINDOWS_ATTRIBUTE: &str = "AXWindows";
const AX_CHILDREN_ATTRIBUTE: &str = "AXChildren";
const AX_MESSAGE_TIMEOUT_SECONDS: f32 = 0.8;
const AGGREGATE_TEXT_LIMIT_CHARS: usize = 180;

#[link(name = "ApplicationServices", kind = "framework")]
extern "C" {
    fn AXUIElementCreateApplication(pid: c_int) -> CFTypeRef;
    fn AXUIElementCopyAttributeValue(
        element: CFTypeRef,
        attribute: CFStringRef,
        value: *mut CFTypeRef,
    ) -> AXError;
    fn AXUIElementSetMessagingTimeout(element: CFTypeRef, timeout: f32) -> AXError;
}

pub(super) struct AccessibilityCaptureConfig {
    pub(super) timeout: Duration,
    pub(super) node_limit: usize,
    pub(super) depth_limit: usize,
    pub(super) child_limit: usize,
    pub(super) byte_limit: usize,
    pub(super) redaction_terms: &'static [&'static str],
}

struct QueueItem {
    element: CFType,
    depth: usize,
    display_depth: usize,
    path: Vec<usize>,
}

struct DumpNode {
    path: Vec<usize>,
    line: String,
}

#[derive(Default)]
struct CaptureLimits {
    hit_node_limit: bool,
    hit_depth_limit: bool,
    hit_child_limit: bool,
    hit_timeout: bool,
    hit_byte_limit: bool,
}

struct AttributeNames {
    role: CFString,
    role_description: CFString,
    title: CFString,
    description: CFString,
    value: CFString,
    help: CFString,
    placeholder: CFString,
    url: CFString,
    focused_window: CFString,
    windows: CFString,
    children: CFString,
}

impl AttributeNames {
    fn new() -> Self {
        Self {
            role: CFString::new(AX_ROLE_ATTRIBUTE),
            role_description: CFString::new(AX_ROLE_DESCRIPTION_ATTRIBUTE),
            title: CFString::new(AX_TITLE_ATTRIBUTE),
            description: CFString::new(AX_DESCRIPTION_ATTRIBUTE),
            value: CFString::new(AX_VALUE_ATTRIBUTE),
            help: CFString::new(AX_HELP_ATTRIBUTE),
            placeholder: CFString::new(AX_PLACEHOLDER_VALUE_ATTRIBUTE),
            url: CFString::new(AX_URL_ATTRIBUTE),
            focused_window: CFString::new(AX_FOCUSED_WINDOW_ATTRIBUTE),
            windows: CFString::new(AX_WINDOWS_ATTRIBUTE),
            children: CFString::new(AX_CHILDREN_ATTRIBUTE),
        }
    }
}

pub(super) fn capture_accessibility_tree(
    process_id: Option<u32>,
    app_name: &str,
    config: AccessibilityCaptureConfig,
) -> Result<String, String> {
    let process_id = process_id
        .and_then(|pid| c_int::try_from(pid).ok())
        .ok_or_else(|| "Accessibility tree requires a target process id.".to_string())?;
    let app = create_application_element(process_id)?;
    set_messaging_timeout(&app);
    let attrs = AttributeNames::new();
    let root = focused_window(&app, &attrs).unwrap_or_else(|| app.clone());
    set_messaging_timeout(&root);
    let mut queue = VecDeque::from([QueueItem {
        element: root,
        depth: 0,
        display_depth: 0,
        path: vec![0],
    }]);
    let started_at = Instant::now();
    let mut nodes = Vec::new();
    let mut visited_nodes = 0usize;
    let mut approx_bytes = 0usize;
    let mut limits = CaptureLimits::default();

    while let Some(item) = queue.pop_front() {
        if started_at.elapsed() >= config.timeout {
            limits.hit_timeout = true;
            break;
        }
        if visited_nodes >= config.node_limit {
            limits.hit_node_limit = true;
            break;
        }
        if approx_bytes >= config.byte_limit {
            limits.hit_byte_limit = true;
            break;
        }

        visited_nodes += 1;
        let line = describe_element(&item.element, item.display_depth, &attrs, &config);
        let emitted = line.is_some();
        if let Some(line) = line {
            approx_bytes = approx_bytes.saturating_add(line.len() + 1);
            nodes.push(DumpNode {
                path: item.path.clone(),
                line,
            });
        }

        if item.depth >= config.depth_limit {
            limits.hit_depth_limit = true;
            continue;
        }

        let mut children = child_elements(&item.element, &attrs);
        if children.len() > config.child_limit {
            children.truncate(config.child_limit);
            limits.hit_child_limit = true;
            nodes.push(DumpNode {
                path: truncated_child_path(&item.path),
                line: format!(
                    "{}[truncated: child limit reached]",
                    indent(item.display_depth + usize::from(emitted))
                ),
            });
        }

        let child_display_depth = item.display_depth + usize::from(emitted);
        for (index, child) in children.into_iter().enumerate() {
            let mut path = item.path.clone();
            path.push(index);
            queue.push_back(QueueItem {
                element: child,
                depth: item.depth + 1,
                display_depth: child_display_depth,
                path,
            });
        }
    }

    nodes.sort_by(|left, right| left.path.cmp(&right.path));
    let mut out = String::new();
    out.push_str(&format!(
        "App: {app_name}. Capture: native macOS Accessibility compact tree.\n"
    ));
    for node in nodes {
        out.push_str(&node.line);
        out.push('\n');
    }
    append_limit_notes(&mut out, &limits, &config);
    Ok(truncate_context_with_marker(
        &out,
        config.byte_limit,
        "[truncated: accessibility context byte limit reached]",
    ))
}

fn create_application_element(process_id: c_int) -> Result<CFType, String> {
    let raw = unsafe { AXUIElementCreateApplication(process_id) };
    if raw.is_null() {
        return Err(format!(
            "native Accessibility could not create app element for process {process_id}."
        ));
    }
    Ok(unsafe { CFType::wrap_under_create_rule(raw) })
}

fn focused_window(app: &CFType, attrs: &AttributeNames) -> Option<CFType> {
    copy_attribute(app, &attrs.focused_window).or_else(|| {
        copy_attribute(app, &attrs.windows)
            .and_then(|value| value.downcast::<CFArray>())
            .and_then(|windows| {
                windows
                    .get_all_values()
                    .into_iter()
                    .find(|raw| !raw.is_null())
                    .map(|raw| unsafe { CFType::wrap_under_get_rule(raw as CFTypeRef) })
            })
    })
}

fn child_elements(element: &CFType, attrs: &AttributeNames) -> Vec<CFType> {
    let Some(children) =
        copy_attribute(element, &attrs.children).and_then(|value| value.downcast::<CFArray>())
    else {
        return Vec::new();
    };

    children
        .get_all_values()
        .into_iter()
        .filter(|raw| !raw.is_null())
        .map(|raw| {
            let child = unsafe { CFType::wrap_under_get_rule(raw as CFTypeRef) };
            set_messaging_timeout(&child);
            child
        })
        .collect()
}

fn describe_element(
    element: &CFType,
    display_depth: usize,
    attrs: &AttributeNames,
    config: &AccessibilityCaptureConfig,
) -> Option<String> {
    let role = text_attribute(element, &attrs.role);
    let role_description = text_attribute(element, &attrs.role_description);
    let title = text_attribute(element, &attrs.title);
    let description = text_attribute(element, &attrs.description);
    let value = text_attribute(element, &attrs.value);
    let help = text_attribute(element, &attrs.help);
    let placeholder = text_attribute(element, &attrs.placeholder);
    let url = text_attribute(element, &attrs.url);
    let should_redact = [
        &role,
        &role_description,
        &title,
        &description,
        &value,
        &help,
    ]
    .into_iter()
    .flatten()
    .any(|text| contains_redaction_term(text, config.redaction_terms));

    let role_text = role.as_deref().unwrap_or("");
    let role_label = display_role(role_text, role_description.as_deref());
    let mut line = format!("{}{}", indent(display_depth), role_label);

    if should_redact {
        line.push_str(" [redacted]");
        return Some(line);
    }

    let is_structural = is_structural_role(role_text);
    let mut existing = vec![role_label];
    let mut field_count = 0usize;
    field_count += usize::from(append_text_field(
        &mut line,
        &mut existing,
        "Title",
        title,
        is_structural,
    ));
    field_count += usize::from(append_text_field(
        &mut line,
        &mut existing,
        "Description",
        description,
        is_structural,
    ));
    field_count += usize::from(append_text_field(
        &mut line,
        &mut existing,
        "Value",
        value,
        is_structural,
    ));
    field_count += usize::from(append_text_field(
        &mut line,
        &mut existing,
        "Placeholder",
        placeholder,
        is_structural,
    ));
    field_count += usize::from(append_text_field(
        &mut line,
        &mut existing,
        "Help",
        help,
        is_structural,
    ));
    field_count += usize::from(append_text_field(
        &mut line,
        &mut existing,
        "URL",
        url,
        false,
    ));
    if field_count == 0 {
        None
    } else {
        Some(line)
    }
}

fn copy_attribute(element: &CFType, attribute: &CFString) -> Option<CFType> {
    let mut raw: CFTypeRef = ptr::null();
    let error = unsafe {
        AXUIElementCopyAttributeValue(
            element.as_CFTypeRef(),
            attribute.as_concrete_TypeRef(),
            &mut raw,
        )
    };
    if error == AX_ERROR_SUCCESS && !raw.is_null() {
        Some(unsafe { CFType::wrap_under_create_rule(raw) })
    } else {
        None
    }
}

fn set_messaging_timeout(element: &CFType) {
    let _ = unsafe {
        AXUIElementSetMessagingTimeout(element.as_CFTypeRef(), AX_MESSAGE_TIMEOUT_SECONDS)
    };
}

fn text_attribute(element: &CFType, attribute: &CFString) -> Option<String> {
    copy_attribute(element, attribute).and_then(|value| cf_type_to_text(&value))
}

fn cf_type_to_text(value: &CFType) -> Option<String> {
    if let Some(text) = value.downcast::<CFString>() {
        return clean_text(text.to_string());
    }
    if let Some(url) = value.downcast::<CFURL>() {
        return clean_text(url.get_string().to_string());
    }
    None
}

fn clean_text(value: String) -> Option<String> {
    let mut normalized = value.split_whitespace().collect::<Vec<_>>().join(" ");
    if normalized.is_empty() {
        return None;
    }
    if normalized.chars().count() > TEXT_PREVIEW_LIMIT_CHARS {
        normalized = normalized
            .chars()
            .take(TEXT_PREVIEW_LIMIT_CHARS)
            .collect::<String>();
        normalized.push_str("...");
    }
    Some(normalized)
}

fn contains_redaction_term(value: &str, terms: &[&str]) -> bool {
    let value = value.to_lowercase();
    terms
        .iter()
        .any(|term| value.contains(&term.to_lowercase()))
}

fn display_role(role: &str, role_description: Option<&str>) -> String {
    if let Some(role_description) = role_description.filter(|value| is_useful_text(value)) {
        return role_description.to_string();
    }
    role.strip_prefix("AX").unwrap_or(role).to_string()
}

fn append_text_field(
    line: &mut String,
    existing: &mut Vec<String>,
    label: &str,
    value: Option<String>,
    is_structural: bool,
) -> bool {
    let Some(value) = value else {
        return false;
    };
    if !is_useful_text(&value) || existing.iter().any(|item| text_overlaps(item, &value)) {
        return false;
    }
    if is_structural && is_aggregate_text(&value) {
        return false;
    }
    line.push(' ');
    line.push_str(label);
    line.push_str(": ");
    line.push_str(&value);
    existing.push(value);
    true
}

fn truncated_child_path(path: &[usize]) -> Vec<usize> {
    let mut path = path.to_vec();
    path.push(usize::MAX);
    path
}

fn text_overlaps(existing: &str, candidate: &str) -> bool {
    let existing = normalize_for_dedupe(existing);
    let candidate = normalize_for_dedupe(candidate);
    if existing == candidate {
        return true;
    }
    if candidate.chars().count() < 40 && existing.contains(&candidate) {
        return true;
    }
    false
}

fn normalize_for_dedupe(value: &str) -> String {
    value
        .split_whitespace()
        .collect::<Vec<_>>()
        .join(" ")
        .trim_matches(|ch: char| !ch.is_alphanumeric())
        .to_lowercase()
}

fn is_useful_text(value: &str) -> bool {
    let value = value.trim();
    if value.is_empty() {
        return false;
    }
    if value.chars().count() == 1 && !value.chars().any(char::is_alphanumeric) {
        return false;
    }
    if matches!(value, "(" | ")" | "/" | "|" | "·" | "•") {
        return false;
    }
    true
}

fn is_aggregate_text(value: &str) -> bool {
    value.chars().count() > AGGREGATE_TEXT_LIMIT_CHARS
}

fn is_structural_role(role: &str) -> bool {
    matches!(
        role,
        "AXApplication"
            | "AXWindow"
            | "AXGroup"
            | "AXScrollArea"
            | "AXList"
            | "AXTable"
            | "AXRow"
            | "AXCell"
            | "AXColumn"
            | "AXLayoutArea"
            | "AXLayoutItem"
            | "AXToolbar"
            | "AXSplitter"
            | "AXUnknown"
    )
}

fn indent(depth: usize) -> String {
    "\t".repeat(depth)
}

fn append_limit_notes(
    out: &mut String,
    limits: &CaptureLimits,
    config: &AccessibilityCaptureConfig,
) {
    let mut notes = Vec::new();
    if limits.hit_node_limit {
        notes.push(format!("node limit reached ({})", config.node_limit));
    }
    if limits.hit_depth_limit {
        notes.push(format!("depth limit reached ({})", config.depth_limit));
    }
    if limits.hit_child_limit {
        notes.push(format!(
            "child limit reached ({} per element)",
            config.child_limit
        ));
    }
    if limits.hit_timeout {
        notes.push(format!(
            "timeout reached ({} ms)",
            config.timeout.as_millis()
        ));
    }
    if limits.hit_byte_limit {
        notes.push(format!("byte limit reached ({})", config.byte_limit));
    }
    if notes.is_empty() {
        return;
    }
    out.push_str("\nCapture limits:\n");
    for note in notes {
        out.push_str("- ");
        out.push_str(&note);
        out.push('\n');
    }
}

fn truncate_context_with_marker(text: &str, limit: usize, marker: &str) -> String {
    if text.len() <= limit {
        return text.to_string();
    }
    let suffix = format!("\n\n{marker}\n");
    let body_limit = limit.saturating_sub(suffix.len());
    format!("{}{}", truncate_utf8(text, body_limit), suffix)
}

fn truncate_utf8(text: &str, limit: usize) -> String {
    if text.len() <= limit {
        return text.to_string();
    }
    let mut end = 0;
    for (idx, ch) in text.char_indices() {
        if idx + ch.len_utf8() > limit {
            break;
        }
        end = idx + ch.len_utf8();
    }
    format!("{}...", &text[..end])
}
