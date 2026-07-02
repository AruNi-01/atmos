---
name: atmos-specs-view
description: This skill should be used when the user asks for "specs-view", "spec visualization", "visual HTML for BRAINSTORM/PRD/TECH/TEST", "interactive spec review", or a "specs dashboard". It generates a local, single-file interactive HTML view for one Atmos spec file, one full spec, or a current-session/user-specified specs dashboard. It outputs `index.html` plus `metadata.json` under `.atmos/specs/views/` and never scans the whole `specs/` tree unless the user explicitly names the target specs.
user-invokable: true
args:
  - name: spec_id
    description: Optional spec identifier, e.g. `APP-013` or `APP-013_project-level-review-session`. Required for single-spec or single-file mode unless the current session clearly names one spec.
    required: false
  - name: file
    description: Optional one-file view target. Must be one of `BRAINSTORM.md`, `PRD.md`, `TECH.md`, or `TEST.md`.
    required: false
  - name: mode
    description: "Optional output mode: `single-file`, `single-spec`, or `session-dashboard`. Default is `single-spec` when one spec is identified, otherwise `session-dashboard` for the current session's explicitly referenced specs."
    required: false
  - name: style
    description: Optional design reference name matching a file in `references/`, e.g. `cursor`, `claude`, `vercel`, `linear`, `notion`, or `apple`. If omitted, ask the user to choose.
    required: false
---

# Atmos Specs · View

Generate a local visual workbench for Atmos specs. The output is a static, double-clickable HTML file with interactive review controls and a copyable prompt that sends the user's decisions back to an agent.

The view is not a marketing page and not a decorative summary. Its main job is to **preserve the actual content inside the target spec documents while transforming that content into clearer structured, visual HTML** so the user can inspect, review, comment, and send concrete decisions back to an agent.

## What this skill owns

- **Owns**: generated view artifacts under `.atmos/specs/views/<view-id>/`.
- **Writes**:
  - `index.html` — a single self-contained HTML document. Inline all generated CSS and JS. CDN dependencies are allowed.
  - `metadata.json` — source path, mode, style, generated timestamp, input file hashes/sizes when easy to compute, and spec ids included.
- **Does not own**: editing `specs/**/BRAINSTORM.md`, `PRD.md`, `TECH.md`, `TEST.md`, production code, or skill references.

## Language

- Generate the visible HTML UI, explanations, labels, empty states, copy buttons, review prompts, and metadata-facing titles in the user's conversation language.
- Preserve the original spec Markdown content exactly as written. Atmos spec files are normally English; do not translate source Markdown unless the user explicitly asks.
- If the conversation mixes languages, use the language of the latest user request for generated UI chrome.
- Before writing HTML, create a `ui` label dictionary in the data payload. Use it for every visible string that is not source Markdown or a source identifier. This includes headings, table headers, button labels, placeholders, empty states, toast text, copy prompt section headings, hero eyebrow text, mode/style labels, aria labels, and metadata-facing labels.
- Allow source identifiers to remain unchanged when they are meaningful file/spec terms: `APP-013`, `BRAINSTORM.md`, `PRD.md`, `TECH.md`, `TEST.md`, source paths, requirement IDs, scenario IDs, crate/app paths, and quoted source text.
- Do not leave hardcoded English chrome such as `single-spec view`, `Claude style`, `PRD Must Have`, `Scenario`, `Transport`, `Risks`, `Manual smoke queue`, `Per-file decisions`, or `Open questions` in a Chinese UI. Put these phrases in `ui` and localize them.

## Target resolution

1. Read `specs/AGENTS.md`.
2. Resolve targets only from:
   - `spec_id` / `file` args,
   - the user's explicit message,
   - specs clearly discussed in the current session.
3. Do **not** build a dashboard for every directory under `./specs/` by default.
4. If the user says "all specs" ambiguously, ask whether they mean current-session specs or an explicit list. Do not assume the whole repository.
5. If a partial id is provided (`APP-013`), resolve it to the matching directory under `specs/<ZONE>/`.

