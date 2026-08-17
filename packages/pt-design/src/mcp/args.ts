export type McpFileArg =
  | { ok: true; file: string | undefined }
  | { ok: false; error: string };

/** `--file` / `-f` win over `PT_DESIGN_FILE`. A bare or dashed value is usage, not env fallback. */
export function parseMcpFileArg(argv: string[], envFile?: string): McpFileArg {
  const fileFlag = argv.findIndex((arg) => arg === "--file" || arg === "-f");
  if (fileFlag < 0) {
    return { ok: true, file: envFile || undefined };
  }
  const value = argv[fileFlag + 1];
  if (!value || value.startsWith("-")) {
    return { ok: false, error: "pt-design-mcp: --file requires a path" };
  }
  return { ok: true, file: value };
}

/** Returns an exit code when the process should stop; `undefined` if `serve` is still running. */
export async function startMcpFromArgv(
  argv: string[],
  envFile: string | undefined,
  serve: (file?: string) => Promise<void>,
): Promise<number | undefined> {
  const parsed = parseMcpFileArg(argv, envFile);
  if (!parsed.ok) {
    console.error(parsed.error);
    return 2;
  }
  try {
    await serve(parsed.file);
    return undefined;
  } catch (error) {
    console.error(error);
    return 1;
  }
}
