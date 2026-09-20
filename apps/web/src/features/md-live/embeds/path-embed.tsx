"use client";

import type { MdLiveEmbedViewProps } from "./types";
import { MdLiveEmbedChrome } from "./chrome";
import { MdLivePathIcon } from "./path-icon";
import { openMdLiveEmbed } from "./open-embed";
import { posixBasename } from "../lib/md-live-media-path";

export function PathMdLiveEmbed({ spec, selected }: MdLiveEmbedViewProps) {
  const isFolder = spec.kind === "folder";
  const path = spec.attrs.path || "";
  const title = spec.title || posixBasename(path) || spec.kind;
  return (
    <MdLiveEmbedChrome
      layout={spec.layout}
      selected={selected}
      icon={<MdLivePathIcon name={title} isDir={isFolder} />}
      title={title}
      subtitle={path || undefined}
      tooltip={path || title}
      canOpen={Boolean(path)}
      onOpen={() => openMdLiveEmbed(spec)}
    />
  );
}
