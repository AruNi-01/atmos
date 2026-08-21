"use client";

import { useTranslations } from "next-intl";
import { cn } from "@/shared/lib/utils";
import LogoSvg from "@workspace/ui/components/logo-svg";

export function HostedLandingLoading({
  className,
}: {
  className?: string;
}) {
  const t = useTranslations("app.loading");

  return (
    <div
      className={cn(
        "flex min-h-0 flex-1 items-center justify-center bg-background",
        className,
      )}
      role="status"
      aria-label={t("label")}
    >
      <LogoSvg className="atmos-logo-breathe h-20 w-auto" />
    </div>
  );
}
