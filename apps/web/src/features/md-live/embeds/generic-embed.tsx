"use client";

import { Box } from "lucide-react";
import type { MdLiveEmbedViewProps } from "./types";
import { MdLiveEmbedChrome } from "./chrome";
import { openMdLiveEmbed } from "./open-embed";

function genericSubtitle(spec: MdLiveEmbedViewProps["spec"]): string {
  const bits = [spec.kind];
  const extra = Object.entries(spec.attrs)
    .filter(([key]) => key !== "kind" && key !== "layout")
    .slice(0, 3)
    .map(([key, value]) => `${key}=${value}`);
  bits.push(...extra);
  return bits.join(" · ");
}

export function GenericMdLiveEmbed({ spec, selected }: MdLiveEmbedViewProps) {
  const canOpen = Boolean(spec.attrs.url || spec.attrs.path);
  return (
    <MdLiveEmbedChrome
      layout={spec.layout}
      selected={selected}
      icon={<Box className="size-3.5 text-muted-foreground" />}
      title={spec.title || spec.kind}
      subtitle={genericSubtitle(spec)}
      tooltip={spec.attrs.path || spec.attrs.url || spec.kind}
      canOpen={canOpen}
      onOpen={() => openMdLiveEmbed(spec)}
    />
  );
}
