import { homedir } from "node:os";
import { readFileSync } from "node:fs";
import { join } from "node:path";

/** Loopback Atmos Server from `~/.atmos/state/runtime_manifest.json`. */
export function resolveLocalCollabServer(): string | null {
  if (typeof process === "undefined") return null;
  const fromEnv =
    process.env.PT_DESIGN_COLLAB_URL?.trim() ||
    process.env.ATMOS_API_URL?.trim();
  if (fromEnv) return fromEnv;
  try {
    const home = process.env.ATMOS_HOME?.trim() || join(homedir(), ".atmos");
    const raw = readFileSync(join(home, "state", "runtime_manifest.json"), "utf8");
    const parsed = JSON.parse(raw) as { api?: { url?: string } };
    const url = parsed.api?.url?.trim();
    return url || null;
  } catch {
    return null;
  }
}
