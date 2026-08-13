export type CommandResult = {
  code: number;
  stdout: string;
  stderr: string;
};

export type CommandOpts = {
  timeoutMs?: number;
  env?: NodeJS.ProcessEnv;
};

export type CommandRunner = (
  cmd: string,
  args: string[],
  opts?: CommandOpts,
) => Promise<CommandResult>;

export type RecordedCall = {
  cmd: string;
  args: string[];
};

export function createMemoryRunner(
  impl: (
    cmd: string,
    args: string[],
  ) => CommandResult | Promise<CommandResult>,
): CommandRunner & { calls: RecordedCall[] } {
  const calls: RecordedCall[] = [];
  const runner = async (cmd: string, args: string[]) => {
    calls.push({ cmd, args });
    return impl(cmd, args);
  };
  return Object.assign(runner, { calls });
}

export function okResult(stdout = "", stderr = ""): CommandResult {
  return { code: 0, stdout, stderr };
}

export function failResult(stderr = "", code = 1): CommandResult {
  return { code, stdout: "", stderr };
}
