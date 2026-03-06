import type {
  AtmosSubAgentLabel,
  AtmosSubAgentMessage,
  SubAgentAdapter,
  SubAgentToolCallBlock,
} from "../types";
import {
  capitalizeWord,
  convertContentBlocks,
  escapeUnknownXmlLikeTags,
  looksLikeSubAgent,
  rawInputObject,
  sanitizeSubAgentMarkdown,
  toStatus,
  uniqueLabels,
} from "../utils";

function parseOutput(rawOutput: unknown): {
  resultMarkdown: string | null;
  labels: AtmosSubAgentLabel[];
} {
  if (!rawOutput || typeof rawOutput !== "object") {
    return { resultMarkdown: null, labels: [] };
  }

  const output = rawOutput as Record<string, unknown>;
  const labels: AtmosSubAgentLabel[] = [];
  const metadata = output.metadata && typeof output.metadata === "object"
    ? output.metadata as Record<string, unknown>
    : null;
  const model = metadata?.model && typeof metadata.model === "object"
    ? metadata.model as Record<string, unknown>
    : null;
  if (typeof model?.modelID === "string" || typeof model?.providerID === "string") {
    labels.push({
      key: "model",
      value: [model?.modelID, model?.providerID].filter((v): v is string => typeof v === "string" && v.length > 0).join(" · "),
    });
  }
  if (typeof metadata?.sessionId === "string") {
    labels.push({ key: "session", value: metadata.sessionId });
  }
  if (typeof metadata?.truncated === "boolean") {
    labels.push({ key: "status", value: metadata.truncated ? "truncated" : "complete" });
  }

  let resultMarkdown: string | null = null;
  if (typeof output.output === "string") {
    const text = output.output;
    const taskIdMatch = text.match(/task_id:\s*([^\s]+)/i);
    if (taskIdMatch?.[1]) labels.push({ key: "task", value: taskIdMatch[1] });
    const resultMatch = text.match(/<task_result>\s*([\s\S]*?)\s*<\/task_result>/i);
    resultMarkdown = sanitizeSubAgentMarkdown(resultMatch?.[1] ?? text);
  }

  return {
    resultMarkdown: escapeUnknownXmlLikeTags(resultMarkdown),
    labels: uniqueLabels(labels.filter((item) => item.value)),
  };
}

function filterOpenCodeContent(block: SubAgentToolCallBlock) {
  return (block.content ?? []).filter((item) => {
    if (item.type !== "text") return true;
    return !item.text.includes("<task_result>") && !item.text.includes("task_id:");
  });
}

export const opencodeSubAgentAdapter: SubAgentAdapter = {
  canHandle(block, vendor) {
    return vendor === "opencode" && looksLikeSubAgent(block);
  },
  normalize(block, vendor, _childToolCalls): AtmosSubAgentMessage | null {
    if (!looksLikeSubAgent(block)) return null;
    const input = rawInputObject(block);
    const description = String(input.description ?? block.description ?? "");
    const prompt = typeof input.prompt === "string" ? input.prompt : null;
    const kind = typeof input.subagent_type === "string" ? input.subagent_type : "agent";
    const parsed = parseOutput(block.raw_output);

    return {
      id: block.tool_call_id,
      vendor,
      title: `${capitalizeWord(kind)} Agent`,
      description,
      prompt,
      status: toStatus(block.status),
      contentBlocks: convertContentBlocks(filterOpenCodeContent(block)),
      resultMarkdown: parsed.resultMarkdown,
      labels: parsed.labels,
      childToolCalls: [],
    };
  },
};
