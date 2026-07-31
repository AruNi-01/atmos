import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { isWsAction, WS_ACTIONS } from "./actions";
import { extractWsActionsFromMessageRs } from "../../scripts/extract-ws-actions";
import { diffActionSets } from "../../scripts/check-ws-actions";

const __dirname = dirname(fileURLToPath(import.meta.url));
const packageRoot = join(__dirname, "../..");
const messageRs = join(packageRoot, "../../apps/api/src/api/ws/message.rs");
const fixturePath = join(packageRoot, "fixtures/actions.server.json");

describe("@atmos/api-types actions", () => {
  test("WS_ACTIONS has unique entries covering the union source", () => {
    expect(WS_ACTIONS.length).toBeGreaterThan(100);
    expect(new Set(WS_ACTIONS).size).toBe(WS_ACTIONS.length);
    expect(isWsAction("fs_get_home_dir")).toBe(true);
    expect(isWsAction("not_a_real_action")).toBe(false);
  });

  test("fixture matches live Rust WsAction extract", () => {
    const source = readFileSync(messageRs, "utf8");
    const extracted = extractWsActionsFromMessageRs(source);
    const fixture = JSON.parse(readFileSync(fixturePath, "utf8")) as string[];
    expect(fixture).toEqual(extracted);
  });

  test("TS catalog matches server fixture (aligned)", () => {
    const fixture = JSON.parse(readFileSync(fixturePath, "utf8")) as string[];
    const { missingInTs, extraInTs } = diffActionSets(WS_ACTIONS, fixture);
    expect(missingInTs).toEqual([]);
    expect(extraInTs).toEqual([]);
  });

  test("drift gate reports intentional mismatch", () => {
    const fixture = JSON.parse(readFileSync(fixturePath, "utf8")) as string[];
    const { missingInTs } = diffActionSets(
      WS_ACTIONS.filter((a) => a !== "fs_get_home_dir"),
      fixture,
    );
    expect(missingInTs).toContain("fs_get_home_dir");
  });

  test("includes server-only terminal_workspace_candidates", () => {
    expect(WS_ACTIONS).toContain("terminal_workspace_candidates");
  });
});
