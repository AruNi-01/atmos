import { isPtDesignError, cliExitCode, PT_ERROR_CODES, PtDesignError } from "../agent/errors";
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

function parseAt(value: unknown): { x: number; y: number } {
  if (typeof value !== "string") return { x: 0, y: 0 };
  const [xs, ys] = value.split(",");
  return { x: Number(xs) || 0, y: Number(ys) || 0 };
}

function parseProps(flags: Record<string, string | boolean>): Record<string, string | number | boolean | null> {
  if (typeof flags.props === "string") {
    try {
      return JSON.parse(flags.props) as Record<string, string | number | boolean | null>;
    } catch {
      throw new PtDesignError(PT_ERROR_CODES.INVALID_JSON, "Invalid --props JSON");
    }
  }
  const props: Record<string, string | number | boolean | null> = {};
  if (typeof flags.label === "string") props.label = flags.label;
  if (typeof flags.placeholder === "string") props.placeholder = flags.placeholder;
  if (typeof flags.title === "string") props.title = flags.title;
  return props;
}

function resolveTool(tokens: string[]): { name: ToolName; rest: string[] } {
  if (tokens[0] && tokens[1] && toolNameFromCli([tokens[0], tokens[1]])) {
    return { name: toolNameFromCli([tokens[0], tokens[1]])!, rest: tokens.slice(2) };
  }
  if (tokens[0] && toolNameFromCli([tokens[0]])) {
    return { name: toolNameFromCli([tokens[0]])!, rest: tokens.slice(1) };
  }
  throw new PtDesignError(
    PT_ERROR_CODES.USAGE,
    `Unknown command: ${tokens.join(" ") || "(empty)"}. Try: catalog list | place | ir get | doc init`,
  );
}

export async function runCli(argv = process.argv.slice(2)): Promise<number> {
  try {
    const parsed = parseArgs(argv);
    if (parsed.tokens[0] === "live") {
      throw new PtDesignError(
        PT_ERROR_CODES.USAGE,
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
    const create =
      name === "pt_doc_init" ||
      name === "pt_place" ||
      parsed.flags.create === true;
    if (toolRequiresOfflineFile(name) && !parsed.file) {
      throw new PtDesignError(PT_ERROR_CODES.MISSING_FILE, OFFLINE_FILE_REQUIRED_MESSAGE);
    }
    const fs = openFileSession({
      file: parsed.file,
      create,
      autoSave: true,
    });
    const args: Record<string, unknown> = { ...parsed.flags, file: parsed.file };
    if (name === "pt_place") {
      args.componentType = rest[0] ?? parsed.flags.type;
      args.at = parseAt(parsed.flags.at);
      args.props = parseProps(parsed.flags);
      args.frame = parsed.flags.frame;
      args.variant = parsed.flags.variant;
      args.mode = parsed.flags.mode;
      args.below = parsed.flags.below;
      args.rightOf = parsed.flags.rightOf;
    }
    if (name === "pt_update") {
      args.instanceId = rest[0] ?? parsed.flags.instanceId;
      args.props = parseProps(parsed.flags);
      args.variant = parsed.flags.variant;
      if (parsed.flags.x != null || parsed.flags.y != null || parsed.flags.w != null || parsed.flags.h != null) {
        args.bbox = {
          x: parsed.flags.x,
          y: parsed.flags.y,
          w: parsed.flags.w,
          h: parsed.flags.h,
        };
      }
      args.frameId = parsed.flags.frameId ?? parsed.flags.frame;
    }
    if (name === "pt_delete") {
      args.instanceId = rest[0] ?? parsed.flags.instanceId;
    }
    if (name === "pt_frame_update" || name === "pt_frame_delete") {
      args.frameId = rest[0] ?? parsed.flags.frameId ?? parsed.flags.frame;
    }
    if (name === "pt_layout_row" || name === "pt_layout_column" || name === "pt_layout_grid") {
      args.instanceIds =
        typeof parsed.flags.instanceIds === "string"
          ? parsed.flags.instanceIds.split(",").map((id) => id.trim()).filter(Boolean)
          : rest;
    }
    if (name === "pt_batch" && typeof parsed.flags.ops === "string") {
      try {
        args.ops = JSON.parse(parsed.flags.ops);
      } catch {
        throw new PtDesignError(PT_ERROR_CODES.INVALID_JSON, "Invalid --ops JSON");
      }
    }
    if (name === "pt_handoff") {
      args.scope = parsed.flags.scope ?? "document";
      args.frame = parsed.flags.frame;
    }
    if (name === "pt_ir_get") {
      args.frame = parsed.flags.frame;
    }
    const data = runTool(fs, { name, args });
    const out = { ok: true as const, data };
    process.stdout.write(`${JSON.stringify(out)}\n`);
    return 0;
  } catch (error) {
    if (isPtDesignError(error)) {
      process.stderr.write(`${error.code}: ${error.message}\n`);
      process.stdout.write(`${JSON.stringify({ ok: false, error: { code: error.code, message: error.message } })}\n`);
      return cliExitCode(error.code);
    }
    const message = error instanceof Error ? error.message : String(error);
    process.stderr.write(`${message}\n`);
    process.stdout.write(
      `${JSON.stringify({ ok: false, error: { code: PT_ERROR_CODES.INTERNAL, message } })}\n`,
    );
    return 4;
  }
}
