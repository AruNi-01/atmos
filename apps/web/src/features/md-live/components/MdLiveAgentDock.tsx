"use client";

import { useCallback, useEffect, useRef, useState, type RefObject } from "react";
import { useTranslations } from "next-intl";
import { ArrowUp, Loader2 } from "lucide-react";
import { Button, cn } from "@workspace/ui";
import { isTerminalAgentInputShortcut } from "@/features/terminal/lib/terminal-runtime-utils";
import {
  createFenceExtractor,
  parseGithubResourceUrl,
  stripTerminalAnsi,
  type AgentRequest,
} from "@atmos/md-live";
import type { GithubIssuePayload, GithubPrPayload } from "@/api/ws-api";
import { PromptComposer, type ComposerHandle } from "@/features/welcome/components/PromptComposer";
import { WelcomeAgentSelector } from "@/features/welcome/components/WelcomeComposerControls";
import {
  WelcomeMentionPopover,
  type MentionNavItem,
  type MentionPopoverState,
} from "@/features/welcome/components/WelcomeMentionPopover";
import { useWelcomeMentionSearch } from "@/features/welcome/hooks/use-welcome-mention-search";
import { useWelcomeAgentOptions } from "@/features/welcome/hooks/use-welcome-agent-options";
import { filterHeadlessAgents } from "../lib/md-live-headless-agents";
import { buildInteractiveAgentRunPlan } from "@/features/agent/lib/terminal-agent-run-config";
import { useEditorStore } from "@/features/editor/store/use-editor-store";
import { registerAiContextPrompt } from "@/shared/lib/ai-context-protocol";
import { buildHeadlessPrompt } from "../lib/md-live-adapters";
import { MD_LIVE_HEADLESS_PTY } from "../lib/md-live-terminal-bridge";
import { resolveMdLiveRunGrid } from "../lib/md-live-run-grid";
import {
  isMdLiveStreamLocked,
  lockMdLiveStream,
  restoreAndUnlockMdLiveStream,
  unlockMdLiveStream,
} from "../lib/md-live-stream-lock";
import { shouldFireMdLiveFenceTimeout } from "../lib/md-live-fence-timeout";
import {
  getMdLiveEditor,
  subscribeMdLiveEditorEvents,
} from "../lib/md-live-editor-registry";
import { resolveMdLiveRunEditor } from "../lib/md-live-run-editor";
import { subscribeTerminalOutput } from "@/features/terminal/lib/terminal-output-bus";

