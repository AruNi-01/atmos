"use client";

import { useMemo, useState } from "react";
import { useTranslations } from "next-intl";
import {
  EmptyAction,
  IconArrowRight,
  IconPlus,
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@workspace/ui";
import { openNewAgentChatInContext } from "@/features/agent/lib/agent-chat-sessions";
import { recentObserverChatContexts } from "@/features/agent/lib/observer-recent-contexts";
import { useAppRouter } from "@/shared/hooks/use-app-router";
import type { Project } from "@/shared/types/domain";

export function ObserverNewChatPicker({
  projects,
  emphasis = "quiet",
}: {
  projects: Project[];
  emphasis?: "primary" | "quiet";
}) {
  const t = useTranslations("AgentObserver");
  const router = useAppRouter();
  const [open, setOpen] = useState(false);
  const items = useMemo(() => recentObserverChatContexts(projects), [projects]);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <EmptyAction
          emphasis={emphasis}
          icon={emphasis === "primary" ? <IconPlus /> : undefined}
          trailing={emphasis === "quiet" ? <IconArrowRight /> : undefined}
        >
          {t("newChat")}
        </EmptyAction>
      </PopoverTrigger>
      <PopoverContent align="center" side="bottom" className="w-72 p-1">
        <p className="px-2 py-1.5 text-xs text-muted-foreground">{t("recentWorkspacesHint")}</p>
        {items.length === 0 ? (
          <p className="px-2 pb-2.5 text-sm text-muted-foreground">{t("recentContextsEmpty")}</p>
        ) : (
          <div className="flex flex-col">
            {items.map((item) => (
              <button
                key={`${item.kind}:${item.id}`}
                type="button"
                className="flex w-full cursor-pointer items-center rounded-lg px-2 py-1.5 text-left text-sm text-foreground hover:bg-accent hover:text-accent-foreground"
                onClick={() => {
                  setOpen(false);
                  openNewAgentChatInContext(item.id, router, projects);
                }}
              >
                <span className="min-w-0 truncate">{item.name}</span>
                {item.kind === "workspace" && item.projectName ? (
                  <span className="shrink-0 text-muted-foreground"> / {item.projectName}</span>
                ) : null}
              </button>
            ))}
          </div>
        )}
      </PopoverContent>
    </Popover>
  );
}
