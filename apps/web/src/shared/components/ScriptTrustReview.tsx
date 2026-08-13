"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { cn } from "@/shared/lib/utils";

/**
 * Shows every command in a project's `.atmos/scripts/atmos.json`.
 *
 * Lives in `shared/` because two unrelated features confirm scripts: workspace
 * setup and the browser Run panel.
 *
 * Trust is recorded for the whole file, so confirmation has to show the whole
 * file: accepting from the setup prompt also accepts `run` (and anything else in
 * there), and the user cannot consent to commands they were never shown.
 * `highlightField` marks the one that is about to run.
 */
export function ScriptTrustReview({
  scripts,
  highlightField,
  className,
}: {
  scripts: Record<string, string>;
  highlightField?: string;
  className?: string;
}) {
  const t = useTranslations("shared.scriptTrustReview");

  const entries = React.useMemo(
    () =>
      Object.entries(scripts)
        .map(([field, command]) => [field, (command ?? "").trim()] as const)
        .filter(([, command]) => command.length > 0)
        .sort(([a], [b]) => a.localeCompare(b)),
    [scripts],
  );

  if (entries.length === 0) {
    return (
      <p
        data-script-review-empty="true"
        className={cn("text-sm text-muted-foreground", className)}
      >
        {t("empty")}
      </p>
    );
  }

  return (
    <div className={cn("space-y-2", className)}>
      {entries.map(([field, command]) => {
        const isHighlighted = field === highlightField;
        return (
          <div
            key={field}
            data-script-field={field}
            data-script-highlighted={isHighlighted ? "true" : undefined}
            className={cn(
              "rounded-md border",
              isHighlighted
                ? "border-destructive/40 bg-destructive/5"
                : "border-border bg-muted/30",
            )}
          >
            <div className="flex items-center gap-2 px-3 pt-2">
              <code className="text-[11px] font-semibold text-foreground">{field}</code>
              {isHighlighted && (
                <span className="rounded-sm bg-destructive/15 px-1.5 py-0.5 text-[10px] font-medium text-destructive">
                  {t("aboutToRun")}
                </span>
              )}
            </div>
            <pre className="max-h-40 overflow-auto whitespace-pre-wrap break-words px-3 pb-2 pt-1 text-[12px] leading-relaxed text-foreground">
              <code>{command}</code>
            </pre>
          </div>
        );
      })}
    </div>
  );
}
