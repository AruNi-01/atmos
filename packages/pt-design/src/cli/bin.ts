import { isPtDesignError, cliExitCode, PT_ERROR_CODES, PtDesignError } from "../agent/errors";
import { openFileSession, runTool } from "../agent/api";
import { PT_DESIGN_TOOL_DEFS, toolNameFromCli, type ToolName } from "../agent/tool-defs";
import { isMutatingTool } from "../live/event";

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
      const port = typeof parsed.flags.port === "string" ? Number(parsed.flags.port) : undefined;
      const { startLiveHub } = await import("../live/hub");
      const hub = await startLiveHub(Number.isFinite(port) ? port : undefined, { file: parsed.file });
      const payload = { ok: true as const, data: { url: hub.url, file: parsed.file ?? null } };
      process.stdout.write(`${JSON.stringify(payload)}\n`);
      process.stderr.write(
        `PT Design live hub ${hub.url}${parsed.file ? ` watching ${parsed.file}` : ""}\n`,
      );
      await new Promise<void>((resolve) => {
        const stop = () => {
          hub.stop();
          resolve();
        };
        process.once("SIGINT", stop);
        process.once("SIGTERM", stop);
      });
      return 0;
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
    if (name !== "pt_catalog_list" && name !== "pt_doc_init" && !parsed.file) {
      throw new PtDesignError(PT_ERROR_CODES.USAGE, "--file is required");
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
    }
    if (name === "pt_update") {
      args.instanceId = rest[0] ?? parsed.flags.instanceId;
      args.props = parseProps(parsed.flags);
      args.variant = parsed.flags.variant;
    }
    if (name === "pt_delete") {
      args.instanceId = rest[0] ?? parsed.flags.instanceId;
    }
    if (name === "pt_handoff") {
      args.scope = parsed.flags.scope ?? "document";
      args.frame = parsed.flags.frame;
    }
    if (name === "pt_ir_get") {
      args.frame = parsed.flags.frame;
    }
    const prev = fs.session.getScene();
    const data = runTool(fs, { name, args });
    if (isMutatingTool(name)) {
      const { buildLiveEvent } = await import("../live/event");
      const { publishLiveEvent } = await import("../live/publish");
      await publishLiveEvent(buildLiveEvent(fs, name, args, data, "cli", prev));
    }
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
