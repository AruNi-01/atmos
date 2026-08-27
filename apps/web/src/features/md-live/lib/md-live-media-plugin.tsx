"use client";

import { $view } from "@milkdown/kit/utils";
import { imageSchema } from "@milkdown/kit/preset/commonmark";
import type { Node } from "@milkdown/kit/prose/model";
import { classifyMdLiveMedia } from "@atmos/md-live/ui";
import { getRuntimeApiConfig, httpBase } from "@/shared/lib/desktop-runtime";
import { documentDirectory, normalizeFsPath } from "./md-live-media-path";

function resolveAbsoluteMediaPath(src: string, documentPath: string, workspaceRoot: string | null): string | null {
  if (!src || src.startsWith("http://") || src.startsWith("https://") || src.startsWith("data:")) {
    return null;
  }
  const normalized = normalizeFsPath(src);
  if (normalized.startsWith("/")) return normalized;
  const fromDir = documentDirectory(documentPath, workspaceRoot);
  if (!fromDir) return workspaceRoot ? `${normalizeFsPath(workspaceRoot).replace(/\/$/, "")}/${normalized.replace(/^\.\//, "")}` : null;
  const joined = `${fromDir.replace(/\/$/, "")}/${normalized.replace(/^\.\//, "")}`;
  const parts: string[] = [];
  for (const part of joined.split("/")) {
    if (!part || part === ".") continue;
    if (part === "..") parts.pop();
    else parts.push(part);
  }
  const prefix = joined.startsWith("/") ? "/" : "";
  return `${prefix}${parts.join("/")}`;
}

async function mediaUrl(src: string, documentPath: string, workspaceRoot: string | null): Promise<string> {
  if (src.startsWith("http://") || src.startsWith("https://") || src.startsWith("data:")) return src;
  const abs = resolveAbsoluteMediaPath(src, documentPath, workspaceRoot);
  if (!abs) return src;
  const cfg = await getRuntimeApiConfig();
  const base = httpBase(cfg);
  if (!base) return src;
  const params = new URLSearchParams({ path: abs });
  if (cfg.token) params.set("token", cfg.token);
  return `${base}/api/system/file?${params.toString()}`;
}

function renderMedia(dom: HTMLElement, node: Node, src: string) {
  const kind = classifyMdLiveMedia(node.attrs.src || src);
  const alt = String(node.attrs.alt || node.attrs.title || posixName(node.attrs.src));
  dom.className = "md-live-media";
  dom.replaceChildren();
  if (kind === "video") {
    const video = document.createElement("video");
    video.controls = true;
    video.src = src;
    video.title = alt;
    dom.append(video);
    return;
  }
  if (kind === "audio") {
    const audio = document.createElement("audio");
    audio.controls = true;
    audio.src = src;
    audio.title = alt;
    dom.append(audio);
    return;
  }
  if (kind === "file") {
    const link = document.createElement("a");
    link.className = "md-live-media-file";
    link.href = src;
    link.target = "_blank";
    link.rel = "noreferrer";
    link.textContent = alt;
    dom.append(link);
    return;
  }
  const image = document.createElement("img");
  image.src = src;
  image.alt = alt;
  dom.append(image);
}

function posixName(path: string): string {
  return path.split("/").pop() || path;
}

export function mdLiveMediaViewPlugin(documentPath: string, workspaceRoot: string | null) {
  return $view(imageSchema.node, () => (node) => {
    const dom = document.createElement("span");
    dom.contentEditable = "false";
    let cancelled = false;
    const paint = (next: Node) => {
      const raw = String(next.attrs.src ?? "");
      void mediaUrl(raw, documentPath, workspaceRoot).then((url) => {
        if (cancelled) return;
        renderMedia(dom, next, url);
      });
    };
    paint(node);
    return {
      dom,
      update: (updated: Node) => {
        if (updated.type.name !== "image") return false;
        paint(updated);
        return true;
      },
      destroy: () => {
        cancelled = true;
      },
      ignoreMutation: () => true,
      stopEvent: (event: Event) => {
        const target = event.target as HTMLElement | null;
        return Boolean(target?.closest("a, video, audio"));
      },
    };
  });
}
