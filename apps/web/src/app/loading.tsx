"use client";

import { useTranslations } from "next-intl";
import { TextShimmer } from "@workspace/ui";

export default function AppLoading() {
  const t = useTranslations("app.loading");
  const label = t("label");

  return (
    <div className="flex min-h-dvh items-center justify-center bg-background">
      <div className="flex flex-col items-center gap-3">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-muted-foreground/25 border-t-foreground" />
        <TextShimmer as="p" duration={1.1} className="text-sm">
          {label}
        </TextShimmer>
      </div>
    </div>
  );
}
