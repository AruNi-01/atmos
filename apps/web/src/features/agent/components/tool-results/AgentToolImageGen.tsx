"use client";

import React, { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { ImageIcon } from "lucide-react";
import {
  ImageGeneration,
  type ImageGenerationStatus,
} from "@workspace/ui";
import type { AgentToolCallPart } from "@/features/agent/lib/agent-tool-kind";
import { isActiveToolStatus } from "@/features/agent/lib/agent-tool-kind";
import { composerFileUrlFromPath } from "@/features/agent/lib/agent-composer-attachment";
import { getRuntimeApiConfig, httpBase } from "@/shared/lib/desktop-runtime";
import { AgentToolCard, AgentToolFileChip, type AgentToolSurface } from "./AgentToolCard";

type ImageRef = {
  url?: string | null;
  path?: string | null;
  mime?: string | null;
};

function aspectCss(ratio?: string | null): string | undefined {
  if (!ratio) return undefined;
  const trimmed = ratio.trim();
  if (!trimmed || trimmed === "auto") return undefined;
  const match = trimmed.match(/^(\d+)\s*[:/x×]\s*(\d+)$/i);
  if (match) return `${match[1]} / ${match[2]}`;
  return trimmed.includes("/") ? trimmed : undefined;
}

function resolutionLabel(size?: string | null, aspect?: string | null): string | undefined {
  if (size?.trim()) return size.trim();
  if (aspect?.trim() && aspect.trim() !== "auto") {
    return aspect.trim().replace(/[:/]/g, " × ");
  }
  return undefined;
}

function statusFromPart(part: AgentToolCallPart): ImageGenerationStatus {
  const status = (part.status ?? "").toLowerCase();
  if (status === "failed" || part.result?.type === "error") return "error";
  if (status === "completed") return "complete";
  if (status === "pending") return "queued";
  if (isActiveToolStatus(status)) return "generating";
  return "generating";
}

function imagesFromPart(part: AgentToolCallPart): ImageRef[] {
  if (part.result?.type === "images") return part.result.images;
  if (part.params?.type === "image_gen" && part.params.path) {
    return [{ path: part.params.path }];
  }
  return [];
}

function imageSrc(
  image: ImageRef,
  fileApi: { base: string; token?: string | null } | null,
): string | null {
  const url = image.url?.trim();
  if (url) {
    if (
      url.startsWith("http://")
      || url.startsWith("https://")
      || url.startsWith("data:image/")
    ) {
      return url;
    }
  }
  const path = image.path?.trim();
  if (path && fileApi) {
    return composerFileUrlFromPath(path, fileApi.base, fileApi.token);
  }
  return null;
}

export function AgentToolImageGen({
  part,
  surface = "card",
}: {
  part: AgentToolCallPart;
  surface?: AgentToolSurface;
}) {
  const t = useTranslations("Agent.components.toolResults");
  const [fileApi, setFileApi] = useState<{
    base: string;
    token?: string | null;
  } | null>(null);
  const prompt =
    part.params?.type === "image_gen" ? part.params.prompt.trim() : "";
  const aspect =
    part.params?.type === "image_gen" ? part.params.aspect_ratio : null;
  const size = part.params?.type === "image_gen" ? part.params.size : null;
  const status = statusFromPart(part);
  const images = imagesFromPart(part);
  const needsFileApi = images.some((image) => {
    const url = image.url?.trim() ?? "";
    if (url.startsWith("http://") || url.startsWith("https://") || url.startsWith("data:image/")) {
      return false;
    }
    return Boolean(image.path?.trim());
  });

  useEffect(() => {
    if (!needsFileApi) return;
    let cancelled = false;
    void getRuntimeApiConfig()
      .then((cfg) => {
        if (cancelled) return;
        const base = httpBase(cfg);
        if (!base) return;
        setFileApi({ base, token: cfg.token });
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [needsFileApi]);

  const title = (part.title || part.name || t("imageGen")).trim();
  const pathChip =
    part.params?.type === "image_gen" && part.params.path
      ? part.params.path
      : images.find((image) => image.path)?.path;

  return (
    <AgentToolCard
      variant="tool"
      surface={surface}
      body="plain"
      tone={status === "error" ? "error" : "default"}
      icon={<ImageIcon className="size-4" />}
      title={title}
      accessory={pathChip ? <AgentToolFileChip path={pathChip} /> : null}
      status={part.status ?? undefined}
    >
      <div className="flex flex-col gap-3 px-2 pb-2">
        {images.length === 0 ? (
          <ImageGeneration
            status={status}
            prompt={prompt || undefined}
            resolution={resolutionLabel(size, aspect)}
            aspectRatio={aspectCss(aspect) ?? "1 / 1"}
            size="fluid"
            showStatus
          />
        ) : (
          images.map((image, index) => {
            const src = imageSrc(image, fileApi);
            return (
              <ImageGeneration
                key={`${image.path ?? image.url ?? "img"}-${index}`}
                status={status === "complete" || src ? "complete" : status}
                prompt={prompt || undefined}
                resolution={resolutionLabel(size, aspect)}
                aspectRatio={aspectCss(aspect) ?? "1 / 1"}
                size="fluid"
                showStatus={status !== "complete"}
              >
                {src ? (
                  // eslint-disable-next-line @next/next/no-img-element -- tool result URLs / data / workspace file proxy
                  <img src={src} alt={prompt || title} />
                ) : null}
              </ImageGeneration>
            );
          })
        )}
      </div>
    </AgentToolCard>
  );
}