## Modes

### `single-file`

Use when `file` is set. Read exactly one of `BRAINSTORM.md`, `PRD.md`, `TECH.md`, `TEST.md`.

Recommended page structure:
- Compact header: spec id, file type, source path, generated time.
- Structured extraction for that file type, using the rules in **Content extraction contract** below.
- Source document viewer: rendered Markdown + raw Markdown toggle.
- Review rail: comments, accept/change/needs-answer decisions per extracted section.
- Copy prompt: generated from the user's per-section review notes.

Template: `assets/single-file-template.html`.

### `single-spec`

Use when one spec is selected and no specific file is requested. Read all four standard files.

Recommended page structure:
- Compact header: spec id, title, lifecycle status, source path, generated time.
- First viewport workbench: sticky top header, needs-attention summary, and structured visual panels derived from the spec contents. The main page should read like a better HTML representation of the specs, not like a Markdown reader.
- Structured overview built from the real spec contents: decisions, requirements, architecture, test coverage, risks, unresolved questions.
- Source document dialog: `BRAINSTORM.md`, `PRD.md`, `TECH.md`, `TEST.md`, each rendered from the embedded original Markdown and available as raw Markdown for verification.
- Cross-file consistency checks: PRD Must Haves covered by TECH and TEST, unresolved BRAINSTORM forks resolved/deferred, TECH rollout covered by TEST scenarios.
- Review dialog: per-file and overall comments opened from the sticky top header.
- Copy prompt: grouped by target file so the next agent can update the right spec doc.

Template: `assets/single-spec-template.html`.

### `session-dashboard`

Use when the current conversation or the user explicitly names multiple specs. This is **not** the entire `./specs/` directory.

Recommended page structure:
- Compact header: session/spec set title and included target count.
- Spec cards for only the included specs.
- Comparison panels built from actual extracted fields: lifecycle state, unresolved questions, missing required sections, PRD→TECH→TEST alignment, implementation readiness.
- Review rail: per-spec comments and priority.
- Copy prompt: "For these selected specs, apply the following decisions..." grouped by spec id.

Template: `assets/session-dashboard-template.html`.

## Design style workflow

1. List available design references in `references/*.md`.
2. If `style` was not supplied, ask the user to choose exactly one style. Use `AskQuestion` when available.
3. Read the chosen reference file before generating HTML.
4. Translate the chosen reference into concrete CSS tokens and layout decisions at generation time.
5. Do not copy large chunks of the reference into the HTML. Apply the style; do not quote the reference.
6. Treat design references as skins, not information architecture. A marketing-style reference such as Apple must not create a huge landing-page hero that hides the document and review controls. Specs-view is a workbench first.

Known references currently include:
- `references/apple-design.md`
- `references/claude-design.md`
- `references/cursor-design.md`
- `references/linear-design.md`
- `references/notion-design.md`
- `references/vercel-design.md`

## HTML constraints

