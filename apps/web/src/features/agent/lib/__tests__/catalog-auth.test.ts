import { describe, expect, it } from "bun:test";
import { AUTH_REQUIRED_ERROR_PREFIX } from "@/features/agent/lib/agent-runtime-socket";
import {
  catalogAuthFromSnapshot,
  catalogAuthMethodKind,
  catalogAuthToastDescription,
  CLI_LOGIN_METHOD_PREFIX,
  isCliLoginMethodId,
  isNativeOauthMethodId,
  nativeAuthMethods,
  nativeCliLoginCommand,
  NATIVE_OAUTH_METHOD_PREFIX,
} from "@/features/agent/lib/catalog-auth";

describe("catalog auth", () => {
  it("parses ACP payloads from the catalog message", () => {
    const payload = {
      request_id: "req-1",
      methods: [{ id: "oauth", name: "Browser" }],
      message: "Authentication required by agent",
    };
    const snapshot = {
      agent_id: "cursor",
      status: "ok" as const,
      message: `${AUTH_REQUIRED_ERROR_PREFIX}${JSON.stringify(payload)}`,
    };
    expect(catalogAuthFromSnapshot(snapshot)?.methods[0]?.id).toBe("oauth");
    expect(catalogAuthToastDescription(catalogAuthFromSnapshot(snapshot)!, "Sign in")).toBe(
      "Authentication required by agent",
    );
  });

  it("uses vendor native methods when catalog status is auth_required", () => {
    const payload = catalogAuthFromSnapshot({
      agent_id: "codex",
      status: "auth_required",
      message: "please login",
    });
    expect(payload?.methods.map((method) => method.id)).toEqual([
      `${NATIVE_OAUTH_METHOD_PREFIX}codex`,
      "token:OPENAI_API_KEY",
    ]);
    expect(isNativeOauthMethodId(payload?.methods[0]?.id ?? "")).toBe(true);
    expect(nativeCliLoginCommand("claude-code")).toBe("claude auth login");
    expect(nativeAuthMethods("opencode")[0]?.id).toBe(`${CLI_LOGIN_METHOD_PREFIX}opencode`);
    expect(isCliLoginMethodId(nativeAuthMethods("opencode")[0]?.id ?? "")).toBe(true);
  });

  it("classifies browser, token, and CLI login methods", () => {
    expect(catalogAuthMethodKind("oauth")).toBe("browser");
    expect(catalogAuthMethodKind(`${NATIVE_OAUTH_METHOD_PREFIX}codex`)).toBe("browser");
    expect(catalogAuthMethodKind("token:DEEPSEEK_API_KEY")).toBe("token");
    expect(catalogAuthMethodKind(`${CLI_LOGIN_METHOD_PREFIX}opencode`)).toBe("cli");
  });
});