export function MdLiveAgentDock({
  filePath,
  markdown,
  ensureLive,
  scopeRef,
  className,
}: {
  filePath: string;
  markdown: string;
  ensureLive?: () => void;
  scopeRef?: RefObject<HTMLElement | null>;
  className?: string;
}) {
  const t = useTranslations("mdLive");
  const composerRef = useRef<ComposerHandle | null>(null);
  const [instruction, setInstruction] = useState("");
  const [pending, setPending] = useState<"idle" | "streaming" | "review">("idle");
  const [snapshot, setSnapshot] = useState<string | null>(null);
  const [status, setStatus] = useState<string | null>(null);
  const [mentionPopover, setMentionPopover] = useState<MentionPopoverState>(null);
  const [inputOpen, setInputOpen] = useState(false);
  const selectionRef = useRef("");
  const fenceTimerRef = useRef<number | null>(null);
  const runGenerationRef = useRef(0);
  const outputUnsubRef = useRef<(() => void) | null>(null);
  const updateFileContent = useEditorStore((s) => s.updateFileContent);
  const currentProjectPath = useEditorStore((s) => s.currentProjectPath);
  const { availableAgents, selectedAgentId, setSelectedAgentId } =
    useWelcomeAgentOptions();
  const headlessAgents = filterHeadlessAgents(availableAgents);
  const selectedAgent =
    headlessAgents.find((agent) => agent.id === selectedAgentId) ?? headlessAgents[0] ?? null;

  useEffect(() => {
    if (!selectedAgent) return;
    if (selectedAgent.id === selectedAgentId) return;
    setSelectedAgentId(selectedAgent.id);
  }, [selectedAgent, selectedAgentId, setSelectedAgentId]);

  const syncFromEditor = useCallback(() => {
    const api = getMdLiveEditor(filePath);
    if (!api) return;
    updateFileContent(filePath, api.getMarkdown());
  }, [filePath, updateFileContent]);

  const buildRequest = useCallback(
    (execution: AgentRequest["execution"], outputHint: AgentRequest["outputHint"]): AgentRequest => {
      const selection =
        selectionRef.current || getMdLiveEditor(filePath)?.getSelectionMarkdown() || "";
      return {
        instruction,
        document: { path: filePath, markdown, truncated: false },
        selection: selection ? { markdown: selection } : undefined,
        references: [],
        workspace: currentProjectPath
          ? { id: currentProjectPath, name: currentProjectPath, path: currentProjectPath }
          : undefined,
        execution,
        outputHint,
      };
    },
    [currentProjectPath, filePath, instruction, markdown],
  );

  const clearFenceTimer = useCallback(() => {
    if (fenceTimerRef.current != null) {
      window.clearTimeout(fenceTimerRef.current);
      fenceTimerRef.current = null;
    }
  }, []);

  const restoreSnapshot = useCallback(() => {
    const restored = restoreAndUnlockMdLiveStream(filePath, (content) => {
      updateFileContent(filePath, content);
    });
    if (!restored) {
      if (snapshot != null) updateFileContent(filePath, snapshot);
      else syncFromEditor();
      unlockMdLiveStream(filePath);
    }
    setSnapshot(null);
    setPending("idle");
    clearFenceTimer();
  }, [clearFenceTimer, filePath, snapshot, syncFromEditor, updateFileContent]);

  const onReject = () => {
    const api = getMdLiveEditor(filePath);
    if (pending === "streaming") api?.abortStream(false);
    else api?.clearDiffReview();
    restoreSnapshot();
  };

  const onAccept = () => {
    getMdLiveEditor(filePath)?.acceptAllDiffs();
    syncFromEditor();
    setSnapshot(null);
    setPending("idle");
    unlockMdLiveStream(filePath);
    clearFenceTimer();
  };

  const onRun = async (presetInstruction?: string) => {
    if (!selectedAgent) return;
    const text = (presetInstruction ?? instruction).trim();
    if (!text) return;
    const request = buildRequest(
      { kind: "headless", agentId: selectedAgent.id },
      "markdown",
    );
    if (presetInstruction) request.instruction = presetInstruction;
    const prompt = buildHeadlessPrompt(request);
    const plan = buildInteractiveAgentRunPlan({
      agentId: selectedAgent.id,
      launchCommand: selectedAgent.launchCommand,
      prompt,
      mode: "headless",
    });
    clearFenceTimer();
    outputUnsubRef.current?.();
    outputUnsubRef.current = null;
    const runId = ++runGenerationRef.current;
    const [api, grid] = await Promise.all([
      resolveMdLiveRunEditor({ filePath, ensureLive }),
      resolveMdLiveRunGrid(),
    ]);
    if (!api) {
      setStatus(t("runNeedsLive"));
      return;
    }
    if (!grid) {
      setStatus(t("runNeedsTerminal"));
      return;
    }
    const base = api.getMarkdown() || markdown;
    setSnapshot(base);
    lockMdLiveStream(filePath, base);
    setPending("streaming");
    setStatus(null);
    if (!api.startStream("selection")) {
      setStatus(t("agentDidNotReturnEdit"));
      unlockMdLiveStream(filePath);
      setPending("idle");
      return;
    }
    const extractor = createFenceExtractor();
    const ownedSessionRef: { current: string | undefined } = { current: undefined };
    const unsub = subscribeTerminalOutput((sessionId, chunk) => {
      if (!ownedSessionRef.current || sessionId !== ownedSessionRef.current) return;
      const result = extractor.push(stripTerminalAnsi(chunk));
      if (result.abort === "junk") {
        setStatus(t("agentDidNotReturnEdit"));
        api?.abortStream(false);
        updateFileContent(filePath, base);
        unlockMdLiveStream(filePath);
        setPending("idle");
        unsub();
        outputUnsubRef.current = null;
        clearFenceTimer();
        return;
      }
      if (result.payloadDelta) {
        api?.pushChunk(result.payloadDelta);
      }
      if (result.done && !result.abort) {
        api?.endStream(true);
        setPending("review");
        unsub();
        outputUnsubRef.current = null;
        clearFenceTimer();
      }
    });
    outputUnsubRef.current = unsub;
    const launched = await grid.createAndRunTerminal({
      label: MD_LIVE_HEADLESS_PTY.label,
      command: plan.launchCommand,
      agentId: selectedAgent.id,
      reuseIdlePane: MD_LIVE_HEADLESS_PTY.reuseIdlePane,
      focus: MD_LIVE_HEADLESS_PTY.focus,
      connectWhileHidden: MD_LIVE_HEADLESS_PTY.connectWhileHidden,
    });
    ownedSessionRef.current = launched?.sessionId;
    if (!ownedSessionRef.current) {
      setStatus(t("agentDidNotReturnEdit"));
      api?.abortStream(false);
      unlockMdLiveStream(filePath);
      setPending("idle");
      unsub();
      outputUnsubRef.current = null;
      clearFenceTimer();
      return;
    }
    fenceTimerRef.current = window.setTimeout(() => {
      if (
        !shouldFireMdLiveFenceTimeout({
          runId,
          activeRunId: runGenerationRef.current,
          locked: isMdLiveStreamLocked(filePath),
        })
      ) {
        return;
      }
      const ended = extractor.end();
      if (ended.abort === "no-fence") {
        setStatus(t("agentDidNotReturnEdit"));
        api?.abortStream(false);
        updateFileContent(filePath, base);
        unlockMdLiveStream(filePath);
        setPending("idle");
        unsub();
        outputUnsubRef.current = null;
      }
    }, 120000);
  };

  useEffect(() => {
    return () => {
      outputUnsubRef.current?.();
      outputUnsubRef.current = null;
      clearFenceTimer();
      if (!isMdLiveStreamLocked(filePath)) return;
      getMdLiveEditor(filePath)?.abortStream(false);
      restoreAndUnlockMdLiveStream(filePath, (content) => {
        useEditorStore.getState().updateFileContent(filePath, content);
      });
    };
  }, [clearFenceTimer, filePath]);

  const onRunRef = useRef(onRun);
  onRunRef.current = onRun;

  useEffect(() => {
    return subscribeMdLiveEditorEvents(filePath, (event) => {
      if (event.type === "stream-aborted") {
        restoreSnapshot();
        return;
      }
      if (event.type === "stream-ended") {
        setPending("review");
        return;
      }
      if (event.type === "ai-action") {
        selectionRef.current = event.selection;
        if (event.kind === "ask") {
          const token = registerAiContextPrompt("doc-selection", event.selection);
          const current = composerRef.current?.getText() ?? "";
          const next = `${current} ${token} `.replace(/^\s+/, "");
          setInputOpen(true);
          composerRef.current?.setText(next);
          composerRef.current?.focus();
          return;
        }
        const preset =
          event.kind === "rewrite"
            ? t("rewriteInstruction")
            : t("summarizeInstruction");
        setInputOpen(true);
        setInstruction(preset);
        composerRef.current?.setText(preset);
        void onRunRef.current(preset);
      }
    });
  }, [filePath, restoreSnapshot, t]);

  const selectMentionNavItem = useCallback(
    (item: MentionNavItem) => {
      const popover = mentionPopover;
      if (!popover) return;
      if (item.type === "file") {
        composerRef.current?.applyMentionAtRange(
          popover.atOffset,
          popover.query.length,
          { kind: "file", relativePath: item.file.relativePath },
        );
      } else if (item.type === "issue") {
        composerRef.current?.applyMentionAtRange(
          popover.atOffset,
          popover.query.length,
          { kind: "issue", number: item.issue.number },
        );
      } else if (item.type === "pr") {
        composerRef.current?.applyMentionAtRange(
          popover.atOffset,
          popover.query.length,
          { kind: "pr", number: item.pr.number },
        );
      }
      setMentionPopover(null);
    },
    [mentionPopover],
  );

  const githubMention = mentionPopover?.query
    ? parseGithubResourceUrl(mentionPopover.query)
    : null;
  const issuePreview: GithubIssuePayload | null =
    githubMention?.kind === "issue"
      ? {
          owner: githubMention.owner,
          repo: githubMention.repo,
          number: githubMention.number,
          title: `Issue #${githubMention.number}`,
          body: null,
          url: githubMention.url,
          state: "open",
          comments_count: 0,
          labels: [],
          assignees: [],
        }
      : null;
  const prPreview: GithubPrPayload | null =
    githubMention?.kind === "pr"
      ? {
          owner: githubMention.owner,
          repo: githubMention.repo,
          number: githubMention.number,
          title: `Pull request #${githubMention.number}`,
          body: null,
          url: githubMention.url,
          state: "open",
          head_ref: "",
          base_ref: "",
          is_draft: false,
          labels: [],
        }
      : null;

  const {
    activeMentionFileIndex,
    isMentionFilesLoading,
    mentionFiles,
    mentionPopoverListRef,
    setMentionItemRef,
  } = useWelcomeMentionSearch({
    issuePreview,
    onSelectNavItem: selectMentionNavItem,
    popover: mentionPopover,
    prPreview,
    selectedProjectPath: currentProjectPath,
  });

  const canSubmit = instruction.trim().length > 0 && pending !== "streaming";
  const showReview = pending === "review" || pending === "streaming";
  const expanded = inputOpen || showReview;

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (!isTerminalAgentInputShortcut(event)) return;
      const scope = scopeRef?.current;
      const eventTarget = event.target instanceof Node ? event.target : null;
      const activeTarget = document.activeElement;
      const inScope = !scope
        ? false
        : (eventTarget !== null && scope.contains(eventTarget))
          || (activeTarget !== null && scope.contains(activeTarget));
      if (!inScope) return;
      event.preventDefault();
      event.stopImmediatePropagation();
      setInputOpen((current) => {
        const next = !current;
        if (next) window.requestAnimationFrame(() => composerRef.current?.focus());
        return next;
      });
    };
    window.addEventListener("keydown", onKeyDown, true);
    return () => window.removeEventListener("keydown", onKeyDown, true);
  }, [scopeRef]);

  return (
    <div
      className={cn(
        "pointer-events-none absolute inset-x-0 bottom-1.5 z-20 flex justify-center px-3",
        className,
      )}
    >
      <div
        className="pointer-events-auto relative flex w-full max-w-3xl flex-col items-center"
        onMouseLeave={() => {
          if (showReview || instruction.trim()) return;
          setInputOpen(false);
        }}
      >
      <div
        className={cn(
          "grid w-full transition-[grid-template-rows,opacity,transform] duration-200 ease-out",
          expanded
            ? "mb-1 grid-rows-[1fr] opacity-100 translate-y-0"
            : "pointer-events-none grid-rows-[0fr] opacity-0 translate-y-1",
        )}
      >
        <div className="min-h-0 overflow-hidden">
          <div className="w-full overflow-hidden rounded-[1.65rem] bg-background/95 p-1.5 shadow-[0_18px_50px_rgba(0,0,0,0.28)] backdrop-blur-md dark:bg-[#151515]">
            <div className="flex items-end gap-2 overflow-hidden rounded-[1.25rem] bg-muted/30 px-4 py-2 dark:bg-[#0b0b0b]">
              <div className="min-w-0 flex-1">
                <PromptComposer
                  ref={composerRef}
                  placeholder={t("placeholder")}
                  placeholderClassName="left-0 top-1/2 -translate-y-1/2 truncate text-sm leading-5"
                  editorClassName="min-h-9 max-h-[92px] rounded-none py-2 pr-1 text-sm leading-5"
                  onSubmit={() => void onRun()}
                  onTextChange={setInstruction}
                  onAtTrigger={(ctx) => {
                    setMentionPopover({
                      top: ctx.caretRect.bottom + 4,
                      left: ctx.caretRect.left,
                      atOffset: ctx.atOffset,
                      query: ctx.query,
                    });
                  }}
                  onAtCancel={() => setMentionPopover(null)}
                />
              </div>
              <button
                type="button"
                className="flex size-9 shrink-0 items-center justify-center rounded-full border border-border/70 bg-foreground text-background shadow-sm hover:bg-foreground/90 disabled:cursor-not-allowed disabled:opacity-45"
                disabled={!canSubmit}
                onClick={() => void onRun()}
                aria-label={t("run")}
                title={t("run")}
              >
                {pending === "streaming" ? (
                  <Loader2 className="size-4 animate-spin" />
                ) : (
                  <ArrowUp className="size-4" />
                )}
              </button>
            </div>
            <div className="flex items-center gap-2 px-3 pb-1.5 pt-1.5">
              {showReview ? (
                <div className="flex items-center gap-2">
                  <Button type="button" size="sm" onClick={onAccept} disabled={pending !== "review"}>
                    {t("accept")}
                  </Button>
                  <Button type="button" size="sm" variant="ghost" onClick={onReject}>
                    {t("reject")}
                  </Button>
                </div>
              ) : null}
              <div className="ml-auto flex shrink-0 items-center">
                <WelcomeAgentSelector
                  availableAgents={headlessAgents}
                  selectedAgentId={selectedAgent?.id ?? ""}
                  onSelectAgent={setSelectedAgentId}
                  runConfigByAgentId={{}}
                  onRunConfigChange={() => {}}
                  purpose="automation"
                  triggerPlacement="inline"
                  contentAlign="end"
                />
              </div>
            </div>
          </div>
          {status ? <p className="mt-1 text-xs text-muted-foreground">{status}</p> : null}
        </div>
      </div>
      <WelcomeMentionPopover
        activeIndex={activeMentionFileIndex}
        issuePreview={issuePreview}
        isLoading={isMentionFilesLoading}
        listRef={mentionPopoverListRef}
        mentionFiles={mentionFiles}
        onClose={() => setMentionPopover(null)}
        onSelectFile={(file) => selectMentionNavItem({ type: "file", file })}
        onSelectNavItem={selectMentionNavItem}
        onSetItemRef={setMentionItemRef}
        popover={expanded ? mentionPopover : null}
        prPreview={prPreview}
      />
      <button
        type="button"
        aria-label={t("placeholder")}
        className={cn(
          "h-1 w-28 rounded-full bg-foreground/25 shadow-[0_0_2px_rgba(0,0,0,0.16)] transition-[opacity,box-shadow] duration-200",
          expanded ? "pointer-events-none opacity-0" : "opacity-100 hover:bg-foreground/35",
        )}
        onFocus={() => setInputOpen(true)}
        onClick={() => {
          setInputOpen(true);
          window.requestAnimationFrame(() => composerRef.current?.focus());
        }}
        onMouseEnter={() => setInputOpen(true)}
      />
      </div>
    </div>
  );
}
