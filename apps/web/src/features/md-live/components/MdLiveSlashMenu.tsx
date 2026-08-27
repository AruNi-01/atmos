"use client";

import { useMemo, useState } from "react";
import { Button, Input, cn } from "@workspace/ui";
import {
  formatEmbedDirective,
  parseGithubResourceUrl,
} from "@atmos/md-live";
import { mdLiveCopy } from "../lib/md-live-copy";
import type { MdLiveBlockAction } from "../lib/md-live-editor-registry";

export type MdLiveSlashPick =
  | { kind: "block"; action: MdLiveBlockAction }
  | { kind: "markdown"; markdown: string };

type SlashItem = {
  id: string;
  label: string;
  keywords: string;
  pick: MdLiveSlashPick | { kind: "github" } | { kind: "file" };
};

const ITEMS: SlashItem[] = [
  { id: "h1", label: "slashHeading1", keywords: "heading 1 h1 title", pick: { kind: "block", action: { type: "heading", level: 1 } } },
  { id: "h2", label: "slashHeading2", keywords: "heading 2 h2 title", pick: { kind: "block", action: { type: "heading", level: 2 } } },
  { id: "h3", label: "slashHeading3", keywords: "heading 3 h3 title", pick: { kind: "block", action: { type: "heading", level: 3 } } },
  { id: "ul", label: "slashBulletList", keywords: "bullet list unordered", pick: { kind: "block", action: { type: "bullet-list" } } },
  { id: "ol", label: "slashOrderedList", keywords: "ordered numbered list", pick: { kind: "block", action: { type: "ordered-list" } } },
  { id: "quote", label: "slashQuote", keywords: "quote blockquote", pick: { kind: "block", action: { type: "quote" } } },
  { id: "code", label: "slashCode", keywords: "code fence block", pick: { kind: "block", action: { type: "code" } } },
  { id: "table", label: "slashTable", keywords: "table grid", pick: { kind: "block", action: { type: "table" } } },
  { id: "hr", label: "slashDivider", keywords: "divider hr rule", pick: { kind: "block", action: { type: "divider" } } },
  { id: "github", label: "slashGithubIssue", keywords: "github issue pr embed", pick: { kind: "github" } },
  { id: "file", label: "slashFile", keywords: "file embed path", pick: { kind: "file" } },
];

export function MdLiveSlashMenu({
  query,
  onPick,
}: {
  query: string;
  onPick: (pick: MdLiveSlashPick) => void;
}) {
  const [mode, setMode] = useState<"list" | "github" | "file">("list");
  const [value, setValue] = useState("");
  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return ITEMS;
    return ITEMS.filter((item) => item.keywords.includes(q) || mdLiveCopy(item.label).toLowerCase().includes(q));
  }, [query]);

  if (mode === "github" || mode === "file") {
    return (
      <div
        data-md-live-slash="form"
        className="w-64 rounded-md border border-border bg-popover p-2 text-sm shadow-md"
      >
        <p className="mb-1 text-xs text-muted-foreground">
          {mdLiveCopy(mode === "github" ? "slashGithubUrl" : "slashFilePath")}
        </p>
        <Input
          autoFocus
          value={value}
          onChange={(event) => setValue(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter") {
              event.preventDefault();
              submitInsert(mode, value, onPick);
            }
          }}
        />
        <div className="mt-2 flex justify-end gap-1">
          <Button type="button" size="sm" variant="ghost" onClick={() => setMode("list")}>
            {mdLiveCopy("cancel")}
          </Button>
          <Button type="button" size="sm" onClick={() => submitInsert(mode, value, onPick)}>
            {mdLiveCopy("slashInsert")}
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div
      data-md-live-slash="menu"
      className="min-w-48 overflow-hidden rounded-md border border-border bg-popover p-1 text-sm shadow-md"
    >
      {filtered.map((item) => (
        <button
          key={item.id}
          type="button"
          className={cn(
            "flex w-full rounded px-2 py-1.5 text-left text-foreground hover:bg-accent",
          )}
          onMouseDown={(event) => event.preventDefault()}
          onClick={() => {
            if (item.pick.kind === "github") {
              setMode("github");
              return;
            }
            if (item.pick.kind === "file") {
              setMode("file");
              return;
            }
            onPick(item.pick);
          }}
        >
          {mdLiveCopy(item.label)}
        </button>
      ))}
    </div>
  );
}

function submitInsert(
  mode: "github" | "file",
  raw: string,
  onPick: (pick: MdLiveSlashPick) => void,
): void {
  const value = raw.trim();
  if (!value) return;
  if (mode === "github") {
    const target = parseGithubResourceUrl(value);
    if (!target) return;
    onPick({
      kind: "markdown",
      markdown: formatEmbedDirective({
        kind: target.kind === "pr" ? "github-pr" : "github-issue",
        layout: "card",
        title: `GitHub #${target.number}`,
        attrs: {
          owner: target.owner,
          repo: target.repo,
          n: String(target.number),
          url: target.url,
        },
      }),
    });
    return;
  }
  const name = value.split("/").pop() || value;
  onPick({
    kind: "markdown",
    markdown: formatEmbedDirective({
      kind: "file",
      layout: "inline",
      title: name,
      attrs: { path: value },
    }),
  });
}
