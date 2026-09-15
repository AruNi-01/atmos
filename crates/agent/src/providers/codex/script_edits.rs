//! Best-effort file mutations hidden inside Codex `commandExecution` shell.
//!
//! Codex intercepts `apply_patch` into `fileChange` items, but Python
//! `Path(...).write_text` rewrites stay as shell. Recover those so the
//! transcript can show Edit/Delete cards and turn file-change chips.

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct InferredFileEdit {
    pub path: String,
    pub delete: bool,
    pub patch: Option<String>,
    pub new_content: Option<String>,
}

pub fn infer_script_edits(command: &str) -> Vec<InferredFileEdit> {
    let patches = parse_apply_patch(command);
    if !patches.is_empty() {
        return patches;
    }
    parse_python_path_edits(command)
}

fn parse_apply_patch(command: &str) -> Vec<InferredFileEdit> {
    let Some(start) = apply_patch_start(command) else {
        return Vec::new();
    };
    parse_apply_patch_lines(&command[start..])
}

fn apply_patch_start(command: &str) -> Option<usize> {
    command
        .find("*** Begin Patch")
        .or_else(|| line_start_find(command, "*** Update File:"))
        .or_else(|| line_start_find(command, "*** Add File:"))
        .or_else(|| line_start_find(command, "*** Delete File:"))
}

fn line_start_find(haystack: &str, needle: &str) -> Option<usize> {
    let mut search = 0;
    while let Some(pos) = haystack[search..].find(needle) {
        let abs = search + pos;
        if abs == 0 || haystack.as_bytes()[abs - 1] == b'\n' {
            return Some(abs);
        }
        search = abs + needle.len();
    }
    None
}

fn parse_apply_patch_lines(slice: &str) -> Vec<InferredFileEdit> {
    let mut edits = Vec::new();
    let mut current_path: Option<String> = None;
    let mut current_delete = false;
    let mut body = String::new();

    let flush =
        |edits: &mut Vec<InferredFileEdit>, path: Option<String>, delete: bool, body: String| {
            let Some(path) = path else {
                return;
            };
            let patch = if delete || body.trim().is_empty() {
                None
            } else if body.trim_start().starts_with("*** ") {
                Some(body)
            } else {
                Some(format!("*** Update File: {path}\n{body}"))
            };
            edits.push(InferredFileEdit {
                path,
                delete,
                patch,
                new_content: None,
            });
        };

    for line in slice.lines() {
        let trimmed = line.trim_start();
        if trimmed == "*** Begin Patch" {
            continue;
        }
        if trimmed == "*** End Patch" {
            flush(
                &mut edits,
                current_path.take(),
                current_delete,
                std::mem::take(&mut body),
            );
            break;
        }
        if let Some(path) = file_header_path(trimmed) {
            flush(
                &mut edits,
                current_path.take(),
                current_delete,
                std::mem::take(&mut body),
            );
            current_delete = trimmed.starts_with("*** Delete File:");
            current_path = Some(path);
            body = format!("{trimmed}\n");
            continue;
        }
        if current_path.is_some() {
            body.push_str(line);
            body.push('\n');
        }
    }
    flush(
        &mut edits,
        current_path.take(),
        current_delete,
        std::mem::take(&mut body),
    );
    edits
}

fn file_header_path(line: &str) -> Option<String> {
    line.strip_prefix("*** Update File: ")
        .or_else(|| line.strip_prefix("*** Add File: "))
        .or_else(|| line.strip_prefix("*** Delete File: "))
        .map(str::trim)
        .filter(|path| !path.is_empty())
        .map(str::to_string)
}

fn parse_python_path_edits(command: &str) -> Vec<InferredFileEdit> {
    let sources = python_sources(command);
    let mut edits = Vec::new();
    for source in sources {
        for edit in python_edits_from_source(&source) {
            if !edits
                .iter()
                .any(|existing: &InferredFileEdit| existing.path == edit.path)
            {
                edits.push(edit);
            }
        }
    }
    edits
}

fn python_sources(command: &str) -> Vec<String> {
    let mut sources = extract_python_heredocs(command);
    sources.extend(extract_python_dash_c(command));
    if sources.is_empty() && looks_like_python_path_write(command) {
        sources.push(command.to_string());
    }
    sources
}

fn looks_like_python_path_write(command: &str) -> bool {
    command.contains("Path(")
        && (command.contains(".write_text(")
            || command.contains(".write_bytes(")
            || command.contains(".unlink("))
}

