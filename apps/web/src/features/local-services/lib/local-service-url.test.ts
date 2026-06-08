import { describe, expect, test } from "bun:test";

import type { LocalService } from "@/features/local-services/types";
import { localServiceOpenUrl } from "./local-service-url";

const baseService: LocalService = {
  id: "service",
  owner: {
    root_path: "/repo",
  },
  kind: "workspace_dev_server",
  status: "online",
  confidence: 1,
  reasons: [],
  url: "http://127.0.0.1:3030",
  display_url: "localhost:3030",
  port: 3030,
  can_open: true,
  can_stop: true,
  protected: false,
  last_seen_at: "2026-06-08T00:00:00Z",
};

describe("localServiceOpenUrl", () => {
  test("keeps localhost display host when backend reports 127 loopback", () => {
    expect(localServiceOpenUrl(baseService)).toBe("http://localhost:3030/");
  });

  test("preserves path and query while replacing loopback host", () => {
    expect(
      localServiceOpenUrl({
        ...baseService,
        url: "http://127.0.0.1:3030/app?mode=preview#root",
      }),
    ).toBe("http://localhost:3030/app?mode=preview#root");
  });

  test("does not rewrite non-matching ports", () => {
    expect(
      localServiceOpenUrl({
        ...baseService,
        url: "http://127.0.0.1:4040",
      }),
    ).toBe("http://127.0.0.1:4040");
  });
});
