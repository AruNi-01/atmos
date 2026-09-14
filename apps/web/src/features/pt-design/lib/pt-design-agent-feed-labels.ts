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

export const PT_DESIGN_RUNTIME_ACTION_COMMAND = "pt_runtime_action";

function verb(command: string): string {
  return command.trim().toLowerCase().replace(/_/g, "-");
}

function runtimeActionName(args?: Record<string, unknown> | null): string {
  return typeof args?.name === "string" ? args.name.trim() : "";
}

export function describePtDesignAgentCommand(
  command: string,
  args?: Record<string, unknown> | null,
): AgentSurfaceCommandDescriptor {
  const name = verb(command);

  const kindFor = (kind: AgentSurfaceFeedKind, key: string): AgentSurfaceCommandDescriptor => ({
    kind,
    label: t(key),
  });

  if (name === "pt-runtime-action") {
    const actionName = runtimeActionName(args);
    if (actionName) {
      return { kind: "edit", label: t("runningAction", { name: actionName }) };
    }
    return kindFor("edit", "runningBoardAction");
  }
  if (name === "pt-ptx-get") return kindFor("read", "readingPtx");
  if (
    name === "pt-catalog-list" ||
    name === "pt-tools-list"
  ) {
    return kindFor("read", "readingBoard");
  }
  if (name === "pt-screenshot") return kindFor("read", "capturingScreenshot");
  if (name === "pt-ptx-apply") return kindFor("edit", "applyingPtx");
  if (name === "pt-doc-init" || name === "pt-doc-open" || name === "pt-doc-save") {
    return kindFor("edit", "workingOnBoard");
  }
  return kindFor("edit", "workingOnBoard");
}
