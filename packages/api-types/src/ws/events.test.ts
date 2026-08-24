import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { isWsEvent, WS_EVENTS } from "./events";
import { extractWsEventsFromMessageRs } from "../../scripts/extract-ws-actions";
import { diffActionSets } from "../../scripts/check-ws-actions";

const __dirname = dirname(fileURLToPath(import.meta.url));
const packageRoot = join(__dirname, "../..");
const messageRs = join(packageRoot, "../../apps/api/src/api/ws/message.rs");
const fixturePath = join(packageRoot, "fixtures/events.server.json");

describe("@atmos/api-types events", () => {
  test("WS_EVENTS has unique entries", () => {
    expect(WS_EVENTS.length).toBe(30);
    expect(new Set(WS_EVENTS).size).toBe(WS_EVENTS.length);
    expect(isWsEvent("workspace_setup_progress")).toBe(true);
    expect(isWsEvent("not_a_real_event")).toBe(false);
  });

  test("fixture matches live Rust WsEvent extract", () => {
    const source = readFileSync(messageRs, "utf8");
    const extracted = extractWsEventsFromMessageRs(source);
    const fixture = JSON.parse(readFileSync(fixturePath, "utf8")) as string[];
    expect(fixture).toEqual(extracted);
  });

  test("TS catalog matches server fixture", () => {
    const fixture = JSON.parse(readFileSync(fixturePath, "utf8")) as string[];
    const { missingInTs, extraInTs } = diffActionSets(WS_EVENTS, fixture);
    expect(missingInTs).toEqual([]);
    expect(extraInTs).toEqual([]);
  });

  test("drift gate reports intentional mismatch", () => {
    const fixture = JSON.parse(readFileSync(fixturePath, "utf8")) as string[];
    const { missingInTs } = diffActionSets(
      WS_EVENTS.filter((event) => event !== "workspace_setup_progress"),
      fixture,
    );
    expect(missingInTs).toContain("workspace_setup_progress");
  });
});
