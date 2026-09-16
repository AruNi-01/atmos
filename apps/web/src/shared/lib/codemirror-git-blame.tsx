import { Facet, type Extension } from "@codemirror/state";
import {
  Decoration,
  EditorView,
  ViewPlugin,
  WidgetType,
  type DecorationSet,
  type ViewUpdate,
} from "@codemirror/view";
import { createRoot, type Root } from "react-dom/client";
import { useEffect, useRef, useState } from "react";
import { Popover, PopoverAnchor, PopoverContent } from "@workspace/ui";
import type { GitBlameCommit, GitCommitDetailResponse, GitFileBlameResponse } from "@/api/ws-api-types";
import { GitBlameHoverCard } from "@/shared/lib/GitBlameHoverCard";
import {
  lookupBlameRange,
  remapBlameRangesForDoc,
} from "@/shared/lib/codemirror-git-blame-map";

export interface GitBlameStrings {
  notCommittedYet: string;
  filesChanged: (count: number) => string;
  insertions: (count: number) => string;
  deletions: (count: number) => string;
  copyHash: string;
  copied: string;
  openCommit: string;
  relativeTime: (timestamp: number) => string;
  when: (timestamp: number) => string;
}

export interface GitBlameHost {
  blame: GitFileBlameResponse;
  blamedDoc: string;
  fetchDetail: (commitHash: string) => Promise<GitCommitDetailResponse | null>;
  onOpenCommit?: (commit: GitBlameCommit) => void;
  strings: GitBlameStrings;
}

const gitBlameHostFacet = Facet.define<GitBlameHost, GitBlameHost | null>({
  combine: (values) => values[0] ?? null,
});

const OPEN_DELAY_MS = 280;
const CLOSE_DELAY_MS = 150;

function currentRanges(host: GitBlameHost, doc: string) {
  if (host.blame.kind !== "ok") return [];
  return remapBlameRangesForDoc(host.blame.ranges, host.blamedDoc, doc);
}

function pointRect(x: number, y: number): DOMRect {
  return new DOMRect(x, y, 0, 0);
}

function isGitBlameHoverSurface(node: EventTarget | null): boolean {
  return node instanceof Element
    && Boolean(node.closest(".cm-git-blame-card, .cm-git-blame-eol"));
}

function isGitBlameHoverAtPoint(x: number, y: number): boolean {
  return isGitBlameHoverSurface(document.elementFromPoint(x, y));
}

function BlameEolPopover({
  open,
  origin,
  host,
  commitHash,
  onContentEnter,
  onContentLeave,
}: {
  open: boolean;
  origin: { x: number; y: number };
  host: GitBlameHost;
  commitHash: string | null;
  onContentEnter: () => void;
  onContentLeave: (relatedTarget: EventTarget | null) => void;
}) {
  const [detail, setDetail] = useState<GitCommitDetailResponse | null>(null);
  const commit = commitHash ? host.blame.commits[commitHash] ?? null : null;
  const uncommitted = !commitHash;
  const virtualRef = useRef({
    getBoundingClientRect: () => pointRect(origin.x, origin.y),
  });
  virtualRef.current.getBoundingClientRect = () => pointRect(origin.x, origin.y);

  useEffect(() => {
    if (!open || !commitHash) {
      setDetail(null);
      return;
    }
    let cancelled = false;
    void host.fetchDetail(commitHash).then((next) => {
      if (!cancelled) setDetail(next);
    });
    return () => {
      cancelled = true;
    };
  }, [commitHash, host, open]);

  return (
    <Popover open={open} modal={false}>
      <PopoverAnchor virtualRef={virtualRef} />
      <PopoverContent
        side="top"
        align="center"
        sideOffset={6}
        avoidCollisions
        collisionPadding={8}
        className="cm-git-blame-card w-[min(22rem,calc(100vw-2rem))] max-h-[min(24rem,calc(100dvh-2rem))] rounded-xl shadow-none"
        onMouseEnter={onContentEnter}
        onMouseLeave={(event) => onContentLeave(event.relatedTarget)}
      >
        <GitBlameHoverCard
          commit={commit}
          detail={detail}
          uncommitted={uncommitted}
          strings={host.strings}
          onOpen={
            host.onOpenCommit && commit
              ? () => host.onOpenCommit?.(commit)
              : undefined
          }
        />
      </PopoverContent>
    </Popover>
  );
}

type BlameHoverSession = {
  root: Root | null;
  mount: HTMLSpanElement | null;
  openTimer: number | null;
  closeTimer: number | null;
  unmountTimer: number | null;
  origin: { x: number; y: number } | null;
};

type BlameEolHostElement = HTMLSpanElement & { __blameSession?: BlameHoverSession };

class BlameEolWidget extends WidgetType {
  constructor(
    readonly host: GitBlameHost,
    readonly text: string,
    readonly commitHash: string | null,
  ) {
    super();
  }

  eq(other: BlameEolWidget) {
    return (
      other.text === this.text &&
      other.host === this.host &&
      other.commitHash === this.commitHash
    );
  }

