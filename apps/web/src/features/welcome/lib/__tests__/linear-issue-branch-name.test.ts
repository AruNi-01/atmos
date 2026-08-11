// @ts-expect-error bun:test is available at runtime but not in tsconfig types
import { describe, expect, it, mock } from "bun:test";

mock.module("next/font/local", () => ({
  default: () => ({ className: "", style: {}, variable: "" }),
}));

mock.module("@/shared/components/ui/AtmosWordmark", () => ({
  AtmosWordmark: () => null,
}));

mock.module("@/app-shell/llm-providers-modal-utils", () => ({
  agentCliRouteLabel: (id: string) => id,
}));

const {
  linearIssueToBranchName,
  linearIssueToWorkspaceName,
  regeneratePokemonSuffixBranch,
} = await import("../welcome-page-helpers");

describe("linearIssueToWorkspaceName", () => {
  it("prefills identifier + title", () => {
    expect(
      linearIssueToWorkspaceName({ identifier: "LAN-48", title: "Ship tabs" }),
    ).toBe("LAN-48 Ship tabs");
  });
});

describe("linearIssueToBranchName", () => {
  it("uses lowercased identifier with pokemon suffix", () => {
    const branch = linearIssueToBranchName({ identifier: "LAN-48" });
    expect(branch.startsWith("lan-48-")).toBe(true);
    expect(branch.split("-").length).toBeGreaterThanOrEqual(3);
  });

  it("sanitizes odd characters", () => {
    const branch = linearIssueToBranchName({ identifier: "Team/OPS_12" });
    expect(branch.startsWith("team-ops-12-")).toBe(true);
  });
});

describe("regeneratePokemonSuffixBranch with Linear", () => {
  it("regenerates from identifier when provided", () => {
    const next = regeneratePokemonSuffixBranch("lan-48-oldmon", undefined, "LAN-48");
    expect(next.startsWith("lan-48-")).toBe(true);
    expect(next).not.toBe("lan-48-oldmon");
  });
});