- Output must be exactly one `.html` file for the page: no local CSS, JS, images, or generated asset files.
- The page must work when opened directly from Finder with `file://`.
- Store user comments/decisions in `localStorage` keyed by a stable `view_id` / source path key. Do **not** include `generated_at` in the key; regenerating the same view should preserve the user's previous notes unless the user clears them.
- Use `assets/interaction-script-template.js` as the default interaction script. Keep its payload id (`spec-view-data`), action names, decision model, and storage key scheme unless a template genuinely cannot use them. If a custom script is unavoidable, document the reason in a short HTML comment and preserve the same data model.
- Include a "Copy Agent Prompt" action that serializes all decisions and notes into clipboard text.
- Include a "Copy JSON" action for machine-readable feedback.
- Include the original spec Markdown documents in the HTML payload, but keep them out of the main content flow. Users must be able to open a modal `<dialog id="source-dialog">`, choose each included document (`BRAINSTORM.md`, `PRD.md`, `TECH.md`, `TEST.md`, or the single requested file), and switch between rendered Markdown and raw Markdown source.
- Use `markdown-it` from `https://cdn.jsdelivr.net/npm/markdown-it` to render the source Markdown client-side.
- Avoid executing untrusted HTML from specs. Render Markdown with a client-side Markdown library and sanitize/escape where practical.
- Use semantic, accessible controls: buttons, labels, textareas, focus states, keyboard-friendly tabs.
- Put primary controls in a compact sticky top header: open source dialog, open review dialog, copy agent prompt, and copy JSON. Use `position: sticky; top: 0; z-index` plus a solid or blurred background so controls stay available without covering content.
- Render review controls in a modal `<dialog id="review-dialog">`, not a sticky side rail. The dialog must have a visible title, close button, scrollable body, and accessible labels. Do not allow the review surface to obscure the document while closed.
- Render original Markdown in a modal `<dialog id="source-dialog">`, not as the primary page body. The dialog must have document tabs, rendered/raw toggle, copy active Markdown, close button, and a scrollable body.

## Markdown rendering requirements

The rendered Markdown must be readable before any decorative styling:

- Separate inline code and block code styles. Inline code may use a subtle tinted background, but `pre code` must reset that background.
- Always include this equivalent reset:
  ```css
  .markdown pre code {
    background: transparent;
    color: inherit;
    border-radius: 0;
    padding: 0;
    font-size: inherit;
  }
  ```
- Code blocks must have sufficient contrast in both light and dark visual themes. Do not render light text on pale inline-code backgrounds inside `pre`.
- Preserve whitespace and horizontal scrolling for diagrams and code:
  ```css
  .markdown pre {
    overflow-x: auto;
    white-space: pre;
  }
  ```
- Tables must be horizontally scrollable on narrow screens.
- Long paths, inline code, and links should wrap safely outside code blocks; code blocks should scroll instead of wrapping diagrams into unreadable shapes.

## Mermaid rendering requirements

- Include `https://cdn.jsdelivr.net/npm/mermaid/dist/mermaid.min.js` when the page contains Mermaid diagrams.
- Initialize Mermaid after the page loads:
  ```js
  mermaid.initialize({
    startOnLoad: false,
    securityLevel: "strict",
    theme: "default"
  });
  ```
- For dark visual themes, use Mermaid's `"dark"` theme or explicit theme variables with sufficient contrast.
- Render generated diagrams into dedicated containers such as:
  ```html
  <div class="mermaid">flowchart TD
    A[PRD Must Have] --> B[TECH module]
  </div>
  ```
- If Mermaid rendering fails, show the diagram source as readable code instead of leaving a blank panel.
- Do not execute arbitrary HTML from Markdown to render diagrams. Only pass agent-generated Mermaid source strings into Mermaid.

## Required information architecture

The page must be useful within the first viewport:

- Keep the top header compact. It should not exceed roughly 25vh on desktop or 30vh on mobile.
- Keep source and review controls reachable without long scrolling through header buttons. Do not place the raw source document viewer inline in the main page.
- For `single-spec`, use this order by default: sticky compact header → compact needs-attention band → cross-file checks → PRD requirements → BRAINSTORM decisions/options → TECH architecture/diagrams → TEST coverage. Keep source Markdown and review controls in dialogs opened from the header.
- Primary actions are: inspect structured spec content, view original source on demand, record review decisions, copy agent prompt. Decorative metrics are secondary.
- Do not use a generic four-card stats grid unless each card changes the user's decision. Prefer "Ready / Needs attention / Open questions / Next action" over vanity counts.
- Always include a visible "what needs attention" panel for unresolved risks, open questions, or manual verification.

## Content extraction contract

The generated view must be grounded in the actual spec files. Do not write generic product copy such as "4/4 documents exist" unless it is paired with concrete extracted content.

