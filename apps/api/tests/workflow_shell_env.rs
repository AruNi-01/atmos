//! QUALITY-015: release sync scripts must not interpolate untrusted refs in `run:`.

use std::path::Path;

const HEAD_BRANCH_EXPR: &str = "${{ github.event.workflow_run.head_branch }}";
const RELEASE_TAG_EXPR: &str = "${{ github.event.inputs.release_tag }}";

fn workflow_text(name: &str) -> String {
    let path = Path::new(env!("CARGO_MANIFEST_DIR"))
        .join("../../.github/workflows")
        .join(name);
    std::fs::read_to_string(&path)
        .unwrap_or_else(|error| panic!("read {}: {error}", path.display()))
}

/// Concatenate `run: |` / `run: >` bodies. Job `if:` and step `env:` stay out.
fn run_bodies(yaml: &str) -> String {
    let mut bodies = String::new();
    let mut in_run = false;
    let mut run_indent = 0usize;
    for line in yaml.lines() {
        if in_run {
            let trimmed = line.trim_start();
            let indent = line.len() - trimmed.len();
            if trimmed.is_empty() || indent > run_indent {
                bodies.push_str(line);
                bodies.push('\n');
                continue;
            }
            in_run = false;
        }
        let trimmed = line.trim_start();
        let indent = line.len() - trimmed.len();
        if let Some(rest) = trimmed.strip_prefix("run:") {
            let rest = rest.trim();
            if matches!(rest, "|" | "|-" | ">" | ">-") {
                in_run = true;
                run_indent = indent;
            } else if !rest.is_empty() {
                bodies.push_str(rest);
                bodies.push('\n');
            }
        }
    }
    bodies
}

#[test]
fn release_workflows_pass_untrusted_refs_through_env() {
    for name in ["sync-homebrew-tap.yml", "sync-r2.yml"] {
        let yaml = workflow_text(name);
        let bodies = run_bodies(&yaml);
        for expression in [HEAD_BRANCH_EXPR, RELEASE_TAG_EXPR] {
            assert!(
                !bodies.contains(expression),
                "{name} run body still interpolates {expression}\n{bodies}"
            );
            assert!(
                yaml.contains(expression),
                "{name} no longer contains {expression}"
            );
        }
        assert!(
            yaml.contains(&format!("RELEASE_TAG_INPUT: {RELEASE_TAG_EXPR}")),
            "{name} env mapping for release_tag"
        );
        assert!(
            yaml.contains(&format!("WORKFLOW_HEAD_BRANCH: {HEAD_BRANCH_EXPR}")),
            "{name} env mapping for head_branch"
        );
        assert!(
            bodies.contains("\"$RELEASE_TAG_INPUT\""),
            "{name} shell does not read RELEASE_TAG_INPUT"
        );
        assert!(
            bodies.contains("\"$WORKFLOW_HEAD_BRANCH\""),
            "{name} shell does not read WORKFLOW_HEAD_BRANCH"
        );
        assert!(
            yaml.contains("github.event.workflow_run.head_branch"),
            "{name} job filter dropped head_branch"
        );
    }
}
