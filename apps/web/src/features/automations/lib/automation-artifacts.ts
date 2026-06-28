import { createTranslator } from "next-intl";
import { toastManager } from "@workspace/ui";

import { appApi } from "@/api/ws-api";
import { currentAppLocale } from "@/shared/lib/current-app-locale";
import enMessages from "../../../../messages/en.json";
import zhMessages from "../../../../messages/zh.json";

type AutomationsLocale = "en" | "zh";

let cachedLocale: AutomationsLocale | null = null;
let cachedTranslator: ReturnType<typeof createTranslator> | null = null;

function automationsT(
  key: string,
  values?: Record<string, string | number>,
): string {
  const locale: AutomationsLocale =
    currentAppLocale("en") === "zh" ? "zh" : "en";
  if (!cachedTranslator || cachedLocale !== locale) {
    cachedLocale = locale;
    cachedTranslator = createTranslator({
      locale,
      messages: locale === "zh" ? zhMessages : enMessages,
      namespace: "automation" as never,
    });
  }

  return cachedTranslator(key as never, values as never);
}

export async function openArtifactPath(path: string) {
  if (!path) return;
  try {
    await appApi.openPath(path);
    toastManager.add({
      title: automationsT("artifacts.openedPathTitle"),
      description: path,
      type: "success",
    });
  } catch (err) {
    toastManager.add({
      title: automationsT("artifacts.failedToOpenPathTitle"),
      description:
        err instanceof Error
          ? err.message
          : automationsT("artifacts.unknownError"),
      type: "error",
    });
  }
}
