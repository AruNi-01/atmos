import { existsSync } from "fs";

/** Bun `--compile` maps the binary into this virtual tree. `/bin/sh` cannot see it. */
export function isBunVirtualPath(path: string): boolean {
  return path.includes("/$bunfs/");
}

function shellQuote(path: string): string {
  if (/^[A-Za-z0-9_./:-]+$/.test(path)) return path;
  return `'${path.replace(/'/g, `'\\''`)}'`;
}

/** On-disk serve-sim entry. Never a `/$bunfs/` path. */
export function hostServeSimBin(): string {
  const candidates = [process.execPath, process.argv[0], process.argv[1]].filter(
    (path): path is string => typeof path === "string" && path.length > 0,
  );
  for (const path of candidates) {
    if (isBunVirtualPath(path)) continue;
    try {
      if (existsSync(path)) return path;
    } catch {}
  }
  return "serve-sim";
}

/**
 * Preview tools shell out to `serve-sim …` or a bunfs path injected into
 * `__SIM_PREVIEW__.serveSimBin`. Rewrite both to the real binary.
 */
export function rewriteHostCommand(command: string, bin = hostServeSimBin()): string {
  const quoted = shellQuote(bin);
  const bunfs = /^(?:['"]?)\/\$bunfs\/[^\s'"]+(?:['"]?)(?=\s|$)/;
  if (bunfs.test(command)) return command.replace(bunfs, quoted);
  if (/^serve-sim(?=\s|$)/.test(command)) return command.replace(/^serve-sim/, quoted);
  return command;
}

/** True when the command would stop every serve-sim stream, not one device. */
export function isGlobalServeSimKill(command: string): boolean {
  const rewritten = rewriteHostCommand(command);
  const tokens = rewritten.match(/(?:'[^']*'|"[^"]*"|\S)+/g) ?? [];
  const args = tokens.slice(1).map((token) => token.replace(/^['"]|['"]$/g, ""));
  return args.length === 1 && (args[0] === "--kill" || args[0] === "-k");
}