fn extract_python_heredocs(command: &str) -> Vec<String> {
    let mut sources = Vec::new();
    let lower = command.to_ascii_lowercase();
    let mut search = 0;
    while let Some(rel) = lower[search..].find("python") {
        let start = search + rel;
        let Some(after_bin) = consume_python_bin(&command[start..]) else {
            search = start + 6;
            continue;
        };
        let rest = &command[start + after_bin..];
        // After optional shell quotes, look for `<< TAG`.
        let looking = rest.trim_start();
        let looking = looking.strip_prefix('"').unwrap_or(looking);
        let looking = looking.strip_prefix('\'').unwrap_or(looking);
        let looking = looking.trim_start();
        if !looking.starts_with("<<") {
            search = start + 6;
            continue;
        }
        if let Some(body) = heredoc_body(looking) {
            sources.push(body);
        }
        search = start + 6;
    }
    sources
}

fn consume_python_bin(s: &str) -> Option<usize> {
    let rest = if s.len() >= 6 && s[..6].eq_ignore_ascii_case("python") {
        &s[6..]
    } else {
        return None;
    };
    let mut i = 0;
    let bytes = rest.as_bytes();
    if i < bytes.len() && bytes[i] == b'3' {
        i += 1;
        if i < bytes.len() && bytes[i] == b'.' {
            i += 1;
            while i < bytes.len() && bytes[i].is_ascii_digit() {
                i += 1;
            }
        }
    }
    if i < rest.len() {
        let next = rest[i..].chars().next()?;
        if next.is_ascii_alphanumeric() || next == '_' {
            return None;
        }
    }
    Some(6 + i)
}

fn heredoc_body(from_ltlt: &str) -> Option<String> {
    let after = from_ltlt.strip_prefix("<<")?.trim_start();
    let (tag, after_tag) = heredoc_tag(after)?;
    let body_start = after_tag.strip_prefix('\r').unwrap_or(after_tag);
    let body_start = body_start.strip_prefix('\n')?;
    let terminator = format!("\n{tag}");
    let end = body_start
        .find(&terminator)
        .or_else(|| body_start.find(&format!("\r\n{tag}")))?;
    Some(body_start[..end].to_string())
}

fn heredoc_tag(s: &str) -> Option<(&str, &str)> {
    let s = s.trim_start();
    let quote = s.chars().next()?;
    if quote == '\'' || quote == '"' {
        let rest = &s[quote.len_utf8()..];
        let end = rest.find(quote)?;
        let tag = &rest[..end];
        if !is_heredoc_tag(tag) {
            return None;
        }
        Some((tag, &rest[end + quote.len_utf8()..]))
    } else {
        let end = s
            .find(|c: char| !(c.is_ascii_alphanumeric() || c == '_'))
            .unwrap_or(s.len());
        let tag = &s[..end];
        if !is_heredoc_tag(tag) {
            return None;
        }
        Some((tag, &s[end..]))
    }
}

fn is_heredoc_tag(tag: &str) -> bool {
    let mut chars = tag.chars();
    let Some(first) = chars.next() else {
        return false;
    };
    (first.is_ascii_alphabetic() || first == '_')
        && chars.all(|c| c.is_ascii_alphanumeric() || c == '_')
}

fn extract_python_dash_c(command: &str) -> Vec<String> {
    let mut sources = Vec::new();
    let lower = command.to_ascii_lowercase();
    let mut search = 0;
    while let Some(rel) = lower[search..].find("python") {
        let start = search + rel;
        let Some(after_bin) = consume_python_bin(&command[start..]) else {
            search = start + 6;
            continue;
        };
        let rest = command[start + after_bin..].trim_start();
        let rest = rest.strip_prefix('"').unwrap_or(rest);
        let rest = rest.strip_prefix('\'').unwrap_or(rest).trim_start();
        if let Some(code) = python_dash_c_code(rest) {
            sources.push(code);
        }
        search = start + 6;
    }
    sources
}

fn python_dash_c_code(s: &str) -> Option<String> {
    let mut rest = s;
    // Allow `-c` after other short flags: `python3 -c` or `python3 -uc`.
    loop {
        rest = rest.trim_start();
        if let Some(stripped) = rest.strip_prefix("-c") {
            let after = stripped.trim_start();
            return parse_shell_string(after).map(|(code, _)| code);
        }
        if rest.starts_with('-') {
            let end = rest.find(char::is_whitespace)?;
            let flags = &rest[..end];
            if flags.contains('c') {
                let after = rest[end..].trim_start();
                return parse_shell_string(after).map(|(code, _)| code);
            }
            rest = rest[end..].trim_start();
            continue;
        }
        return None;
    }
}