  toDOM() {
    const span = document.createElement("span") as BlameEolHostElement;
    span.className = "cm-git-blame-eol-host";
    const label = document.createElement("span");
    label.className = "cm-git-blame-eol";
    label.textContent = this.text;
    span.appendChild(label);

    const session: BlameHoverSession = {
      root: null,
      mount: null,
      openTimer: null,
      closeTimer: null,
      unmountTimer: null,
      origin: null,
    };
    span.__blameSession = session;

    const clearTimer = (key: "openTimer" | "closeTimer" | "unmountTimer") => {
      if (session[key] != null) {
        window.clearTimeout(session[key]);
        session[key] = null;
      }
    };

    const unmount = () => {
      clearTimer("unmountTimer");
      session.root?.unmount();
      session.root = null;
      session.mount?.remove();
      session.mount = null;
    };

    let scheduleClose = () => {};

    const paint = (open: boolean) => {
      if (!open && !session.root) return;
      const rect = label.getBoundingClientRect();
      const origin = session.origin ?? {
        x: rect.left + rect.width / 2,
        y: rect.top,
      };
      if (!session.mount) {
        session.mount = document.createElement("span");
        session.mount.className = "cm-git-blame-eol-mount";
        span.appendChild(session.mount);
        session.root = createRoot(session.mount);
      }
      session.root!.render(
        <BlameEolPopover
          open={open}
          origin={origin}
          host={this.host}
          commitHash={this.commitHash}
          onContentEnter={() => {
            clearTimer("closeTimer");
            clearTimer("unmountTimer");
            clearTimer("openTimer");
            paint(true);
          }}
          onContentLeave={(relatedTarget) => {
            if (relatedTarget instanceof Node && label.contains(relatedTarget)) return;
            if (isGitBlameHoverSurface(relatedTarget)) return;
            scheduleClose();
          }}
        />,
      );
      if (!open) {
        clearTimer("unmountTimer");
        session.unmountTimer = window.setTimeout(unmount, 200);
      }
    };

    const scheduleOpen = () => {
      clearTimer("closeTimer");
      clearTimer("unmountTimer");
      if (session.openTimer != null) return;
      session.openTimer = window.setTimeout(() => {
        session.openTimer = null;
        paint(true);
      }, OPEN_DELAY_MS);
    };

    scheduleClose = () => {
      clearTimer("openTimer");
      if (session.closeTimer != null) return;
      session.closeTimer = window.setTimeout(() => {
        session.closeTimer = null;
        paint(false);
      }, CLOSE_DELAY_MS);
    };

    label.addEventListener("mouseenter", (event) => {
      session.origin = { x: event.clientX, y: event.clientY };
      scheduleOpen();
    });
    label.addEventListener("mousemove", (event) => {
      if (session.root) return;
      session.origin = { x: event.clientX, y: event.clientY };
    });
    label.addEventListener("mouseleave", (event) => {
      if (isGitBlameHoverSurface(event.relatedTarget)) return;
      const x = event.clientX;
      const y = event.clientY;
      requestAnimationFrame(() => {
        if (isGitBlameHoverAtPoint(x, y)) return;
        scheduleClose();
      });
    });
    return span;
  }

  destroy(dom: HTMLElement) {
    const session = (dom as BlameEolHostElement).__blameSession;
    if (!session) return;
    if (session.openTimer != null) window.clearTimeout(session.openTimer);
    if (session.closeTimer != null) window.clearTimeout(session.closeTimer);
    if (session.unmountTimer != null) window.clearTimeout(session.unmountTimer);
    session.root?.unmount();
  }

  ignoreEvent(event: Event) {
    return event.type.startsWith("mouse") || event.type.startsWith("pointer");
  }
}

function annotationText(host: GitBlameHost, line: number, doc: string): string {
  const range = lookupBlameRange(currentRanges(host, doc), line);
  if (!range || !range.commit_hash) {
    return host.strings.notCommittedYet;
  }
  const commit = host.blame.commits[range.commit_hash];
  if (!commit) {
    return host.strings.notCommittedYet;
  }
  const subject = commit.subject.length > 48 ? `${commit.subject.slice(0, 47)}…` : commit.subject;
  return `${subject} · ${commit.author_name} · ${host.strings.relativeTime(commit.timestamp)}`;
}

const blameEolPlugin = ViewPlugin.fromClass(
  class {
    decorations: DecorationSet;

    constructor(view: EditorView) {
      this.decorations = this.build(view);
    }

    update(update: ViewUpdate) {
      const hostChanged =
        update.startState.facet(gitBlameHostFacet) !== update.state.facet(gitBlameHostFacet);
      if (
        hostChanged ||
        update.docChanged ||
        update.selectionSet ||
        update.viewportChanged
      ) {
        this.decorations = this.build(update.view);
      }
    }

    build(view: EditorView) {
      const host = view.state.facet(gitBlameHostFacet);
      if (!host || host.blame.kind !== "ok") {
        return Decoration.none;
      }
      const doc = view.state.doc.toString();
      const line = view.state.doc.lineAt(view.state.selection.main.head);
      const range = lookupBlameRange(currentRanges(host, doc), line.number);
      const text = annotationText(host, line.number, doc);
      return Decoration.set([
        Decoration.widget({
          widget: new BlameEolWidget(host, text, range?.commit_hash ?? null),
          side: 1,
        }).range(line.to),
      ]);
    }
  },
  { decorations: (v) => v.decorations },
);

const blameTheme = EditorView.baseTheme({
  ".cm-git-blame-eol-host": {
    pointerEvents: "none",
  },
  ".cm-git-blame-eol-mount": {
    pointerEvents: "none",
    position: "absolute",
    width: "0",
    height: "0",
    overflow: "hidden",
  },
  ".cm-git-blame-eol": {
    color: "var(--muted-foreground)",
    opacity: "0.72",
    fontSize: "11px",
    marginLeft: "2ch",
    pointerEvents: "auto",
  },
});

export function createGitBlameExtensions(host: GitBlameHost): Extension {
  if (host.blame.kind !== "ok") {
    return [];
  }
  return [gitBlameHostFacet.of(host), blameEolPlugin, blameTheme];
}
