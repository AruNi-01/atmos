import { describe, expect, test } from "bun:test";
import { useChangesScopeBridge } from "@/features/git/store/use-changes-scope-bridge";

describe("useChangesScopeBridge", () => {
  test("records and consumes a scope request", () => {
    useChangesScopeBridge.setState({ request: null });
    useChangesScopeBridge.getState().requestScope("staged");
    const first = useChangesScopeBridge.getState().request;
    expect(first?.scope).toBe("staged");
    expect(first?.commitHash).toBeNull();
    expect(typeof first?.token).toBe("number");

    useChangesScopeBridge.getState().consumeRequest(first!.token);
    expect(useChangesScopeBridge.getState().request).toBeNull();
  });

  test("records and consumes a commit scope request", () => {
    useChangesScopeBridge.setState({ request: null });
    useChangesScopeBridge.getState().requestCommitScope("abc123def");
    const first = useChangesScopeBridge.getState().request;
    expect(first?.scope).toBe("commit");
    expect(first?.commitHash).toBe("abc123def");
    expect(typeof first?.token).toBe("number");

    useChangesScopeBridge.getState().consumeRequest(first!.token);
    expect(useChangesScopeBridge.getState().request).toBeNull();
  });

  test("ignores blank commit hashes", () => {
    useChangesScopeBridge.setState({ request: null });
    useChangesScopeBridge.getState().requestCommitScope("   ");
    expect(useChangesScopeBridge.getState().request).toBeNull();
  });
});
