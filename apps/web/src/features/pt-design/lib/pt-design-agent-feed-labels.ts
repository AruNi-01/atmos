import { createTranslator } from "next-intl";
import enMessages from "../../../../messages/en.json";
import zhMessages from "../../../../messages/zh.json";
import { currentAppLocale } from "@/shared/lib/current-app-locale";
import type {
  AgentSurfaceCommandDescriptor,
  AgentSurfaceFeedKind,
} from "@/shared/lib/agent-surface-feed";

let cachedLocale: "en" | "zh" | null = null;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
let cachedTranslator: any = null;

function t(key: string, values?: Record<string, unknown>): string {
  const locale = currentAppLocale("en") === "zh" ? "zh" : "en";
  if (!cachedTranslator || cachedLocale !== locale) {
    cachedLocale = locale;
    cachedTranslator = createTranslator({
      locale,
      messages: locale === "zh" ? zhMessages : enMessages,
      namespace: "ptDesign.agentFeedLabels",
    });
  }
  return cachedTranslator(key as never, values);
}

function verb(command: string): string {
  return command.trim().toLowerCase().replace(/_/g, "-");
}

export function describePtDesignAgentCommand(
  command: string,
  args?: Record<string, unknown> | null,
): AgentSurfaceCommandDescriptor {
  const name = verb(command);
  const type =
    typeof args?.componentType === "string"
      ? args.componentType
      : typeof args?.type === "string"
        ? args.type
        : null;

  const kindFor = (kind: AgentSurfaceFeedKind, key: string): AgentSurfaceCommandDescriptor => ({
    kind,
    label: t(key),
  });

  if (
    name === "pt-catalog-list" ||
    name === "pt-ir-get" ||
    name === "pt-scene-get" ||
    name === "pt-tools-list" ||
    name === "pt-frames-list" ||
    name === "pt-lint"
  ) {
    return kindFor("read", "readingBoard");
  }
  if (name === "pt-screenshot") return kindFor("read", "capturingScreenshot");
  if (name === "pt-place") {
    return {
      kind: "create",
      label: type ? t("placingNamed", { type }) : t("placingComponent"),
    };
  }
  if (name === "pt-update") return kindFor("edit", "editingComponent");
  if (name === "pt-delete") return kindFor("delete", "deletingComponents");
  if (name === "pt-frame-create") return kindFor("create", "creatingFrame");
  if (name === "pt-frame-rename" || name === "pt-frame-update") return kindFor("edit", "editingFrame");
  if (name === "pt-frame-delete") return kindFor("delete", "deletingFrame");
  if (name === "pt-layout-row" || name === "pt-layout-column" || name === "pt-layout-grid") {
    return kindFor("layout", "arrangingLayout");
  }
  if (name === "pt-batch") return kindFor("edit", "batchingCommands");
  if (name === "pt-apply-ir") return kindFor("edit", "applyingDesign");
  if (name === "pt-export" || name === "pt-handoff") return kindFor("read", "exportingBoard");
  return kindFor("edit", "workingOnBoard");
}
