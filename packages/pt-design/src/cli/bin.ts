import { PtDesignError, type PtDesignErrorCode } from "../protocol";
import { openFileSession, runTool } from "../agent/api";
import { PT_DESIGN_TOOL_DEFS, toolNameFromCli, type ToolName } from "../agent/tool-defs";
import { OFFLINE_FILE_REQUIRED_MESSAGE, toolRequiresOfflineFile } from "../agent/file-required";

type Parsed = {
  tokens: string[];
  flags: Record<string, string | boolean>;
  json: boolean;
  file?: string;
};

function parseArgs(argv: string[]): Parsed {
  const tokens: string[] = [];
  const flags: Record<string, string | boolean> = {};
  let json = argv.includes("--json") || process.env.CI === "1";
  let file: string | undefined;
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i]!;
    if (arg === "--json") continue;
    if (arg === "--file" || arg === "-f") {
      file = argv[++i];
      continue;
    }
    if (arg.startsWith("--")) {
      const key = arg.slice(2);
      const next = argv[i + 1];
      if (!next || next.startsWith("--")) {
        flags[key] = true;
      } else {
        flags[key] = next;
        i++;
      }
      continue;
    }
    tokens.push(arg);
  }
  return { tokens, flags, json, file };
}

function resolveTool(tokens: string[]): { name: ToolName; rest: string[] } {
  if (tokens[0] && tokens[1] && toolNameFromCli([tokens[0], tokens[1]])) {
    return { name: toolNameFromCli([tokens[0], tokens[1]])!, rest: tokens.slice(2) };
  }
  if (tokens[0] && toolNameFromCli([tokens[0]])) {
    return { name: toolNameFromCli([tokens[0]])!, rest: tokens.slice(1) };
  }
  throw new PtDesignError(
    "unknown_tool",
    `Unknown command: ${tokens.join(" ") || "(empty)"}. Try: catalog list | ptx get | doc init`,
  );
}

function cliExitCode(code: PtDesignErrorCode): number {
  switch (code) {
    case "missing_file":
    case "path_denied":
      return 2;
    case "invalid_ptx":
    case "invalid_option":
    case "unknown_tool":
    case "unknown_type":
      return 1;
    default:
      return 4;
  }
}

export async function runCli(argv = process.argv.slice(2)): Promise<number> {
  try {
    const parsed = parseArgs(argv);
    if (parsed.tokens[0] === "live") {
      throw new PtDesignError(
        "unknown_tool",
        "The live CLI hub is gone. Open Prototype Design and POST /api/pt-design/agent/invoke. For an offline document, pass --file.",
      );
    }
    if (parsed.tokens.length === 0 || parsed.tokens[0] === "help") {
      const help = PT_DESIGN_TOOL_DEFS.map((d) => `  pt-design ${d.cli.join(" ")}`).join("\n");
      const payload = { ok: true, data: { help } };
      if (parsed.json) {
        process.stdout.write(`${JSON.stringify(payload)}\n`);
      } else {
        const { renderHelp } = await import("./help");
        renderHelp();
      }
      return 0;
    }
    const { name, rest } = resolveTool(parsed.tokens);
    const create = name === "pt_doc_init" || parsed.flags.create === true;
    if (toolRequiresOfflineFile(name) && !parsed.file) {
      throw new PtDesignError("missing_file", OFFLINE_FILE_REQUIRED_MESSAGE);
    }
    const fs = openFileSession({
      file: parsed.file,
      create,
      autoSave: true,
    });
    const args: Record<string, unknown> = { ...parsed.flags, file: parsed.file, path: parsed.file };
    if (name === "pt_ptx_apply") {
      args.ptx = typeof parsed.flags.ptx === "string" ? parsed.flags.ptx : rest[0];
    }
    const data = runTool(fs, { name, args });
    const out = { ok: true as const, data };
    process.stdout.write(`${JSON.stringify(out)}\n`);
    return 0;
  } catch (error) {
    if (error instanceof PtDesignError) {
      process.stderr.write(`${error.code}: ${error.message}\n`);
      process.stdout.write(`${JSON.stringify({ ok: false, error: { code: error.code, message: error.message } })}\n`);
      return cliExitCode(error.code);
    }
    const message = error instanceof Error ? error.message : String(error);
    process.stderr.write(`${message}\n`);
    process.stdout.write(`${JSON.stringify({ ok: false, error: { code: "unknown_tool", message } })}\n`);
    return 4;
  }
}
