// @ts-expect-error bun:test is available at runtime but not in tsconfig types
import { describe, expect, it } from "bun:test";
import {
  CLOUD_API_CLIENT_IDS,
  isCloudApiClient,
} from "@/features/token-usage/lib/cloud-api-clients";

describe("isCloudApiClient", () => {
  it("matches tokscale account-level usage dumps", () => {
    expect([...CLOUD_API_CLIENT_IDS].sort()).toEqual(["cursor", "trae", "warp"]);
    expect(isCloudApiClient("cursor")).toBe(true);
    expect(isCloudApiClient("TRAE")).toBe(true);
    expect(isCloudApiClient(" warp ")).toBe(true);
  });

  it("leaves per-machine session clients as local", () => {
    expect(isCloudApiClient("claude")).toBe(false);
    expect(isCloudApiClient("codex")).toBe(false);
    expect(isCloudApiClient("antigravity")).toBe(false);
    expect(isCloudApiClient("antigravity-cli")).toBe(false);
  });
});
