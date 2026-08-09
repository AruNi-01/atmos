"use client";

import React, { useState } from "react";
import { useTranslations } from "next-intl";
import { Textarea, TabsSubtle, TabsSubtleItem, cn } from "@workspace/ui";
import { Eye, PenLine } from "lucide-react";
import { MarkdownRenderer } from "@/shared/components/markdown/MarkdownRenderer";

type GithubMarkdownFieldProps = {
  value: string;
  onChange: (value: string) => void;
  onBlur?: () => void;
  placeholder?: string;
  /** Accessible name for the textarea. */
  "aria-label"?: string;
  error?: string | null;
  minHeightClassName?: string;
  className?: string;
  disabled?: boolean;
};

/**
 * Write / Preview markdown field — same pattern as PR discussion CommentBox.
 */
export function GithubMarkdownField({
  value,
  onChange,
  onBlur,
  placeholder,
  "aria-label": ariaLabel,
  error,
  minHeightClassName = "min-h-[140px]",
  className,
  disabled,
}: GithubMarkdownFieldProps) {
  const t = useTranslations("appShell.task.github.createIssue");
  const [tab, setTab] = useState<"write" | "preview">("write");

  return (
    <div
      className={cn(
        "overflow-hidden rounded-lg border border-border/70",
        error && "border-destructive/60",
        className,
      )}
    >
      <div className="flex items-center justify-between border-b border-border/70 px-3 py-1.5">
        <TabsSubtle
          activeLabel
          idPrefix="github-md-field"
          selectedIndex={tab === "write" ? 0 : 1}
          onSelect={(index) => setTab(index === 0 ? "write" : "preview")}
        >
          <TabsSubtleItem index={0} icon={PenLine} label={t("markdown.write")} />
          <TabsSubtleItem index={1} icon={Eye} label={t("markdown.preview")} />
        </TabsSubtle>
        <span className="text-[10px] text-muted-foreground">{t("markdown.supported")}</span>
      </div>
      {tab === "write" ? (
        <Textarea
          value={value}
          onChange={(e) => onChange(e.target.value)}
          onBlur={onBlur}
          placeholder={placeholder}
          aria-label={ariaLabel}
          disabled={disabled}
          className={cn(
            "w-full resize-y rounded-none border-none bg-transparent p-3 text-[13px] shadow-none focus-visible:ring-0 dark:bg-transparent",
            minHeightClassName,
          )}
        />
      ) : (
        <div className={cn("p-3", minHeightClassName)}>
          {value.trim() ? (
            <MarkdownRenderer className="prose prose-sm max-w-none text-[13px] dark:prose-invert">
              {value}
            </MarkdownRenderer>
          ) : (
            <p className="text-xs italic text-muted-foreground">{t("markdown.nothingToPreview")}</p>
          )}
        </div>
      )}
      {error ? (
        <p className="border-t border-border/60 px-3 py-1.5 text-[11px] text-destructive">{error}</p>
      ) : null}
    </div>
  );
}
