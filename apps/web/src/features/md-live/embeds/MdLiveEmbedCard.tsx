"use client";

import { Button, cn } from "@workspace/ui";
import { parseMdLiveGithubTarget, type MdLiveEmbedSpec } from "@atmos/md-live";
import { mdLiveCopy } from "../lib/md-live-copy";
import { openMdLiveEmbed } from "./open-embed";

function subtitleFor(spec: MdLiveEmbedSpec): string {
  const github = parseMdLiveGithubTarget(spec);
  if (github) return `${github.owner}/${github.repo}#${github.number}`;
  return spec.attrs.url || spec.attrs.path || spec.kind;
}

export function MdLiveEmbedCard({
  spec,
}: {
  spec: MdLiveEmbedSpec;
}) {
  return (
    <div
      className={cn(
        "not-prose my-3 rounded-lg border border-border bg-card p-3 text-sm shadow-sm",
      )}
      data-md-live-embed={spec.kind}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="font-medium text-foreground truncate">{spec.title || spec.kind}</p>
          <p className="text-xs text-muted-foreground truncate">{subtitleFor(spec)}</p>
        </div>
        <Button
          type="button"
          size="sm"
          data-md-live-interactive="true"
          onClick={() => openMdLiveEmbed(spec)}
        >
          {mdLiveCopy("open")}
        </Button>
      </div>
    </div>
  );
}

export function MdLiveEmbedInline({
  spec,
}: {
  spec: MdLiveEmbedSpec;
}) {
  return (
    <button
      type="button"
      data-md-live-interactive="true"
      onClick={() => openMdLiveEmbed(spec)}
      className="rounded-md border border-border bg-muted/50 px-1.5 py-0.5 text-xs text-foreground hover:bg-muted"
    >
      {spec.title || spec.kind}
    </button>
  );
}
