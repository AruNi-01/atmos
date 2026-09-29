"use client";

import React from "react";
import { ArrowLeft } from "@workspace/ui";
import { useTranslations } from "next-intl";

export function GlobalSearchSubViewFrame({
  icon,
  title,
  onBack,
  children,
}: {
  icon: React.ReactNode;
  title: string;
  onBack: () => void;
  children: React.ReactNode;
}) {
  const t = useTranslations("appShell");
  return (
    <div className="flex h-full flex-col overflow-hidden">
      <div className="flex h-12 shrink-0 items-center gap-3 border-b border-border px-4">
        <button
          onClick={onBack}
          className="flex size-7 cursor-pointer items-center justify-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground"
        >
          <ArrowLeft className="size-4" />
        </button>
        <div className="flex min-w-0 flex-1 items-center gap-2">
          {icon}
          <span className="truncate text-sm font-semibold">{title}</span>
        </div>
      </div>

      {children}

      <div className="mt-auto flex h-[38px] shrink-0 select-none items-center justify-end border-t border-border/40 bg-transparent px-4 text-[11px] text-muted-foreground/80">
        <span className="flex items-center gap-1.5 opacity-80">
          <kbd className="flex h-[18px] items-center justify-center rounded border border-border/60 bg-background px-1.5 font-sans text-[10px] font-medium uppercase shadow-sm">Esc</kbd>
          <span>{t("globalSearch.back")}</span>
        </span>
      </div>
    </div>
  );
}