fn parse_shell_string(s: &str) -> Option<(String, usize)> {
    let mut chars = s.char_indices();
    let (start, quote) = chars.next()?;
    if quote != '\'' && quote != '"' {
        return None;
    }
    let mut out = String::new();
    let mut i = start + quote.len_utf8();
    while i < s.len() {
        let c = s[i..].chars().next()?;
        if c == '\\' && quote == '"' {
            let rest = &s[i + 1..];
            let next = rest.chars().next()?;
            match next {
                'n' => out.push('\n'),
                't' => out.push('\t'),
                'r' => out.push('\r'),
                '\\' | '"' | '\'' => out.push(next),
                _ => {
                    out.push('\\');
                    out.push(next);
                }
            }
            i += 1 + next.len_utf8();
            continue;
        }
        if c == quote {
            return Some((out, i + quote.len_utf8()));
        }
        out.push(c);
        i += c.len_utf8();
    }
    None
}

fn python_edits_from_source(source: &str) -> Vec<InferredFileEdit> {
    let paths = path_hits(source);
    if paths.is_empty() {
        return Vec::new();
    }
    let replaces = parse_str_replaces(source);
    let mut edits = Vec::new();
    for hit in &paths {
        let inline = method_after(source, hit.end, &["write_text", "write_bytes", "unlink"]);
        let via_var = hit.var.as_deref().is_some_and(|var| {
            contains_method_call(source, var, "write_text")
                || contains_method_call(source, var, "write_bytes")
                || contains_method_call(source, var, "unlink")
        });
        if !inline && !via_var {
            continue;
        }
        let delete = method_after(source, hit.end, &["unlink"])
            || hit
                .var
                .as_deref()
                .is_some_and(|var| contains_method_call(source, var, "unlink"));
        if delete {
            edits.push(InferredFileEdit {
                path: hit.path.clone(),
                delete: true,
                patch: None,
                new_content: None,
            });
            continue;
        }
        let write_arg = write_text_arg(source, hit);
        edits.push(InferredFileEdit {
            path: hit.path.clone(),
            delete: false,
            patch: None,
            new_content: write_arg,
        });
    }
    if edits.len() == 1
        && !edits[0].delete
        && edits[0].new_content.is_none()
        && !replaces.is_empty()
    {
        let path = edits[0].path.clone();
        edits[0].patch = Some(patch_from_replaces(&path, &replaces));
    }
    edits
}

#[derive(Debug)]
struct PathHit {
    path: String,
    end: usize,
    var: Option<String>,
}

fn path_hits(source: &str) -> Vec<PathHit> {
    let mut hits = Vec::new();
    let mut search = 0;
    while let Some(rel) = source[search..].find("Path(") {
        let abs = search + rel;
        if abs > 0 {
            let prev = source[..abs].chars().next_back().unwrap_or('\0');
            if is_ident_char(prev) {
                search = abs + 5;
                continue;
            }
        }
        let after = skip_ws(source, abs + 5);
        let Some((path, after_str)) = parse_python_string(source, after) else {
            search = abs + 5;
            continue;
        };
        let after_str = skip_ws(source, after_str);
        if !source[after_str..].starts_with(')') {
            search = abs + 5;
            continue;
        }
        let end = after_str + 1;
        let var = assignment_ident_before(source, abs);
        if !path.is_empty() {
            hits.push(PathHit { path, end, var });
        }
        search = end;
    }
    hits
}

fn assignment_ident_before(source: &str, path_start: usize) -> Option<String> {
    let before = source[..path_start].trim_end();
    let before = before.strip_suffix('=')?.trim_end();
    let ident = ident_at_end(before)?;
    Some(ident.to_string())
}

fn ident_at_end(s: &str) -> Option<&str> {
    let mut end = s.len();
    while end > 0 {
        let ch = s[..end].chars().next_back()?;
        if is_ident_char(ch) {
            end -= ch.len_utf8();
        } else {
            break;
        }
    }
    let ident = s[end..].trim_start();
    let mut chars = ident.chars();
    let first = chars.next()?;
    if first.is_ascii_digit() || !is_ident_char(first) {
        return None;
    }
    Some(ident)
}

