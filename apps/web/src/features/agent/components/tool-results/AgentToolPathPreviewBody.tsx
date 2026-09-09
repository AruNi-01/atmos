"use client";

import React, { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { composerFileUrlFromPath } from "@/features/agent/lib/agent-composer-attachment";
import { resolveAgentChatPreviewPath } from "@/features/agent/lib/agent-chat-file-links";
import {
  isImageToolPath,
  languageFromPath,
} from "@/features/agent/lib/tool-results/parse-tool-result";
import { ImagePreviewOverlay } from "@/shared/components/image-preview-overlay";
import { isBrowserPreviewableImageMediaType } from "@/shared/lib/composer-image";
import { getRuntimeApiConfig, httpBase } from "@/shared/lib/desktop-runtime";
import { useAgentChatCwd, useAgentChatPathRoots } from "../agent-chat-cwd-context";
import { AgentToolCodePreview } from "./AgentToolCodePreview";
import { AgentToolEmptyBody } from "./AgentToolBodies";

const PREVIEW_MAX_CHARS = 512 * 1024;

function looksBinary(text: string): boolean {
  const sample = text.slice(0, 4096);
  let nul = 0;
  for (let i = 0; i < sample.length; i += 1) {
    if (sample.charCodeAt(i) === 0) nul += 1;
  }
  return nul > 0;
}

/**
 * When a Read tool result has a path but no usable embedded content, load the
 * local file via /api/system/file — including absolute paths outside the
 * current workspace. Image files render a compact thumbnail (click to enlarge).
 *
 * Write/Edit results must not use this path: they prefer patch/diff bodies when
 * available, and must not fetch the whole file as the primary preview.
 *
 * Text files (including `.md`) always use the code preview — never Markdown
 * document preview. PlanDocument / permission plan cards own that affordance.
 */
export function AgentToolPathPreviewBody({
  path,
  status,
}: {
  path: string;
  status?: string;
}) {
  const t = useTranslations("Agent.components.toolResults");
  const cwd = useAgentChatCwd();
  const roots = useAgentChatPathRoots();
  const absolute = resolveAgentChatPreviewPath(path, cwd, roots);
  const alt = (absolute || path).split(/[\\/]/).filter(Boolean).pop() || path;
  const [preview, setPreview] = useState<{ src: string; alt: string } | null>(null);
  const [state, setState] = useState<
    | { kind: "loading" }
    | { kind: "text"; text: string; language: string }
    | { kind: "image"; url: string }
    | { kind: "missing" }
  >({ kind: "loading" });

  useEffect(() => {
    if (!absolute) {
      setState({ kind: "missing" });
      return;
    }
    let cancelled = false;
    setState({ kind: "loading" });
    void (async () => {
      try {
        const cfg = await getRuntimeApiConfig();
        const base = httpBase(cfg);
        if (!base) {
          if (!cancelled) setState({ kind: "missing" });
          return;
        }
        const url = composerFileUrlFromPath(absolute, base, cfg.token);
        if (isImageToolPath(absolute)) {
          if (!cancelled) setState({ kind: "image", url });
          return;
        }
        const response = await fetch(url);
        if (!response.ok) {
          if (!cancelled) setState({ kind: "missing" });
          return;
        }
        const contentType = (response.headers.get("content-type") || "").toLowerCase();
        if (isBrowserPreviewableImageMediaType(contentType)) {
          if (!cancelled) setState({ kind: "image", url });
          return;
        }
        const text = await response.text();
        if (cancelled) return;
        if (looksBinary(text)) {
          setState({ kind: "missing" });
          return;
        }
        const clipped = text.length > PREVIEW_MAX_CHARS
          ? `${text.slice(0, PREVIEW_MAX_CHARS)}\n\n…`
          : text;
        setState({
          kind: "text",
          text: clipped,
          language: languageFromPath(absolute),
        });
      } catch {
        if (!cancelled) setState({ kind: "missing" });
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [absolute]);

  if (!absolute || state.kind === "missing") {
    return <AgentToolEmptyBody status={status} />;
  }
  if (state.kind === "loading") {
    return (
      <p className="px-3 py-2 text-xs text-muted-foreground">{t("processing")}</p>
    );
  }
  if (state.kind === "image") {
    return (
      <>
        <button
          type="button"
          className="block cursor-zoom-in leading-none"
          aria-label={t("imagePreview")}
          onClick={() => setPreview({ src: state.url, alt })}
        >
          {/* eslint-disable-next-line @next/next/no-img-element -- absolute path preview via system file proxy */}
          <img
            src={state.url}
            alt={alt}
            draggable={false}
            className="block max-h-32 max-w-56 object-contain"
            onError={() => setState({ kind: "missing" })}
          />
        </button>
        {preview ? (
          <ImagePreviewOverlay
            src={preview.src}
            alt={preview.alt}
            onClose={() => setPreview(null)}
          />
        ) : null}
      </>
    );
  }
  return <AgentToolCodePreview code={state.text} language={state.language} />;
}
