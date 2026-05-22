use std::path::Path;

use chrono::{Datelike, Timelike};
use infra::db::entities::{review_agent_run, review_revision, review_session};

use super::*;

fn installed_review_fix_skill_path() -> String {
    std::env::var("HOME")
        .map(|home| {
            Path::new(&home)
                .join(".atmos/skills/.system/atmos-review-fix/SKILL.md")
                .to_string_lossy()
                .to_string()
        })
        .or_else(|_| {
            std::env::var("USER").map(|user| {
                Path::new("/Users")
                    .join(user)
                    .join(".atmos/skills/.system/atmos-review-fix/SKILL.md")
                    .to_string_lossy()
                    .to_string()
            })
        })
        .unwrap_or_else(|_| "~/.atmos/skills/.system/atmos-review-fix/SKILL.md".to_string())
}

fn installed_code_review_skill_path(skill_id: &str) -> String {
    std::env::var("HOME")
        .map(|home| {
            Path::new(&home)
                .join(".atmos/skills/.system/code_review_skills")
                .join(skill_id)
                .to_string_lossy()
                .to_string()
        })
        .or_else(|_| {
            std::env::var("USER").map(|user| {
                Path::new("/Users")
                    .join(user)
                    .join(".atmos/skills/.system/code_review_skills")
                    .join(skill_id)
                    .to_string_lossy()
                    .to_string()
            })
        })
        .unwrap_or_else(|_| format!("~/.atmos/skills/.system/code_review_skills/{skill_id}"))
}

fn xml_escape(text: &str) -> String {
    text.replace('&', "&amp;")
        .replace('<', "&lt;")
        .replace('>', "&gt;")
        .replace('"', "&quot;")
        .replace('\'', "&apos;")
}

impl ReviewService {
    pub(super) fn render_fix_prompt(
        &self,
        session: &review_session::Model,
        run: &review_agent_run::Model,
        comments: &[ReviewCommentDto],
    ) -> Result<String> {
        let mut output = String::new();
        output.push_str("<review-fix-run>\n");
        output.push_str(&format!(
            "  <session guid=\"{}\" current_revision_guid=\"{}\" />\n",
            xml_escape(&session.guid),
            xml_escape(&session.current_revision_guid)
        ));
        output.push_str(&format!(
            "  <run guid=\"{}\" execution_mode=\"{}\" />\n",
            xml_escape(&run.guid),
            xml_escape(&run.execution_mode)
        ));
        for comment in comments {
            output.push_str(&format!(
                "  <comment guid=\"{}\" revision_guid=\"{}\" file_snapshot_guid=\"{}\">\n",
                xml_escape(&comment.model.guid),
                xml_escape(&comment.model.revision_guid),
                xml_escape(&comment.model.file_snapshot_guid)
            ));
            output.push_str(&format!(
                "    <anchor side=\"{}\" start_line=\"{}\" end_line=\"{}\" line_range_kind=\"{}\" />\n",
                xml_escape(&comment.model.anchor_side),
                comment.model.anchor_start_line,
                comment.model.anchor_end_line,
                xml_escape(&comment.model.anchor_line_range_kind)
            ));
            if let Some(message) = comment.messages.first() {
                output.push_str("    <comment>\n");
                output.push_str(&xml_escape(&message.body_full));
                output.push_str("\n    </comment>\n");
            }
            output.push_str("  </comment>\n");
        }
        output.push_str("</review-fix-run>\n\n");
        output.push_str("This is an Atmos Agent Review Fix run. Fix the code according to the user review comments above, but first verify that each reported issue exists and is reasonable; do not edit blindly.\n");
        output.push_str(&format!(
            "Before editing code, read and follow `{}`.\n",
            installed_review_fix_skill_path()
        ));
        Ok(output)
    }

