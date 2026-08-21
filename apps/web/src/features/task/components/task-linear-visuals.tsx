"use client";

import { useTranslations } from "next-intl";
import { cn } from "@workspace/ui";
import {
  CheckCircle2,
  Circle,
  CircleDashed,
  CircleDot,
  XCircle,
} from "lucide-react";

/**
 * Priority mark: Linear 0 = none · 1 urgent · 2 high · 3 medium · 4 low.
 * Shared by Task list + detail drawer.
 */
export function LinearPriorityMark({
  priority,
  className,
}: {
  priority: number;
  className?: string;
}) {
  const t = useTranslations("appShell.task.linear");
  if (!priority || priority <= 0) {
    return (
      <span
        className={cn(
          "inline-block min-w-[1.75rem] shrink-0 whitespace-nowrap text-center text-[11px] leading-none tracking-tight text-muted-foreground",
          className,
        )}
        title={t("table.noPriority")}
      >
        ---
      </span>
    );
  }
  const tone =
    priority === 1
      ? "text-orange-500"
      : priority === 2
        ? "text-amber-500"
        : priority === 3
          ? "text-yellow-600 dark:text-yellow-500"
          : "text-muted-foreground";
  const label =
    priority === 1
      ? t("priority.urgent")
      : priority === 2
        ? t("priority.high")
        : priority === 3
          ? t("priority.medium")
          : t("priority.low");
  return (
    <span
      className={cn(
        "inline-block min-w-[1.75rem] shrink-0 whitespace-nowrap text-center text-xs font-semibold leading-none",
        tone,
        className,
      )}
      title={label}
    >
      {priority === 1 ? "!!" : "!"}
    </span>
  );
}

export function linearPriorityLabelKey(
  priority: number,
): "table.noPriority" | "priority.urgent" | "priority.high" | "priority.medium" | "priority.low" {
  switch (priority) {
    case 1:
      return "priority.urgent";
    case 2:
      return "priority.high";
    case 3:
      return "priority.medium";
    case 4:
      return "priority.low";
    default:
      return "table.noPriority";
  }
}

/**
 * Linear workflow state type → icon (list + detail).
 * Types: backlog | unstarted | started | completed | canceled
 */
export function LinearStatusIcon({
  stateType,
  stateName,
  className,
  size = "sm",
}: {
  stateType?: string | null;
  stateName?: string | null;
  className?: string;
  size?: "sm" | "md";
}) {
  const type = (stateType ?? "").toLowerCase();
  const name = (stateName ?? "").toLowerCase();
  const title = stateName?.trim() || stateType?.trim() || "Status";
  const dim = size === "md" ? "size-4" : "size-3.5";
  const base = cn(dim, "shrink-0");

  const icon = (() => {
    if (type === "completed" || name === "done") {
      return <CheckCircle2 className={cn(base, "text-indigo-400")} aria-hidden />;
    }
    if (
      type === "canceled" ||
      name.includes("cancel") ||
      name.includes("duplicate")
    ) {
      return (
        <XCircle className={cn(base, "text-muted-foreground/70")} aria-hidden />
      );
    }
    if (type === "started") {
      if (name.includes("review")) {
        return (
          <CircleDot className={cn(base, "text-emerald-500")} aria-hidden />
        );
      }
      return (
        <span
          className={cn(
            "relative inline-flex shrink-0 items-center justify-center",
            dim,
          )}
        >
          <span className="absolute inset-0 rounded-full border-[1.5px] border-yellow-500/90" />
          <span
            className="absolute inset-0 overflow-hidden rounded-full"
            style={{ clipPath: "inset(0 50% 0 0)" }}
          >
            <span className="absolute inset-0 rounded-full bg-yellow-500/90" />
          </span>
        </span>
      );
    }
    if (type === "backlog") {
      return (
        <CircleDashed className={cn(base, "text-muted-foreground")} aria-hidden />
      );
    }
    return <Circle className={cn(base, "text-muted-foreground")} aria-hidden />;
  })();

  return (
    <span
      className={cn("inline-flex shrink-0", className)}
      title={title}
      aria-label={title}
    >
      {icon}
    </span>
  );
}

export function LinearLabelChip({
  name,
  color,
  className,
}: {
  name: string;
  color?: string | null;
  className?: string;
}) {
  const raw = color?.trim() ?? "";
  const hex = raw ? (raw.startsWith("#") ? raw : `#${raw}`) : null;
  return (
    <span
      className={cn(
        "inline-flex max-w-full shrink-0 truncate rounded-full px-2 py-0.5 text-[11px] font-medium",
        !hex && "border border-border/60 bg-muted/40 text-muted-foreground",
        className,
      )}
      style={
        hex
          ? {
              backgroundColor: `${hex}26`,
              color: hex,
              boxShadow: `inset 0 0 0 1px ${hex}40`,
            }
          : undefined
      }
      title={name}
    >
      {name}
    </span>
  );
}

export function LinearAssigneeAvatar({
  name,
  avatarUrl,
  className,
}: {
  name?: string | null;
  avatarUrl?: string | null;
  className?: string;
}) {
  if (avatarUrl) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={avatarUrl}
        alt={name ?? ""}
        title={name ?? undefined}
        className={cn(
          "size-5 shrink-0 rounded-full border border-border/50 object-cover",
          className,
        )}
      />
    );
  }
  if (name?.trim()) {
    return (
      <span
        title={name}
        className={cn(
          "inline-flex size-5 shrink-0 items-center justify-center rounded-full bg-muted text-[10px] font-medium text-muted-foreground",
          className,
        )}
      >
        {name.trim().slice(0, 1).toUpperCase()}
      </span>
    );
  }
  return (
    <span
      className={cn(
        "inline-flex size-5 shrink-0 items-center justify-center rounded-full border border-dashed border-border/60 text-[10px] text-muted-foreground/50",
        className,
      )}
      aria-hidden
    />
  );
}
