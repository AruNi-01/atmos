/**
 * Desktop Use **Inspect** — accessibility / UI structure tree.
 *
 * This is the primary agent-readable content for AppShot `context.md`.
 * Separate from Capture (pixels) and Control (input).
 *
 * Implementation: delegates to `atmos desktop-use inspect` (Rust AX, same
 * algorithm as the historical AppShot Tauri backend). Runs as a child of
 * Atmos Desktop so Accessibility TCC on the Desktop app is preferred when
 * the CLI is the same-process helper path; degraded warnings otherwise.
 */

import {
  buildAppshotContextMarkdownFromParts,
  type DesktopUseFrontmost,
} from "./context.js";
import { runDesktopUseJson } from "./client.js";

export type DesktopUseInspectJson = {
  ok: boolean;
  tree_markdown?: string;
  node_count_estimate?: number;
  quality?: string;
  warnings?: string[];
  error?: string | null;
};

export type DesktopUseInspectResult = {
  ok: boolean;
  treeMarkdown: string;
  nodeCountEstimate: number;
  quality: string;
  warnings: string[];
  error: string | null;
};

export async function desktopUseInspect(options: {
  processId: number;
  appName?: string | null;
}): Promise<DesktopUseInspectResult> {
  if (!options.processId || options.processId <= 0) {
    return {
      ok: false,
      treeMarkdown: "",
      nodeCountEstimate: 0,
      quality: "unavailable",
      warnings: ["inspect requires a process id"],
      error: "inspect requires a process id",
    };
  }

  try {
    const args = ["inspect", "--pid", String(options.processId)];
    if (options.appName) {
      args.push("--app-name", options.appName);
    }
    const raw = (await runDesktopUseJson(args, 8_000)) as DesktopUseInspectJson;
    return {
      ok: Boolean(raw.ok),
      treeMarkdown: raw.tree_markdown ?? "",
      nodeCountEstimate: raw.node_count_estimate ?? 0,
      quality: raw.quality ?? (raw.ok ? "accessibility" : "unavailable"),
      warnings: raw.warnings ?? [],
      error: raw.error ?? null,
    };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return {
      ok: false,
      treeMarkdown: "",
      nodeCountEstimate: 0,
      quality: "unavailable",
      warnings: [`inspect_failed: ${msg}`],
      error: msg,
    };
  }
}

/** Compose AppShot context.md from frontmost meta + inspect tree. */
export function composeAppshotContext(
  frontmost: DesktopUseFrontmost,
  inspect: DesktopUseInspectResult,
  extraWarnings: string[] = [],
): { contextMarkdown: string; quality: string; warnings: string[] } {
  const warnings = [...extraWarnings, ...inspect.warnings];
  if (inspect.error && !inspect.ok) {
    warnings.push(inspect.error);
  }
  const hasTree = Boolean(inspect.treeMarkdown.trim());
  // quality label is refined by caller once screenshot availability is known
  const quality = hasTree ? "accessibility" : "metadata_only";
  const contextMarkdown = buildAppshotContextMarkdownFromParts({
    frontmost,
    treeMarkdown: hasTree ? inspect.treeMarkdown : "Accessibility tree unavailable.",
    quality,
    warnings,
  });
  return { contextMarkdown, quality, warnings };
}
