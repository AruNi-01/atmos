import { fsApi } from "@/api/ws-api";

// Long prompts typed into a PTY are unreliable: macOS canonical-mode TTYs cap
// input lines at 1024 bytes, and interactive shells drop keystrokes while
// still initializing. Store the full prompt in a workspace file and hand the
// agent a short pointer prompt instead.
const AGENT_FIX_INLINE_PROMPT_MAX_CHARS = 600;
const AGENT_FIX_INLINE_PROMPT_MAX_LINES = 10;

export function shouldUseAgentFixPromptFile(prompt: string): boolean {
  if (prompt.length > AGENT_FIX_INLINE_PROMPT_MAX_CHARS) return true;
  let lines = 1;
  for (let i = 0; i < prompt.length; i += 1) {
    if (prompt[i] === "\n" && ++lines > AGENT_FIX_INLINE_PROMPT_MAX_LINES) return true;
  }
  return false;
}

export function buildAgentFixPromptFilePath(rootPath: string, timestampMs: number): string {
  const normalizedRoot = rootPath.trim().replace(/[\\/]+$/, "");
  return `${normalizedRoot}/.atmos/tmp/agent-fix/fix_${timestampMs}.md`;
}

export function buildAgentFixPointerPrompt(promptFilePath: string): string {
  return [
    "The full task instructions are stored in a local file because they are too long to pass on the command line.",
    `Read the file ${promptFilePath} first, then complete the task it describes.`,
    "Treat the file content as the task prompt. Delete the file after the task is done.",
  ].join("\n");
}

/**
 * Resolve the prompt to pass to the terminal agent launch command.
 * Long prompts are written to `<root>/.atmos/tmp/agent-fix/` and replaced by a
 * short pointer prompt; on write failure the original prompt is returned so
 * the launch still proceeds (falling back to bracketed paste delivery).
 */
export async function resolveAgentFixLaunchPrompt(
  prompt: string,
  rootPath: string | null | undefined,
): Promise<string> {
  const trimmedRoot = rootPath?.trim();
  if (!trimmedRoot || !shouldUseAgentFixPromptFile(prompt)) {
    return prompt;
  }
  const promptFilePath = buildAgentFixPromptFilePath(trimmedRoot, Date.now());
  try {
    await fsApi.writeFile(promptFilePath, prompt);
    return buildAgentFixPointerPrompt(promptFilePath);
  } catch (error) {
    console.warn(
      "Failed to write Agent Fix prompt file; falling back to inline prompt",
      error,
    );
    return prompt;
  }
}