Treat generation as **content-preserving transformation**, not summarization:

- Preserve the substance of the target Markdown files in the main visual HTML. Convert Markdown sections into cards, tables, matrices, timelines, diagrams, checklists, callouts, and source-linked panels.
- Keep all meaningful IDs, headings, requirement titles, scenario titles, decisions, risks, open questions, rollout steps, acceptance criteria, out-of-scope items, and manual verification steps visible somewhere in the structured HTML.
- Condense only repetitive prose, boilerplate, or duplicated explanations. If condensation is necessary, keep the exact source-backed claim and cite the source heading.
- Separate synthesized interpretation from source content. Label generated synthesis as readiness, alignment, needs-attention, or next-actions; do not let synthesis replace the source-derived sections.
- Do not hide important source content exclusively in the source Markdown dialog. The dialog is for auditability and exact wording; the main page should still carry the spec's actual information in a more usable visual form.
- Prefer "restructure and visualize" over "summarize". A reader should be able to understand the spec from the HTML page without opening the Markdown dialog, then use the dialog to verify exact wording.

For every extracted item, keep a trace back to its source document and heading (for example `PRD.md > Functional Requirements > Must Have`). When space allows, show the source label in the UI.

### BRAINSTORM.md extraction

Extract and display:

- **Context / trigger**: what problem or observation started the spec.
- **Goals draft**: primary, secondary, non-goal if present.
- **Options**: each option with pros, cons, unknowns.
- **Key forks**: resolved vs still open. Preserve the actual fork names.
- **Open questions**: checked vs unchecked if task-list syntax is used.
- **Ready to promote**: PRD candidates and TECH candidates.

Useful UI shape:
- option comparison cards/table,
- fork status board,
- open-question checklist.

### PRD.md extraction

Extract and display:

- **Problem / why now / related specs** from Context.
- **Goals** and explicit **Out of Scope**.
- **Users & Scenarios** and User Stories.
- **Must Have** items with IDs (`M1`, `M2`, ...), exact titles, and summaries.
- **Nice to Have** items with IDs (`N1`, ...).
- **Success Metrics** and whether any metric is still placeholder/TBD.
- **Risks & Open Questions**.
- **Milestones**.

Useful UI shape:
- requirements table grouped by Must Have / Nice to Have,
- user scenario cards,
- out-of-scope warnings,
- metric quality flags for placeholders like `TBD`, `X%`, "unknown".

### TECH.md extraction

Extract and display:

- **Scope summary** and which PRD items it claims to address.
- **Architecture overview** including diagrams/code blocks when present.
- **Module-by-module design** grouped by crate/app/package.
- **Data model** snippets.
- **Transport** decisions, especially WebSocket vs REST.
- **Security & permissions**.
- **Rollout plan** steps.
- **Risks & tradeoffs**.
- **Dependencies & compatibility**.
- **Open questions**.

Useful UI shape:
- layer map (`infra → core-service → api → web`, etc.),
- module change table,
- rollout checklist,
- risk/rollback panel,
- transport badge ("WS-first", "REST justified", "REST missing justification").

Mermaid guidance for TECH:
- Prefer Mermaid diagrams whenever they clarify architecture, dependency flow, rollout order, WebSocket message flow, data lifecycle, state transitions, or test coverage.
- Convert existing ASCII architecture diagrams into Mermaid when the mapping is straightforward, while also preserving the original Markdown in the source viewer.
- Good diagram types:
  - `flowchart TD` for architecture and request flow.
  - `sequenceDiagram` for WebSocket / agent / user interactions.
  - `stateDiagram-v2` for lifecycle/status transitions.
  - `erDiagram` for DB entities when TECH describes schema relationships.
  - `timeline` for rollout phases when order matters.
- Do not force a diagram for simple bullet lists. Use diagrams where they reduce cognitive load.
- Mermaid labels should use concise nouns from the spec, not invented marketing labels.