    pub(super) fn render_review_prompt(
        &self,
        session: &review_session::Model,
        run: &review_agent_run::Model,
        base_revision: &review_revision::Model,
        all_comments: &[ReviewCommentDto],
    ) -> Result<String> {
        let mut output = String::new();
        output.push_str("<review-agent-run>\n");
        output.push_str(&format!(
            "  <session guid=\"{}\" current_revision_guid=\"{}\" />\n",
            xml_escape(&session.guid),
            xml_escape(&session.current_revision_guid)
        ));
        output.push_str(&format!(
            "  <run guid=\"{}\" run_kind=\"{}\" execution_mode=\"{}\" skill_id=\"{}\" />\n",
            xml_escape(&run.guid),
            xml_escape(&run.run_kind),
            xml_escape(&run.execution_mode),
            xml_escape(run.skill_id.as_deref().unwrap_or("default"))
        ));
        output.push_str(&format!(
            "  <base_revision guid=\"{}\" title=\"{}\" />\n",
            xml_escape(&base_revision.guid),
            xml_escape(base_revision.title.as_deref().unwrap_or("Untitled"))
        ));

        // Include existing comments in the prompt
        if !all_comments.is_empty() {
            output.push_str("  <existing_comments>\n");
            for comment in all_comments {
                output.push_str(&format!(
                    "    <comment guid=\"{}\" file_snapshot_guid=\"{}\">\n",
                    xml_escape(&comment.model.guid),
                    xml_escape(&comment.model.file_snapshot_guid)
                ));
                output.push_str(&format!(
                    "      <anchor side=\"{}\" start_line=\"{}\" end_line=\"{}\" />\n",
                    xml_escape(&comment.model.anchor_side),
                    comment.model.anchor_start_line,
                    comment.model.anchor_end_line
                ));
                if let Some(message) = comment.messages.first() {
                    output.push_str("      <comment>\n");
                    output.push_str(&xml_escape(&message.body_full));
                    output.push_str("\n      </comment>\n");
                }
                output.push_str("    </comment>\n");
            }
            output.push_str("  </existing_comments>\n");
        }

        output.push_str("</review-agent-run>\n\n");
        output.push_str("This is an Atmos Agent Review run. Analyze the code in the specified revision and identify issues, bugs, or improvements.\n");
        if let Some(skill_id) = &run.skill_id {
            output.push_str(&format!(
                "Before reviewing code, read and follow `{}`.\n",
                installed_code_review_skill_path(skill_id)
            ));
        }
        output.push_str("Use the `atmos review create-comment` CLI command to create inline comments for each issue you find.\n");
        if let Some(skill_id) = &run.skill_id {
            output.push_str(&format!("Use the {} skill for this review.\n", skill_id));
        }
        output.push_str("After completing the review, use `atmos review set-status --status succeeded --summary-stdin` to mark the run as complete.\n");

        // Generate report output path
        let repo_path = &session.repo_path;
        let context_id = session
            .workspace_guid
            .as_deref()
            .unwrap_or(&session.project_guid);
        let project_name = Path::new(repo_path)
            .file_name()
            .and_then(|name| name.to_str())
            .unwrap_or("project");
        let safe_project_name =
            project_name.replace(|c: char| !c.is_alphanumeric() && c != '_' && c != '-', "_");
        let branch_name = session.base_ref.as_deref().unwrap_or("unknown");
        let safe_branch_name =
            branch_name.replace(|c: char| !c.is_alphanumeric() && c != '_' && c != '-', "_");
        let now = chrono::Utc::now();
        let timestamp = format!(
            "{}{:02}{:02}-{:02}{:02}{:02}",
            now.year(),
            now.month(),
            now.day(),
            now.hour(),
            now.minute(),
            now.second()
        );
        let report_filename = format!(
            "{}_{}_{}_code_review.md",
            safe_project_name, safe_branch_name, timestamp
        );
        let report_path = format!(
            "{}/.atmos/reviews/{}/{}",
            repo_path, context_id, report_filename
        );

        output.push_str(&format!(
            "If the review skill writes a report to a Markdown file, write it to: {}\n",
            report_path
        ));
        output.push_str("Create parent directories if needed. Do not ask for confirmation before writing the file.\n");

        // Traceability metadata — when writing the report to the specified path,
        // the agent MUST start the file with this exact YAML frontmatter block so the
        // report can be traced back to the originating session and revision later.
        let generated_at = chrono::Utc::now().to_rfc3339();
        let frontmatter = format!(
            "---\natmos_review:\n  session_guid: \"{}\"\n  run_guid: \"{}\"\n  base_revision_guid: \"{}\"\n  current_revision_guid: \"{}\"\n  skill_id: \"{}\"\n  generated_at: \"{}\"\n---\n",
            session.guid,
            run.guid,
            base_revision.guid,
            session.current_revision_guid,
            run.skill_id.as_deref().unwrap_or("default"),
            generated_at,
        );
        output.push_str(
            "\nWhen writing the report, include the following YAML frontmatter block EXACTLY as shown, as the very first lines of the file (before any `#` heading or other content). Copy the block verbatim — do not modify, reformat, or omit any field:\n\n",
        );
        output.push_str(&frontmatter);
        output.push_str("\nThis frontmatter makes the report traceable back to this review session and revision so it can be looked up later.\n");

        Ok(output)
    }
}
