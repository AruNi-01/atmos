"use client";

import React from "react";
import { useTranslations } from "next-intl";
import {
  Button,
  Drawer,
  DrawerCloseButton,
  DrawerCloseReserveProvider,
  DrawerContentBare,
  DrawerOverlay,
  DrawerPortal,
  DrawerTitle,
  MatrixOrb,
  cn,
  drawerCloseReserveClass,
} from "@workspace/ui";
import { FolderGit2, GitBranch, Monitor } from "lucide-react";
import { useTaskDrawerInsets } from "@/features/task/components/task-github-drawer/use-task-drawer-insets";
import { AgentIcon } from "@/features/agent/components/AgentIcon";
import {
  AGENT_TOOL_ICON_IDS,
  AGENT_TOOL_LABELS,
} from "@/features/agent/store/agent-status-store";
import {
  observerNodeTitle,
  type ObserverGraphNode,
} from "@/features/agent/lib/agent-observer-graph";
import {
  activityToSteps,
  childToSteps,
} from "@/features/agent/lib/observer-conversation";
import { agentTitle, occupancyLabel, occupancyOf } from "./observer-flow";
import { ObserverConversation } from "./ObserverConversation";

function kindLabel(
  t: ReturnType<typeof useTranslations<"AgentObserver">>,
  kind: ObserverGraphNode["kind"],
): string {
  if (kind === "atmos") return t("kindComputer");
  if (kind === "project") return t("kindProject");
  if (kind === "workspace") return t("kindWorkspace");
  if (kind === "subagent") return t("kindSubagent");
  return t("kindAgent");
}

function DrawerGlyph({ node }: { node: ObserverGraphNode }) {
  const running = occupancyOf(node) === "running";
  if (node.kind === "atmos") return <Monitor className="size-5" />;
  if (node.kind === "project") return <FolderGit2 className="size-5" />;
  if (node.kind === "workspace") return <GitBranch className="size-5" />;
  if (node.kind === "subagent") {
    return <MatrixOrb state={running ? "thinking" : "idle"} size={20} seed={node.id} aria-hidden />;
  }
  const tool = node.session?.tool ?? node.activity?.tool;
  if (tool) {
    return (
      <AgentIcon
        registryId={AGENT_TOOL_ICON_IDS[tool] ?? tool}
        name={AGENT_TOOL_LABELS[tool] ?? agentTitle(node)}
        size={20}
      />
    );
  }
  return <MatrixOrb state={running ? "thinking" : "idle"} size={20} seed={node.id} aria-hidden />;
}

