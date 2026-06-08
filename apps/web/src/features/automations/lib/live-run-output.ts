import type {
  AutomationArtifactResponse,
  AutomationRunOutputEvent,
} from "@/features/automations/types";

export type LiveRunOutputBuffer = {
  final: string;
};

export function appendMissingText(content: string, liveContent: string) {
  if (!liveContent) {
    return content;
  }
  if (!content) {
    return liveContent;
  }
  if (content.endsWith(liveContent)) {
    return content;
  }

  const maxOverlap = Math.min(content.length, liveContent.length);
  for (let length = maxOverlap; length > 0; length -= 1) {
    if (content.endsWith(liveContent.slice(0, length))) {
      return `${content}${liveContent.slice(length)}`;
    }
  }

  return `${content}${liveContent}`;
}

export function mergeLiveOutputIntoArtifact(
  artifact: AutomationArtifactResponse,
  liveOutput: LiveRunOutputBuffer | undefined,
) {
  if (!liveOutput) {
    return artifact;
  }

  if (artifact.artifact === "final") {
    const content = appendMissingText(artifact.content, liveOutput.final);
    return content === artifact.content ? artifact : { ...artifact, content };
  }

  return artifact;
}

export function finalChunkFromEvent(event: AutomationRunOutputEvent) {
  return event.final_chunk ? event.chunk : "";
}
