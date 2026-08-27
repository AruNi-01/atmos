import { formatEmbedForAgent } from "../embed/format";
import { AGENT_REQUEST_BODY_CAP_BYTES, type AgentRequest } from "./types";
import { MD_LIVE_FENCE_CLOSE, MD_LIVE_FENCE_OPEN } from "./fence";

function byteLength(text: string): number {
  return new TextEncoder().encode(text).length;
}

function clipBody(markdown: string, truncated: boolean): { body: string; truncated: boolean } {
  if (truncated || byteLength(markdown) <= AGENT_REQUEST_BODY_CAP_BYTES) {
    return { body: markdown, truncated };
  }
  let lo = 0;
  let hi = markdown.length;
  while (lo < hi) {
    const mid = Math.ceil((lo + hi) / 2);
    if (byteLength(markdown.slice(0, mid)) <= AGENT_REQUEST_BODY_CAP_BYTES) lo = mid;
    else hi = mid - 1;
  }
  return { body: markdown.slice(0, lo), truncated: true };
}

function referencesBlock(request: AgentRequest): string {
  if (request.references.length === 0) return "";
  const lines = request.references.map((ref) => `- ${formatEmbedForAgent(ref)}`);
  return `[References]\n${lines.join("\n")}`;
}

function workspaceBlock(request: AgentRequest): string {
  const bits: string[] = [];
  if (request.workspace) {
    bits.push(`Workspace: ${request.workspace.name} (${request.workspace.path})`);
  }
  if (request.project) {
    bits.push(`Project: ${request.project.name} (${request.project.path})`);
  }
  if (request.branch) {
    bits.push(`Branch: ${request.branch}`);
  }
  if (bits.length === 0) return "";
  return `[Workspace]\n${bits.join("\n")}`;
}

function selectionBlock(request: AgentRequest): string {
  if (!request.selection?.markdown) return "";
  const heading = request.selection.heading
    ? `Heading: ${request.selection.heading}\n`
    : "";
  return `[Selection]\n${heading}${request.selection.markdown}`;
}

export function renderAgentPrompt(request: AgentRequest): string {
  const sections: string[] = [];
  const { body, truncated } = clipBody(request.document.markdown, request.document.truncated);

  if (request.execution.kind === "copy") {
    sections.push(`[Context]\nPath: ${request.document.path}`);
    if (truncated) {
      sections.push("(Document body truncated.)");
    }
    const selection = selectionBlock(request);
    if (selection) sections.push(selection);
    const refs = referencesBlock(request);
    if (refs) sections.push(refs);
    const ws = workspaceBlock(request);
    if (ws) sections.push(ws);
    if (request.instruction.trim()) {
      sections.unshift(request.instruction.trim());
    }
    return sections.join("\n\n");
  }

  const outputKind = request.outputHint === "text" ? "text" : "markdown";
  sections.push(`[Instructions]\n${request.instruction.trim()}`);
  sections.push(
    [
      "[Output contract]",
      "Do not modify the document file on disk. Do not use file tools on:",
      `  ${request.document.path}`,
      `Return ONLY the replacement ${outputKind} wrapped exactly as:`,
      "",
      MD_LIVE_FENCE_OPEN,
      `...${outputKind}...`,
      MD_LIVE_FENCE_CLOSE,
      "",
      "No tool traces, no commentary outside the fence.",
    ].join("\n"),
  );
  const docLines = [`[Document]\nPath: ${request.document.path}`];
  if (truncated) docLines.push("(truncated)");
  docLines.push(body);
  sections.push(docLines.join("\n"));
  const selection = selectionBlock(request);
  if (selection) sections.push(selection);
  const refs = referencesBlock(request);
  if (refs) sections.push(refs);
  const ws = workspaceBlock(request);
  if (ws) sections.push(ws);
  return sections.join("\n\n");
}
