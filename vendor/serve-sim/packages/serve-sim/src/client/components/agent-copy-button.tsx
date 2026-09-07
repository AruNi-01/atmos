import { useEffect, useRef, useState } from "react";
import { Bot } from "lucide-react";
import { SimulatorToolbar } from "../simulator";

export const ATMOS_SIMULATOR_AGENT_COPY_MESSAGE = "atmos:simulator-agent-copy";
export const ATMOS_SIMULATOR_AGENT_COPIED_MESSAGE = "atmos:simulator-agent-copied";
export const ATMOS_SIMULATOR_AGENT_LABELS_MESSAGE = "atmos:simulator-agent-labels";

export const AGENT_COPY_TOOLTIP_EN =
  "Copy the prompt for Agent to operate this device";
export const AGENT_COPY_TOOLTIP_ZH = "复制 prompt 给 Agent，用于操作这台设备";

function langFromLocation(): string {
  if (typeof window === "undefined") return "";
  return new URLSearchParams(window.location.search).get("lang") ?? "";
}

export function agentCopyLabels(lang?: string | null): { tooltip: string; copied: string } {
  const tag = (lang || langFromLocation()).toLowerCase();
  if (tag.startsWith("zh")) {
    return { tooltip: AGENT_COPY_TOOLTIP_ZH, copied: "已复制" };
  }
  return { tooltip: AGENT_COPY_TOOLTIP_EN, copied: "Copied" };
}

function labelsFromMessage(data: unknown): { tooltip: string; copied: string } | null {
  if (!data || typeof data !== "object") return null;
  const rec = data as Record<string, unknown>;
  if (rec.type !== ATMOS_SIMULATOR_AGENT_LABELS_MESSAGE) return null;
  const tooltip = typeof rec.tooltip === "string" ? rec.tooltip.trim() : "";
  const copied = typeof rec.copied === "string" ? rec.copied.trim() : "";
  if (!tooltip || !copied) return null;
  return { tooltip, copied };
}

export function requestAtmosSimulatorAgentCopy() {
  if (window.parent && window.parent !== window) {
    window.parent.postMessage({ type: ATMOS_SIMULATOR_AGENT_COPY_MESSAGE }, "*");
  }
}

export function AgentCopyButton() {
  const [labels, setLabels] = useState(() => agentCopyLabels());
  const [copied, setCopied] = useState(false);
  const copiedTimerRef = useRef<number | null>(null);

  useEffect(() => {
    const onMessage = (event: MessageEvent) => {
      const nextLabels = labelsFromMessage(event.data);
      if (nextLabels) {
        setLabels(nextLabels);
        return;
      }
      if (event.data?.type !== ATMOS_SIMULATOR_AGENT_COPIED_MESSAGE) return;
      setCopied(true);
      if (copiedTimerRef.current != null) {
        window.clearTimeout(copiedTimerRef.current);
      }
      copiedTimerRef.current = window.setTimeout(() => {
        setCopied(false);
        copiedTimerRef.current = null;
      }, 2000);
    };
    window.addEventListener("message", onMessage);
    return () => {
      window.removeEventListener("message", onMessage);
      if (copiedTimerRef.current != null) {
        window.clearTimeout(copiedTimerRef.current);
      }
    };
  }, []);

  const tooltip = copied ? labels.copied : labels.tooltip;

  return (
    <SimulatorToolbar.Button
      forceEnabled
      aria-label={labels.tooltip}
      title={tooltip}
      tooltip={tooltip}
      tooltipWrap
      tooltipAlign="end"
      tooltipForceVisible={copied}
      onClick={() => requestAtmosSimulatorAgentCopy()}
    >
      <Bot size={19} strokeWidth={2} />
    </SimulatorToolbar.Button>
  );
}
