import { describe, expect, test } from "bun:test";
import type { WsError, WsRequest, WsResponse } from "./frames";

describe("@atmos/api-types frames", () => {
  test("request envelope shape is assignable", () => {
    const msg: WsRequest = {
      type: "request",
      payload: {
        request_id: "r1",
        action: "fs_get_home_dir",
        data: {},
      },
    };
    expect(msg.type).toBe("request");
    expect(msg.payload.request_id).toBe("r1");
  });

  test("response requires success boolean", () => {
    const msg: WsResponse = {
      type: "response",
      payload: {
        request_id: "r1",
        success: true,
        data: { path: "/tmp" },
      },
    };
    expect(msg.payload.success).toBe(true);
  });

  test("error requires code and message", () => {
    const msg: WsError = {
      type: "error",
      payload: {
        request_id: "r1",
        code: "INTERNAL",
        message: "boom",
      },
    };
    expect(msg.payload.code).toBe("INTERNAL");
  });
});
