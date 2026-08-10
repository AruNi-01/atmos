/**
 * Minimal fatal-error UI for the desktop shell (boot / load failures).
 * data: URL so it works without Atmos Server or network.
 */

export type DesktopErrorView = {
  /** Short headline */
  title: string;
  /** One-line what happened */
  summary: string;
  /** Full diagnostics — may be long; rendered in a scrollable panel */
  details: string;
  /** Optional path hint (e.g. main log) */
  logPath?: string;
};

export function formatUnknownError(err: unknown): string {
  if (err instanceof Error) {
    const parts = [err.name ? `${err.name}: ${err.message}` : err.message];
    if (err.stack) parts.push("", err.stack);
    const cause = (err as Error & { cause?: unknown }).cause;
    if (cause != null) {
      parts.push("", "Caused by:", formatUnknownError(cause));
    }
    return parts.join("\n");
  }
  if (typeof err === "string") return err;
  try {
    return JSON.stringify(err, null, 2);
  } catch {
    return String(err);
  }
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/** Build self-contained HTML for the error surface. */
export function buildErrorPageHtml(view: DesktopErrorView): string {
  const title = escapeHtml(view.title);
  const summary = escapeHtml(view.summary);
  const details = escapeHtml(view.details);
  const logHint = view.logPath
    ? `<p class="log">Log: <code>${escapeHtml(view.logPath)}</code></p>`
    : "";

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8"/>
<meta name="viewport" content="width=device-width, initial-scale=1"/>
<title>${title} · Atmos</title>
<style>
  :root {
    color-scheme: dark;
    --bg: #06070b;
    --panel: #101218;
    --border: #252a36;
    --text: #e8eaef;
    --muted: #9aa3b5;
    --accent: #7c8cff;
    --danger: #f07178;
  }
  * { box-sizing: border-box; }
  html, body {
    margin: 0;
    height: 100%;
    background: var(--bg);
    color: var(--text);
    font: 14px/1.45 -apple-system, BlinkMacSystemFont, "Segoe UI", system-ui, sans-serif;
  }
  .wrap {
    min-height: 100%;
    display: flex;
    flex-direction: column;
    padding: 48px 28px 28px;
    max-width: 720px;
    margin: 0 auto;
  }
  h1 {
    margin: 0 0 8px;
    font-size: 18px;
    font-weight: 600;
    letter-spacing: -0.01em;
    color: var(--danger);
  }
  .summary {
    margin: 0 0 20px;
    color: var(--muted);
    font-size: 14px;
  }
  .panel {
    flex: 1;
    min-height: 180px;
    max-height: min(55vh, 480px);
    overflow: auto;
    background: var(--panel);
    border: 1px solid var(--border);
    border-radius: 10px;
    padding: 14px 16px;
    -webkit-overflow-scrolling: touch;
  }
  pre {
    margin: 0;
    white-space: pre-wrap;
    word-break: break-word;
    font: 12px/1.5 ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
    color: var(--text);
  }
  .log {
    margin: 16px 0 0;
    font-size: 12px;
    color: var(--muted);
  }
  code {
    font: 12px/1.4 ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
    color: var(--accent);
  }
  .hint {
    margin: 18px 0 0;
    font-size: 13px;
    color: var(--muted);
  }
</style>
</head>
<body>
  <div class="wrap">
    <h1>${title}</h1>
    <p class="summary">${summary}</p>
    <div class="panel" role="region" aria-label="Error details">
      <pre>${details}</pre>
    </div>
    ${logHint}
    <p class="hint">Quit Atmos, fix the issue above, then open the app again.</p>
  </div>
</body>
</html>`;
}

export function errorPageDataUrl(view: DesktopErrorView): string {
  return `data:text/html;charset=utf-8,${encodeURIComponent(buildErrorPageHtml(view))}`;
}