export function ObserverDrawer({
  node,
  sessionTitle,
  onClose,
  onOpenSession,
}: {
  node: ObserverGraphNode | null;
  sessionTitle?: string;
  onClose: () => void;
  onOpenSession: (node: ObserverGraphNode) => void;
}) {
  const t = useTranslations("AgentObserver");
  const insets = useTaskDrawerInsets();
  const open = Boolean(node);
  const [held, setHeld] = React.useState<ObserverGraphNode | null>(node);

  React.useEffect(() => {
    if (node) setHeld(node);
  }, [node]);

  const sheetWidth = `calc(100vw - ${insets.left}px - ${insets.right}px - 48px)`;
  const contentStyle = {
    top: insets.top,
    right: insets.right,
    bottom: insets.bottom,
    width: sheetWidth,
    maxWidth: "min(720px, 100%)",
    height: "auto",
    zIndex: 50,
    ["--initial-transform" as string]: `calc(100% + ${insets.right}px)`,
  } as React.CSSProperties;

  const title = held
    ? held.kind === "agent"
      ? observerNodeTitle(held, sessionTitle) === held.label
        ? agentTitle(held)
        : observerNodeTitle(held, sessionTitle)
      : held.kind === "subagent"
        ? observerNodeTitle(held, sessionTitle)
        : kindLabel(t, held.kind)
    : t("title");
  const canOpen = Boolean(held && (held.kind === "agent" || held.kind === "subagent"));
  const todos = held?.kind === "agent" ? (held.activity?.todos ?? []) : [];
  const occupancy = held ? occupancyLabel((key) => t(key), occupancyOf(held)) : "";
  const steps = React.useMemo(() => {
    if (!held) return [];
    if (held.kind === "subagent") {
      return held.child ? childToSteps(held.child) : [];
    }
    if (held.kind === "agent" && held.activity) {
      return activityToSteps(held.activity);
    }
    return [];
  }, [held]);
  const showConversation = held?.kind === "agent" || held?.kind === "subagent";

  return (
    <Drawer
      open={open}
      onOpenChange={(next) => {
        if (!next) onClose();
      }}
      onAnimationEnd={(isOpen) => {
        if (!isOpen) setHeld(null);
      }}
      direction="right"
      handleOnly
      shouldScaleBackground
      dismissible
      modal
    >
      <DrawerPortal>
        <DrawerOverlay className="bg-black/40" style={{ zIndex: 50 }} />
        <DrawerContentBare
          className="fixed z-50 flex overflow-hidden rounded-xl border border-border/70 bg-background outline-none shadow-2xl"
          style={contentStyle}
        >
          <DrawerTitle className="sr-only">{title}</DrawerTitle>
          <DrawerCloseReserveProvider>
            <div className="relative flex h-full min-h-0 w-full flex-col overflow-hidden">
              <DrawerCloseButton onClick={onClose} aria-label={t("close")} />
              {held ? (
                <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
                  <div className={cn("shrink-0 px-5 pt-5", drawerCloseReserveClass)}>
                    <div className="mb-4 flex items-start gap-3">
                      <div className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-muted/40 text-muted-foreground">
                        <DrawerGlyph node={held} />
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="text-xs text-muted-foreground">{kindLabel(t, held.kind)}</div>
                        <h2 className="mt-1 text-lg font-semibold leading-snug text-foreground">
                          {title}
                        </h2>
                        <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs text-muted-foreground">
                          {occupancy ? <span>{occupancy}</span> : null}
                          {held.chat ? <span>{t("chat")}</span> : null}
                          {held.sideChat ? <span>{t("sideChat")}</span> : null}
                          {held.kind !== "agent" && held.kind !== "subagent" ? (
                            <span>{t("members", { count: held.childCount })}</span>
                          ) : null}
                        </div>
                      </div>
                      {canOpen ? (
                        <Button
                          type="button"
                          size="sm"
                          variant="default"
                          className="h-7 shrink-0 px-2 text-xs font-medium"
                          onClick={() => onOpenSession(held)}
                        >
                          {held.chat ? t("openChat") : t("openPane")}
                        </Button>
                      ) : null}
                    </div>
                    {todos.length > 0 ? (
                      <ul className="mb-3 space-y-1 border-b border-border/60 pb-3 text-sm">
                        {todos.map((todo, index) => (
                          <li
                            key={`${todo.content}-${index}`}
                            className="flex gap-2 leading-5 text-muted-foreground"
                          >
                            <span className="mt-1.5 size-1 shrink-0 rounded-full bg-muted-foreground/70" />
                            <span className={todo.status === "completed" || todo.status === "cancelled" ? "line-through" : "text-foreground"}>
                              {todo.content}
                            </span>
                          </li>
                        ))}
                      </ul>
                    ) : null}
                  </div>
                  {showConversation ? (
                    <div className="min-h-0 flex-1 px-4 pb-4">
                      {steps.length > 0 ? (
                        <ObserverConversation steps={steps} />
                      ) : (
                        <p className="px-1 text-sm text-muted-foreground">{t("noTurns")}</p>
                      )}
                    </div>
                  ) : (
                    <div className="min-h-0 flex-1 px-5 pb-6 text-sm text-muted-foreground">
                      {t("members", { count: held.childCount })}
                    </div>
                  )}
                </div>
              ) : null}
            </div>
          </DrawerCloseReserveProvider>
        </DrawerContentBare>
      </DrawerPortal>
    </Drawer>
  );
}
