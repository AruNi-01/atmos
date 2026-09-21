"use client";

import { useTranslations } from "next-intl";
import { cn } from "@workspace/ui";
import type { ObserverStep } from "@/features/agent/lib/observer-conversation";

function toolStateLabel(
  t: ReturnType<typeof useTranslations<"AgentObserver">>,
  state: string | undefined,
): string | null {
  const value = (state ?? "").trim().toLowerCase();
  if (value === "pending" || value === "running" || value === "in_progress") {
    return t("toolPending");
  }
  if (value === "error" || value === "failed") return t("toolError");
  if (value === "ok" || value === "completed") return t("toolOk");
  return null;
}

export function ObserverConversation({
  steps,
}: {
  steps: ObserverStep[];
}) {
  const t = useTranslations("AgentObserver");
  return (
    <div className="flex h-full min-h-0 w-full min-w-0 flex-col">
      <p className="shrink-0 px-1 pb-2 text-xs leading-4 text-muted-foreground">
        {t("stepsHint")}
      </p>
      <ol className="min-h-0 flex-1 space-y-1 overflow-y-auto px-1 pb-1">
        {steps.map((step) => {
          const status = step.kind === "tool" ? toolStateLabel(t, step.state) : null;
          const title = step.detail ? `${step.label} ${step.detail}` : step.label;
          return (
            <li
              key={step.id}
              className="flex gap-2 rounded-md px-1 py-1.5 text-sm leading-5"
            >
              <span
                className={cn(
                  "mt-2 size-1.5 shrink-0 rounded-full",
                  step.kind === "prompt"
                    ? "bg-muted-foreground/70"
                    : step.state === "error" || step.state === "failed"
                      ? "bg-destructive"
                      : step.state === "pending"
                        ? "bg-info"
                        : "bg-success/80",
                )}
              />
              <div className="min-w-0 flex-1">
                <div className="truncate text-foreground" title={title}>
                  {title}
                </div>
                {status ? (
                  <div className="text-[11px] leading-4 text-muted-foreground">{status}</div>
                ) : null}
              </div>
            </li>
          );
        })}
      </ol>
    </div>
  );
}
