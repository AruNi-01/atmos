import type { AgentMessage, AgentPart } from "@atmos/api-types/ws/dto/agent-chat";
import type { BackgroundToolProbe } from "./types";

export function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null;
}

export function flagTrue(record: Record<string, unknown> | null, keys: string[]): boolean {
  if (!record) return false;
  for (const key of keys) {
    const value = record[key];
    if (value === true || value === 1 || value === "true") return true;
  }
  return false;
}

export function nestedRecords(value: unknown): Record<string, unknown>[] {
  const record = asRecord(value);
  if (!record) return [];
  const nested = [record];
  for (const key of ["args", "parameters", "input", "Content", "content"]) {
    const child = asRecord(record[key]);
    if (child) nested.push(child);
  }
  return nested;
}

export function commandFromProbe(probe: BackgroundToolProbe): string {
  for (const record of [...nestedRecords(probe.input), ...nestedRecords(probe.output)]) {
    for (const key of ["command", "cmd"]) {
      const value = record[key];
      if (typeof value === "string" && value.trim()) return value.trim();
    }
  }
  const title = (probe.title ?? "").trim();
  return title.replace(/^\[bg\]\s*/i, "").replace(/^execute\s*:\s*/i, "").trim();
}

export function envelopeType(value: unknown): string {
  const record = asRecord(value);
  const type = typeof record?.type === "string"
    ? record.type
    : typeof record?.variant === "string"
      ? record.variant
      : "";
  return type.trim().toLowerCase().replace(/[\s-]+/g, "_");
}

export function normalizeName(value?: string | null): string {
  return (value || "").trim().toLowerCase().replace(/[\s-]+/g, "_");
}

export function isActiveStatus(status?: string | null): boolean {
  const value = (status ?? "").trim().toLowerCase();
  return value === "running" || value === "in_progress" || value === "pending";
}

export function mapAssistantToolParts(
  messages: AgentMessage[],
  update: (part: Extract<AgentPart, { type: "tool_call" }>) => Extract<AgentPart, { type: "tool_call" }>,
): AgentMessage[] {
  return messages.map((message) => {
    if (message.role !== "assistant") return message;
    let changed = false;
    const parts = message.parts.map((part) => {
      if (part.type !== "tool_call") return part;
      const next = update(part);
      if (next !== part) changed = true;
      return next;
    });
    return changed ? { ...message, parts } : message;
  });
}