fn is_ident_char(c: char) -> bool {
    c.is_ascii_alphanumeric() || c == '_'
}

fn skip_ws(s: &str, mut i: usize) -> usize {
    while i < s.len() {
        let ch = s[i..].chars().next().unwrap_or('\0');
        if ch.is_whitespace() {
            i += ch.len_utf8();
        } else {
            break;
        }
    }
    i
}

fn method_after(source: &str, end: usize, methods: &[&str]) -> bool {
    let rest = source[skip_ws(source, end)..].trim_start();
    methods
        .iter()
        .any(|method| rest.starts_with(&format!(".{method}(")))
}

fn contains_method_call(source: &str, var: &str, method: &str) -> bool {
    let needle = format!("{var}.{method}(");
    let mut search = 0;
    while let Some(rel) = source[search..].find(&needle) {
        let abs = search + rel;
        let ok = abs == 0
            || source[..abs]
                .chars()
                .next_back()
                .is_some_and(|c| !is_ident_char(c));
        if ok {
            return true;
        }
        search = abs + needle.len();
    }
    false
}

fn write_text_arg(source: &str, hit: &PathHit) -> Option<String> {
    if let Some(arg) = call_string_arg_after(source, hit.end, "write_text") {
        return Some(arg);
    }
    let var = hit.var.as_deref()?;
    let needle = format!("{var}.write_text(");
    let mut search = 0;
    while let Some(rel) = source[search..].find(&needle) {
        let abs = search + rel;
        let bound = abs == 0
            || source[..abs]
                .chars()
                .next_back()
                .is_some_and(|c| !is_ident_char(c));
        if bound {
            let after = skip_ws(source, abs + needle.len());
            if let Some((text, _)) = parse_python_string(source, after) {
                return Some(text);
            }
            return None;
        }
        search = abs + needle.len();
    }
    None
}

fn call_string_arg_after(source: &str, end: usize, method: &str) -> Option<String> {
    let rest_at = skip_ws(source, end);
    let prefix = format!(".{method}(");
    if !source[rest_at..].starts_with(&prefix) {
        return None;
    }
    let after = skip_ws(source, rest_at + prefix.len());
    parse_python_string(source, after).map(|(text, _)| text)
}

fn parse_str_replaces(source: &str) -> Vec<(String, String)> {
    let mut out = Vec::new();
    let mut search = 0;
    while let Some(rel) = source[search..].find(".replace(") {
        let abs = search + rel;
        let after = skip_ws(source, abs + ".replace(".len());
        let Some((old, after_old)) = parse_python_string(source, after) else {
            search = abs + 9;
            continue;
        };
        let after_old = skip_ws(source, after_old);
        if !source[after_old..].starts_with(',') {
            search = abs + 9;
            continue;
        }
        let after_comma = skip_ws(source, after_old + 1);
        let Some((new, _)) = parse_python_string(source, after_comma) else {
            search = abs + 9;
            continue;
        };
        if !old.is_empty() || !new.is_empty() {
            out.push((old, new));
        }
        search = abs + 9;
    }
    out
}

fn patch_from_replaces(path: &str, replaces: &[(String, String)]) -> String {
    let mut out = format!("*** Update File: {path}\n");
    for (old, new) in replaces {
        out.push_str("@@\n");
        for line in old.split('\n') {
            out.push('-');
            out.push_str(line);
            out.push('\n');
        }
        for line in new.split('\n') {
            out.push('+');
            out.push_str(line);
            out.push('\n');
        }
    }
    out
}

