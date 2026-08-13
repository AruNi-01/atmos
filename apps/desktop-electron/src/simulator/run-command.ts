import { spawn } from "node:child_process";
import type { CommandResult, CommandOpts, CommandRunner } from "./command-runner.ts";

export function defaultCommandRunner(): CommandRunner {
  return (cmd, args, opts = {}) => runCommand(cmd, args, opts);
}

export function runCommand(
  cmd: string,
  args: string[],
  opts: CommandOpts = {},
): Promise<CommandResult> {
  return new Promise((resolve) => {
    const child = spawn(cmd, args, {
      env: opts.env ?? process.env,
      stdio: ["ignore", "pipe", "pipe"],
    });
    let stdout = "";
    let stderr = "";
    const timer =
      opts.timeoutMs && opts.timeoutMs > 0
        ? setTimeout(() => {
            child.kill("SIGKILL");
          }, opts.timeoutMs)
        : null;
    child.stdout?.on("data", (c) => {
      stdout += String(c);
    });
    child.stderr?.on("data", (c) => {
      stderr += String(c);
    });
    child.on("close", (code) => {
      if (timer) clearTimeout(timer);
      resolve({ code: code ?? 1, stdout, stderr });
    });
    child.on("error", (error) => {
      if (timer) clearTimeout(timer);
      resolve({ code: 127, stdout: "", stderr: error.message });
    });
  });
}
