import { describe, expect, test } from "bun:test";
import { DEFAULT_WEB_HUB_URL, resolveWebHubUrl } from "../hub-url";

describe("resolveWebHubUrl", () => {
  test("defaults to production Hub when unset", () => {
    expect(resolveWebHubUrl("", "")).toBe(DEFAULT_WEB_HUB_URL);
    expect(resolveWebHubUrl(undefined, undefined)).toBe(DEFAULT_WEB_HUB_URL);
    expect(DEFAULT_WEB_HUB_URL).toBe("https://hub.atmos.land");
  });

  test("off disables Hub", () => {
    expect(resolveWebHubUrl("off", "")).toBe("");
    expect(resolveWebHubUrl("OFF", "https://ignored.example")).toBe("");
  });

  test("explicit env wins", () => {
    expect(resolveWebHubUrl("http://localhost:8787", "")).toBe(
      "http://localhost:8787",
    );
    expect(resolveWebHubUrl("", "https://from-atmos.example")).toBe(
      "https://from-atmos.example",
    );
  });
});