### TEST.md extraction

Extract and display:

- **Test strategy** by level.
- **Coverage map** linking PRD items to scenario IDs.
- **Scenarios** with ID, title, level, Given/When/Then, signals.
- **Performance/load budgets**.
- **Regression checklist**.
- **Acceptance criteria**.
- **Manual verification steps**.
- **Non-coverage**.
- **Coverage Status** if appended after implementation.

Useful UI shape:
- PRD requirement → TEST scenario matrix,
- automated vs manual scenario split,
- acceptance checklist,
- manual smoke queue.

### Cross-file synthesis

For `single-spec` and `session-dashboard`, derive these from the extracted content:

- **PRD → TECH alignment**: every PRD Must Have should be mentioned/addressed in TECH. Flag missing or ambiguous coverage.
- **PRD → TEST alignment**: every PRD Must Have should appear in TEST coverage map. Flag missing scenario coverage.
- **BRAINSTORM fork resolution**: resolved forks should be reflected in PRD or TECH; unresolved forks should appear as open questions.
- **TECH → TEST alignment**: rollout steps and risky modules should have corresponding test or manual verification coverage.
- **Implementation readiness**:
  - Ready: PRD scope is concrete, TECH has rollout, TEST has coverage.
  - Needs decision: unresolved PRD/TECH open questions block implementation.
  - Needs test plan: TEST missing coverage map/scenarios.
  - Needs tech: TECH missing architecture/rollout/data/transport.

Do not invent readiness. Explain it with extracted evidence.

## Content quality rules

- Avoid filler headings like "Spec at a glance" unless the section contains concrete extracted items.
- Avoid vanity metrics like `4/4 documents`, `12 scenarios`, or `WS` as standalone cards. If shown, they must link to actual extracted rows and user decisions.
- Do not paraphrase away important details. Keep exact IDs (`M1`, `S7`, `N2`) and exact names.
- Do not replace full spec substance with a short executive summary. The page may start with compact priorities, but the rest of the page must retain the document's requirements, design details, risks, and tests in structured form.
- Do not drop "less exciting" sections such as Out of Scope, Dependencies, Security, Non-coverage, Manual Verification, or Milestones. They are part of the spec and should be represented in an appropriate visual section when present.
- Do not say "ready" just because files exist. Read the contents and cite the evidence.
- If a section is missing or looks templated, show a clear missing-content warning.
- The original Markdown source dialog is required, but the main value of the page is the structured extraction, cross-file checks, diagrams, matrices, and other HTML views that preserve the spec content in a more usable form.

## JavaScript and JSON safety

- Never hand-write JavaScript string literals that contain generated text. Use `JSON.stringify(...)` semantics for generated strings, especially copy prompts and Markdown payloads.
- Newlines inside generated JavaScript must be escaped (`"\\n"`) or produced from arrays joined at runtime. Never emit a raw newline inside a quoted JS string.
- When embedding JSON in `<script type="application/json">`, escape the substring `</script` as `<\/script` and escape U+2028/U+2029 if present.
- Prefer one `const data = JSON.parse(document.getElementById(...).textContent)` payload over many ad hoc inline variables.
- After writing `index.html`, open it and check the browser console. Fix any `SyntaxError`, missing CDN, or runtime error before reporting success.

## Required data model

Embed one JSON payload with this minimum shape. Add fields as needed, but keep these names stable:

```json
{
  "schema_version": 1,
  "view_id": "APP-013",
  "mode": "single-spec",
  "style": "cursor",
  "generated_at": "2026-05-09T07:30:00Z",
  "ui_language": "<latest-user-message-locale>",
  "ui": {
    "copyAgentPrompt": "<localized Copy Agent Prompt>",
    "copyJson": "<localized Copy JSON>",
    "rendered": "<localized Rendered>",
    "rawMarkdown": "<localized Raw Markdown>",
    "copyMarkdown": "<localized Copy Markdown>",
    "openSource": "<localized Open source>",
    "sourceDocuments": "<localized Source documents>",
    "openReview": "<localized Open review>",
    "close": "<localized Close>",
    "review": "<localized Review>",
    "overallNotes": "<localized Overall notes>",
    "unreviewed": "<localized Unreviewed>",
    "perFileDecisions": "<localized Per-file decisions>",
    "openQuestions": "<localized Open questions>",
    "attentionItems": "<localized View-highlighted attention items>",
    "path": "<localized Path>",
    "viewStyle": "<localized View style>",
    "spec": "<localized Spec>",
    "notes": "<localized Notes>",
    "noNotes": "<localized None>",
    "promptIntro": "<localized prompt intro>",
    "promptInstruction": "<localized prompt instruction>",
    "copiedMarkdown": "<localized Markdown copied>",
    "copiedAgentPrompt": "<localized Agent Prompt copied>",
    "copiedJson": "<localized JSON copied>",
    "fileNotesPlaceholder": "<localized notes placeholder containing {file}>"
  },
  "sources": [],
  "docs": {
    "BRAINSTORM.md": "# ..."
  },
  "synthesis": {
    "ready": [],
    "needs_attention": [],
    "open_questions": [],
    "next_actions": [],
    "cross_file_checks": [],
    "diagrams": []
  },
  "extracted": {
    "brainstorm": {
      "options": [],
      "forks": [],
      "open_questions": []
    },
    "prd": {
      "must_have": [],
      "nice_to_have": [],
      "out_of_scope": [],
      "success_metrics": []
    },
    "tech": {
      "modules": [],
      "rollout_steps": [],
      "risks": [],
      "open_questions": []
    },
    "test": {
      "coverage_map": [],
      "scenarios": [],
      "manual_steps": [],
      "acceptance_criteria": []
    }
  }
}
```

## Required interaction baseline

Every generated view must implement these interactions:

- Source dialog: header "open source" action opens `<dialog id="source-dialog">`; close button and Escape close it. The main page must remain a structured visual view, not an always-visible source viewer.
- Document switching: inside the source dialog, click a spec/file tab and update title, rendered Markdown, raw Markdown, active tab state, and copy target.
- Rendered/raw toggle: inside the source dialog, both modes must work for every document.
- Review dialog: header "open review" action opens `<dialog id="review-dialog">`; close button and Escape close it. The page remains readable when the dialog is closed.
- Review state: each included file/spec has radio decisions (`unreviewed`, `approved`, `needs-changes`, `needs-answer`, `ignore`) plus notes. Default to `unreviewed`; do not default to `needs-answer`, because an untouched file is not automatically a blocking question.
- Persistence: notes and decisions save to stable `localStorage` immediately and reload after refresh.
- Copy Agent Prompt: serializes spec id/path, decisions, notes, and overall notes in the user's language. Clearly mark untouched files as `unreviewed` or omit them from action-required sections; never imply the user requested changes for files they did not touch.
- Copy JSON: serializes the same feedback as machine-readable JSON.
- Copy Markdown: copies the currently active source Markdown from the source dialog.
- Toast/status: copy actions confirm success in the user's language.

Use event delegation where possible, and generate DOM from escaped values. Do not build controls from raw, unsanitized Markdown.


Allowed CDN dependencies:
- CSS: `https://cdn.tailwindcss.com`
- Icons: `https://unpkg.com/lucide@latest`
- Charts: `https://cdn.jsdelivr.net/npm/chart.js`, `https://cdn.jsdelivr.net/npm/echarts`
- Markdown: `https://cdn.jsdelivr.net/npm/marked`, `https://cdn.jsdelivr.net/npm/markdown-it`
- Diagrams: `https://cdn.jsdelivr.net/npm/mermaid/dist/mermaid.min.js`
- Utilities: `https://cdn.jsdelivr.net/npm/lodash`, `https://cdn.jsdelivr.net/npm/dayjs`
- Math: `https://cdn.jsdelivr.net/npm/mathjax`

