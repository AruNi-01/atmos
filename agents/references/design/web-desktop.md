# Web And Desktop Design

Web and Tauri Desktop use the dense Atmos app shell. They are optimized for long-running development work, multiple panes, terminal sessions, files, Git state, reviews, previews, and agents.

## Shell Model

Web/Desktop uses:

- Header for global status and high-frequency actions.
- Left Sidebar for project and workspace organization.
- Center Stage for the active work surface.
- Right Sidebar for contextual inspection and action.
- Settings modal for configuration.
- Full-surface tools for terminal, editor, diff, preview, and canvas.

## Header

The header is a compact control strip. It carries navigation, sidebar toggles, workspace identity, quick open, Git branch context, PR context, usage, settings, remote access, global search, and agent chat.

Rules:

- Keep header height at 48px.
- Use icon buttons with tooltips for high-frequency actions.
- Show keyboard hints for global actions.
- Keep status inline where possible.
- Do not use the header for marketing or large branding.

## Sidebars

Left Sidebar owns selection and organization. Right Sidebar owns inspection and action.

Rules:

- Keep sidebar lists dense and scannable.
- Use metadata chips, status dots, labels, and small icons rather than large visual cards.
- Support resize and collapse without destroying context.
- Do not duplicate left and right sidebar responsibilities unless a user preference explicitly places a surface on either side.

## Center Stage

Center Stage is where work happens.

Rules:

- Terminal, editor, diff, review, preview, wiki, and canvas surfaces should feel like real tools.
- Do not put educational copy, marketing content, or decorative feature blocks in the main work surface.
- Preserve open tabs and layout state when technically reasonable.
- Use URL state for refresh-safe tab and modal state when appropriate.

## Tool Surfaces

Terminal, editor, diff, preview, and canvas must remain full-surface.

Rules:

- Do not wrap them in decorative cards.
- Keep toolbar chrome compact.
- Keep scrollbars subtle.
- Use color only for meaningful state.
- Keep agent indicators visible but secondary to the tool.

