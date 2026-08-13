import type { StreamCodec, StreamTransport } from "./types.ts";

const STRIP_ENV = [
  "ATMOS_LOCAL_TOKEN",
  "ATMOS_API_TOKEN",
  "GITHUB_TOKEN",
  "GH_TOKEN",
  "GIT_ASKPASS",
  "GIT_TERMINAL_PROMPT",
];

export type SpawnArgOpts = {
  port: number;
  simulatorId: string;
  transport: StreamTransport;
  codec: StreamCodec | "auto";
};

export function buildHelperArgv(opts: SpawnArgOpts): string[] {
  return [
    "--no-preview",
    "--detach",
    "-q",
    "--host",
    "127.0.0.1",
    "-p",
    String(opts.port),
    "--transport",
    opts.transport,
    "--codec",
    opts.codec,
    "--",
    opts.simulatorId,
  ];
}

export function stripHelperEnv(
  env: NodeJS.ProcessEnv = process.env,
): NodeJS.ProcessEnv {
  const next: NodeJS.ProcessEnv = { ...env };
  for (const key of STRIP_ENV) {
    delete next[key];
  }
  next.ELECTRON_RUN_AS_NODE = "1";
  next.ELECTRON_NO_ATTACH_CONSOLE = "1";
  return next;
}

export function assertSpawnSafety(argv: string[]): void {
  if (!argv.includes("--no-preview")) {
    throw new Error("helper spawn must pass --no-preview");
  }
  const hostIdx = argv.indexOf("--host");
  if (hostIdx < 0 || argv[hostIdx + 1] !== "127.0.0.1") {
    throw new Error("helper spawn must bind 127.0.0.1");
  }
}