## Output paths

Use these defaults:

- Single spec: `.atmos/specs/views/<spec-id>/index.html`
- Single file: `.atmos/specs/views/<spec-id>/index.html` with `metadata.json.file` set.
- Multi-spec session dashboard: `.atmos/specs/views/session-YYYYMMDD-HHMMSS/index.html`

Always write a sibling `metadata.json`:

```json
{
  "schema_version": 1,
  "view_id": "APP-013",
  "mode": "single-spec",
  "style": "cursor",
  "generated_at": "2026-05-09T07:30:00Z",
  "sources": [
    {
      "spec_id": "APP-013",
      "spec_path": "specs/APP/APP-013_project-level-review-session",
      "files": ["BRAINSTORM.md", "PRD.md", "TECH.md", "TEST.md"]
    }
  ]
}
```

## Generation workflow

1. Resolve mode and target specs.
2. Ask for design style if missing.
3. Read:
   - `specs/AGENTS.md`
   - target spec file(s)
   - chosen `references/<style>-design.md`
   - the matching template under `assets/`
   - `assets/interaction-script-template.js` unless you have a strong reason to write a custom script
4. Extract structure:
   - headings, checklists, Must Haves, Nice to Haves, open questions, risks, rollout steps, scenarios.
   - preserve the original Markdown payload in the HTML so the page can render tabs and copy source context.
5. Build the `ui` label dictionary and the JSON payload first.
6. Generate `index.html` from the template. Fill design CSS, safely escaped content JSON, and an inlined copy of `assets/interaction-script-template.js`. Treat custom JS as an exception, not the default.
7. Generate `metadata.json`.
8. Open the generated `index.html` in the user's default browser:
   - macOS: `open "<absolute-path-to-index.html>"`
   - Linux: `xdg-open "<absolute-path-to-index.html>"`
   - Windows: `start "" "<absolute-path-to-index.html>"`
9. If browser automation is available, verify:
   - the page title is correct,
   - no console errors are present,
   - document tabs switch,
   - rendered/raw Markdown toggle works,
   - source dialog opens and closes, and the source viewer is not visible in the main page by default,
   - review dialog opens and closes without covering the document while closed,
   - copy buttons show success.
   - review decisions persist after refresh.
   - generated UI chrome does not contain hardcoded labels in the wrong language.
10. If browser automation is unavailable, at minimum run a syntax check over the inline script by extracting it or opening the file manually. Do not report success after only writing the file.
11. Report the selected style and the full absolute path to `index.html` so the user can copy it directly.

## Common mistakes to avoid

- Building a repo-wide specs browser when the user asked for the current session's specs.
- Writing generated artifacts into `specs/`.
- Creating multiple JS/CSS files next to `index.html`.
- Letting style references override usability. The page is a review tool first.
- Omitting copyable feedback. The whole point is to send decisions back to an agent.
- Forgetting to open the generated HTML in the default browser after generation.
- Hiding the original Markdown. The visual page complements the source docs; it must not replace them.
- Trusting visual first paint without checking console errors. Static hero content can render even when the interaction script is broken.
- Letting the design reference turn the view into a marketing page. A specs view is a review tool; beauty supports scanning and decision-making.
- Mixing UI languages because template labels stayed in English. All generated chrome should come from the `ui` dictionary.
- Reordering the page so the source Markdown viewer appears after every extracted panel.
- Rendering the original Markdown viewer inline as the main page body. The HTML view should visualize the spec contents; source Markdown belongs in `source-dialog`.
- Reintroducing a sticky review rail that covers, overlaps, or squeezes source content. Use a dialog instead.
- Forking the interaction script and silently changing ids, localStorage keys, default review states, review dialog behavior, or copy prompt language.
