"use client";

import { LogIn, Plus } from "lucide-react";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
  cn,
} from "@workspace/ui";
import { useTranslations } from "next-intl";
import { useOpenSettings } from "@/features/settings/lib/open-settings";
import type { ComputerScopeHintKind } from "@/features/token-usage/lib/unique-computers";

export function TokenUsageComputerScopeHint({
  kind,
  isDark,
}: {
  kind: ComputerScopeHintKind;
  isDark: boolean;
}) {
  const t = useTranslations("appShell.tokenUsageDialog.computerScope");
  const openSettings = useOpenSettings();
  const signIn = kind === "sign-in";
  const label = signIn ? t("hintSignIn") : t("hintAddComputer");
  const tooltip = signIn ? t("hintSignInTooltip") : t("hintAddComputerTooltip");
  const Icon = signIn ? LogIn : Plus;

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <button
          type="button"
          className={cn(
            "inline-flex h-8 shrink-0 items-center gap-1.5 rounded-lg border px-2.5 text-xs font-medium",
            isDark
              ? "border-white/[0.07] bg-white/[0.04] hover:bg-white/[0.07]"
              : "border-black/[0.08] bg-black/[0.04] hover:bg-black/[0.06]",
          )}
          onClick={() => {
            if (signIn) {
              openSettings("account");
              return;
            }
            openSettings("remote-access", "atmos-computer");
          }}
        >
          <Icon className="size-3.5 shrink-0" aria-hidden />
          {label}
        </button>
      </TooltipTrigger>
      <TooltipContent side="bottom" className="max-w-[16rem]">
        {tooltip}
      </TooltipContent>
    </Tooltip>
  );
}
