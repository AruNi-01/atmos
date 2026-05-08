/**
 * Tests for parseReviewReportMetadata — the parser that pulls the atmos_review
 * traceability frontmatter out of an agent review report.
 */

// @ts-expect-error bun:test is available at runtime but not in tsconfig types
import { describe, it, expect } from "bun:test";
import { parseReviewReportMetadata } from "@/lib/review-report-frontmatter";

const CANONICAL_FRONTMATTER = `---
atmos_review:
  session_guid: "ses-aaaaaaaa-1111-2222-3333-444444444444"
  run_guid: "run-bbbbbbbb-1111-2222-3333-555555555555"
  base_revision_guid: "rev-cccccccc-1111-2222-3333-666666666666"
  current_revision_guid: "rev-dddddddd-1111-2222-3333-777777777777"
  skill_id: "fullstack-reviewer"
  generated_at: "2026-05-08T10:00:00+00:00"
---

# Code Review Report

Some body text.
`;

describe("parseReviewReportMetadata", () => {
  it("extracts every required field and strips the frontmatter from the body", () => {
    const { metadata, body } = parseReviewReportMetadata(CANONICAL_FRONTMATTER);

    expect(metadata).not.toBeNull();
    expect(metadata!.session_guid).toBe("ses-aaaaaaaa-1111-2222-3333-444444444444");
    expect(metadata!.run_guid).toBe("run-bbbbbbbb-1111-2222-3333-555555555555");
    expect(metadata!.base_revision_guid).toBe("rev-cccccccc-1111-2222-3333-666666666666");
    expect(metadata!.current_revision_guid).toBe("rev-dddddddd-1111-2222-3333-777777777777");
    expect(metadata!.skill_id).toBe("fullstack-reviewer");
    expect(metadata!.generated_at).toBe("2026-05-08T10:00:00+00:00");

    expect(body.trimStart().startsWith("# Code Review Report")).toBe(true);
    expect(body).not.toContain("atmos_review:");
    expect(body).not.toContain("---");
  });

  it("tolerates single-quoted and unquoted values", () => {
    const md = `---
atmos_review:
  session_guid: 'single-quoted'
  run_guid: unquoted-value
  base_revision_guid: "double-quoted"
  current_revision_guid: "rev-1"
  skill_id: "skill"
  generated_at: "2026-05-08T10:00:00Z"
---

body
`;
    const { metadata } = parseReviewReportMetadata(md);
    expect(metadata).not.toBeNull();
    expect(metadata!.session_guid).toBe("single-quoted");
    expect(metadata!.run_guid).toBe("unquoted-value");
    expect(metadata!.base_revision_guid).toBe("double-quoted");
  });

  it("returns null metadata and preserves original markdown when the block is missing", () => {
    const md = `---
title: User's own frontmatter
---

# Not an Atmos review report
`;
    const { metadata, body } = parseReviewReportMetadata(md);
    expect(metadata).toBeNull();
    expect(body).toBe(md);
  });

  it("returns null metadata and preserves original markdown when a required key is missing", () => {
    const md = `---
atmos_review:
  session_guid: "ses-1"
  run_guid: "run-1"
  base_revision_guid: "rev-1"
  current_revision_guid: "rev-1"
  skill_id: "skill"
---

body
`;
    const { metadata, body } = parseReviewReportMetadata(md);
    expect(metadata).toBeNull();
    expect(body).toBe(md);
  });

  it("returns null metadata when there is no frontmatter at all", () => {
    const md = "# Just a markdown file\n\nno frontmatter here\n";
    const { metadata, body } = parseReviewReportMetadata(md);
    expect(metadata).toBeNull();
    expect(body).toBe(md);
  });

  it("ignores sibling top-level keys that appear after the atmos_review block", () => {
    const md = `---
atmos_review:
  session_guid: "ses-1"
  run_guid: "run-1"
  base_revision_guid: "rev-1"
  current_revision_guid: "rev-1"
  skill_id: "skill"
  generated_at: "2026-05-08T10:00:00Z"
other_top_level: "should not leak"
---

body
`;
    const { metadata } = parseReviewReportMetadata(md);
    expect(metadata).not.toBeNull();
    expect(metadata!.session_guid).toBe("ses-1");
  });
});
