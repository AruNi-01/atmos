"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { Button, cn } from "@workspace/ui";
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
import { buildInteractiveAgentRunPlan } from "@/features/agent/lib/terminal-agent-run-config";
import { useEditorStore } from "@/features/editor/store/use-editor-store";
import { registerAiContextPrompt } from "@/shared/lib/ai-context-protocol";
import { copyMdLivePrompt, buildHeadlessPrompt } from "../lib/md-live-adapters";
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
  className,
}: {
  filePath: string;
  markdown: string;
  ensureLive?: () => void;
  className?: string;
}) {
  const t = useTranslations("mdLive");
  const composerRef = useRef<ComposerHandle | null>(null);
  const [instruction, setInstruction] = useState("");
  const [copied, setCopied] = useState(false);
  const [pending, setPending] = useState<"idle" | "streaming" | "review">("idle");
  const [snapshot, setSnapshot] = useState<string | null>(null);
  const [status, setStatus] = useState<string | null>(null);
  const [mentionPopover, setMentionPopover] = useState<MentionPopoverState>(null);
  const selectionRef = useRef("");
  const fenceTimerRef = useRef<number | null>(null);
  const runGenerationRef = useRef(0);
  const outputUnsubRef = useRef<(() => void) | null>(null);
  const updateFileContent = useEditorStore((s) => s.updateFileContent);
  const currentProjectPath = useEditorStore((s) => s.currentProjectPath);
  const { availableAgents, selectedAgentId, setSelectedAgentId, selectedAgent } =
    useWelcomeAgentOptions();

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

  const onCopy = async () => {
    await copyMdLivePrompt(buildRequest({ kind: "copy" }, "markdown"));
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1200);
  };

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
          composerRef.current?.setText(next);
          composerRef.current?.focus();
          return;
        }
        const preset =
          event.kind === "rewrite"
            ? t("rewriteInstruction")
            : t("summarizeInstruction");
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

  return (
    <div className={cn("border-t border-border bg-background px-3 py-2", className)}>
      <div className="flex items-end gap-2">
        <div className="min-w-0 flex-1">
          <PromptComposer
            ref={composerRef}
            placeholder={t("copyPrompt")}
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
        <WelcomeAgentSelector
          availableAgents={availableAgents}
          selectedAgentId={selectedAgentId}
          onSelectAgent={setSelectedAgentId}
          runConfigByAgentId={{}}
          onRunConfigChange={() => {}}
          variant="menu"
        />
        <Button type="button" variant="ghost" size="sm" onClick={() => void onCopy()}>
          {copied ? t("copied") : t("copyPrompt")}
        </Button>
        <Button type="button" size="sm" onClick={() => void onRun()} disabled={!instruction.trim()}>
          {t("run")}
        </Button>
      </div>
      {pending === "review" || pending === "streaming" ? (
        <div className="mt-2 flex items-center gap-2">
          <Button type="button" size="sm" onClick={onAccept} disabled={pending !== "review"}>
            {t("accept")}
          </Button>
          <Button type="button" size="sm" variant="ghost" onClick={onReject}>
            {t("reject")}
          </Button>
        </div>
      ) : null}
      {status ? <p className="mt-1 text-xs text-muted-foreground">{status}</p> : null}
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
        popover={mentionPopover}
        prPreview={prPreview}
      />
    </div>
  );
}
