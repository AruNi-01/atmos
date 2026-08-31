import type { AgentMessage } from "@atmos/api-types/ws/dto/agent-chat";
import type { BackgroundCommand, BackgroundCommandAdapter, BackgroundToolProbe } from "../types";
import {
  asRecord,
  commandFromProbe,
  envelopeType,
  flagTrue,
  isActiveStatus,
  mapAssistantToolParts,
  nestedRecords,
  normalizeName,
} from "../utils";

const POLL_FOOTER_RE = /\n*Use timeout_ms to wait[\s\S]*$/i;
const BG_TITLE_RE = /^\[bg\]/i;

function grokFlag(probe: BackgroundToolProbe): boolean {
  return nestedRecords(probe.input).some((record) => flagTrue(record, ["is_background", "background"]));
}

function taskIdFromOutput(output: unknown): string | null {
  const record = asRecord(output);
  if (!record) return null;
  if (typeof record.task_id === "string" && record.task_id.trim()) return record.task_id.trim();
  const result = asRecord(record.Result);
  if (typeof result?.task_id === "string" && result.task_id.trim()) return result.task_id.trim();
  return null;
}

function innerTaskStatus(output: unknown): string | null {
  const record = asRecord(output);
  if (!record) return null;
  if (envelopeType(record) === "backgroundtaskstarted" && typeof record.status === "string") {
    return record.status.trim().toLowerCase();
  }
  const result = asRecord(record.Result);
  if (typeof result?.status === "string") return result.status.trim().toLowerCase();
  return null;
}

function cleanOutput(text: string): string {
  return text.replace(POLL_FOOTER_RE, "").trimEnd();
}

function pollResults(probe: BackgroundToolProbe): Array<Record<string, unknown>> {
  const output = asRecord(probe.output);
  if (!output) return [];
  if (envelopeType(output) !== "taskoutput" && normalizeName(probe.name) !== "taskoutput") {
    return [];
  }
  const result = asRecord(output.Result);
  if (result) return [result];
  const multi = asRecord(output.MultiResult);
  const results = Array.isArray(multi?.results) ? multi.results : [];
  return results.flatMap((item) => {
    const row = asRecord(item);
    return row ? [row] : [];
  });
}

export const grokBackgroundAdapter: BackgroundCommandAdapter = {
  detect(probe) {
    const name = normalizeName(probe.name);
    const outputType = envelopeType(probe.output);
    const title = (probe.title ?? "").trim();
    const isGrokBg = grokFlag(probe)
      || BG_TITLE_RE.test(title)
      || name === "backgroundtaskstarted"
      || outputType === "backgroundtaskstarted";
    if (!isGrokBg) return null;
    const inner = innerTaskStatus(probe.output);
    const command = commandFromProbe(probe);
    return {
      command,
      taskId: taskIdFromOutput(probe.output),
      running: inner ? inner === "running" : isActiveStatus(probe.status),
    } satisfies BackgroundCommand;
  },

  isPoll(probe) {
    return normalizeName(probe.name) === "taskoutput"
      || envelopeType(probe.input) === "taskoutput"
      || envelopeType(probe.output) === "taskoutput";
  },

  applyPoll(messages: AgentMessage[], probe: BackgroundToolProbe) {
    const results = pollResults(probe);
    if (results.length === 0) return messages;
    return results.reduce((next, result) => applyGrokTaskResult(next, result), messages);
  },
};

function applyGrokTaskResult(
  messages: AgentMessage[],
  result: Record<string, unknown>,
): AgentMessage[] {
  const taskId = typeof result.task_id === "string" ? result.task_id.trim() : "";
  const command = typeof result.command === "string" ? result.command.trim() : "";
  const outputFile = typeof result.output_file === "string" ? result.output_file : "";
  const innerStatus = typeof result.status === "string" ? result.status.trim().toLowerCase() : "";
  const rawOutput = typeof result.output === "string" ? cleanOutput(result.output) : "";
  const completed = innerStatus === "completed" || innerStatus === "failed" || innerStatus === "not_found";
  const failed = innerStatus === "failed";

  return mapAssistantToolParts(messages, (part) => {
    if (!matchesGrokTask(part, taskId, command, outputFile)) return part;
    const nextStatus = completed ? (failed ? "failed" : "completed") : "running";
    return {
      ...part,
      status: nextStatus,
      output: {
        type: "Bash",
        command: command || commandFromProbe(part),
        output: rawOutput,
        task_id: taskId || undefined,
        exit_code: failed ? 1 : completed ? 0 : null,
      },
    };
  });
}

function matchesGrokTask(
  part: { tool_call_id: string; title?: string | null; input?: unknown; output?: unknown },
  taskId: string,
  command: string,
  outputFile: string,
): boolean {
  if (taskId && taskIdFromOutput(part.output) === taskId) return true;
  if (taskId && part.tool_call_id === taskId) return true;
  if (outputFile && outputFile.includes(part.tool_call_id)) return true;
  if (command) {
    const partCommand = commandFromProbe(part);
    if (partCommand && partCommand === command && grokBackgroundAdapter.detect(part)) return true;
  }
  return false;
}
