import { CanvasAgentError } from "./canvas-agent-errors";
import { MAX_APPLY_STEPS } from "./canvas-agent-bus-helpers";
import { ok, type CanvasAgentResult } from "./canvas-agent-bus-result";

type MutatingCommandRunner = (
  command: string,
  args: Record<string, unknown>,
) => CanvasAgentResult;

export function runCanvasAgentApply(
  args: Record<string, unknown>,
  runMutatingCommand: MutatingCommandRunner,
): CanvasAgentResult {
  const steps = args.commands ?? args.actions;
  if (!Array.isArray(steps) || steps.length === 0) {
    throw new CanvasAgentError(
      "VALIDATION_ARG",
      "apply requires a non-empty commands array",
      false,
    );
  }
  if (steps.length > MAX_APPLY_STEPS) {
    throw new CanvasAgentError(
      "VALIDATION_ARG",
      `apply accepts at most ${MAX_APPLY_STEPS} commands per request`,
      false,
    );
  }

  const results: Array<{
    command: string;
    success: boolean;
    data?: unknown;
    error_code?: string;
    error_message?: string;
  }> = [];

  for (const step of steps) {
    if (!step || typeof step !== "object") {
      throw new CanvasAgentError(
        "VALIDATION_ARG",
        "each apply step must be an object with command and args",
        false,
      );
    }
    const record = step as Record<string, unknown>;
    const subCommand = String(record.command ?? "").trim();
    if (!subCommand) {
      throw new CanvasAgentError(
        "VALIDATION_ARG",
        "each apply step must include command",
        false,
      );
    }
    if (subCommand === "apply") {
      throw new CanvasAgentError(
        "VALIDATION_ARG",
        "nested apply is not supported",
        false,
      );
    }
    const subArgs =
      record.args && typeof record.args === "object" && !Array.isArray(record.args)
        ? (record.args as Record<string, unknown>)
        : {};
    const res = runMutatingCommand(subCommand, subArgs);
    if (res.success) {
      results.push({ command: subCommand, success: true, data: res.data });
    } else {
      results.push({
        command: subCommand,
        success: false,
        error_code: res.error_code,
        error_message: res.error_message,
      });
      return ok({
        results,
        failed_at: results.length - 1,
        partial: true,
      });
    }
  }

  return ok({ results, partial: false });
}