fn parse_python_string(source: &str, i: usize) -> Option<(String, usize)> {
    if i >= source.len() {
        return None;
    }
    let rest = &source[i..];
    let mut prefix_end = 0;
    let bytes = rest.as_bytes();
    while prefix_end < bytes.len()
        && matches!(
            bytes[prefix_end],
            b'r' | b'R' | b'b' | b'B' | b'u' | b'U' | b'f' | b'F'
        )
    {
        prefix_end += 1;
    }
    let prefix = rest[..prefix_end].to_ascii_lowercase();
    if prefix.contains('f') {
        return None;
    }
    let is_raw = prefix.contains('r');
    let after = &rest[prefix_end..];
    let (quote, qlen) = if after.starts_with("\"\"\"") {
        ("\"\"\"", 3)
    } else if after.starts_with("'''") {
        ("'''", 3)
    } else if after.starts_with('"') {
        ("\"", 1)
    } else if after.starts_with('\'') {
        ("'", 1)
    } else if after.starts_with("\\\"") {
        ("\"", 2)
    } else if after.starts_with("\\'") {
        ("'", 2)
    } else {
        return None;
    };
    let mut out = String::new();
    let mut j = i + prefix_end + qlen;
    let closer = if quote == "\"\"\"" || quote.starts_with('"') {
        if qlen == 3 {
            "\"\"\""
        } else {
            "\""
        }
    } else if qlen == 3 {
        "'''"
    } else {
        "'"
    };
    while j < source.len() {
        if !is_raw && source[j..].starts_with('\\') {
            let next = source[j + 1..].chars().next()?;
            match next {
                'n' => out.push('\n'),
                't' => out.push('\t'),
                'r' => out.push('\r'),
                '\\' | '"' | '\'' => out.push(next),
                '\n' => {}
                _ => {
                    out.push('\\');
                    out.push(next);
                }
            }
            j += 1 + next.len_utf8();
            continue;
        }
        if source[j..].starts_with(closer) {
            return Some((out, j + closer.len()));
        }
        // Allow shell-escaped closer `\"` / `\'` as the terminator too.
        if closer.len() == 1 && source[j..].starts_with('\\') && source[j + 1..].starts_with(closer)
        {
            return Some((out, j + 1 + closer.len()));
        }
        let ch = source[j..].chars().next()?;
        out.push(ch);
        j += ch.len_utf8();
    }
    None
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn python_heredoc_replace_becomes_update_patch() {
        let command = r#"/bin/zsh -lc "python3 << 'PY'
from pathlib import Path
p = Path("apps/web/src/features/agent/components/tool-results/AgentToolCard.tsx")
s = p.read_text()
s = s.replace("old title", "new title")
p.write_text(s)
print("updated AgentToolCard")
PY""#;
        let edits = infer_script_edits(command);
        assert_eq!(edits.len(), 1);
        assert_eq!(
            edits[0].path,
            "apps/web/src/features/agent/components/tool-results/AgentToolCard.tsx"
        );
        assert!(!edits[0].delete);
        let patch = edits[0].patch.as_deref().expect("patch");
        assert!(patch.contains("*** Update File:"));
        assert!(patch.contains("-old title"));
        assert!(patch.contains("+new title"));
    }

    #[test]
    fn python_write_text_literal_keeps_new_content() {
        let command = r#"python3 << 'PY'
from pathlib import Path
Path("tmp/hello.txt").write_text("hello\nworld")
PY"#;
        let edits = infer_script_edits(command);
        assert_eq!(edits.len(), 1);
        assert_eq!(edits[0].path, "tmp/hello.txt");
        assert_eq!(edits[0].new_content.as_deref(), Some("hello\nworld"));
    }

    #[test]
    fn python_unlink_is_delete() {
        let command = r#"python3 <<PY
from pathlib import Path
p = Path("tmp/gone.txt")
p.unlink()
PY"#;
        let edits = infer_script_edits(command);
        assert_eq!(edits.len(), 1);
        assert!(edits[0].delete);
        assert_eq!(edits[0].path, "tmp/gone.txt");
    }

    #[test]
    fn variable_replace_still_emits_path() {
        let command = r#"/bin/zsh -lc "python3 << 'PY'
from pathlib import Path
p = Path("apps/web/src/a.tsx")
s = p.read_text()
s = s.replace(old, new)
p.write_text(s)
PY""#;
        let edits = infer_script_edits(command);
        assert_eq!(edits.len(), 1);
        assert_eq!(edits[0].path, "apps/web/src/a.tsx");
        assert!(edits[0].patch.is_none());
        assert!(edits[0].new_content.is_none());
    }

    #[test]
    fn apply_patch_in_shell_splits_files() {
        let command = r#"apply_patch << 'PATCH'
*** Begin Patch
*** Update File: apps/web/src/a.ts
@@
-old
+new
*** Delete File: tmp/gone.txt
*** End Patch
PATCH"#;
        let edits = infer_script_edits(command);
        assert_eq!(edits.len(), 2);
        assert_eq!(edits[0].path, "apps/web/src/a.ts");
        assert!(edits[0].patch.as_deref().unwrap().contains("-old"));
        assert!(edits[1].delete);
        assert_eq!(edits[1].path, "tmp/gone.txt");
    }

    #[test]
    fn cargo_test_is_not_a_file_edit() {
        assert!(infer_script_edits("cargo test -p agent").is_empty());
    }
}
