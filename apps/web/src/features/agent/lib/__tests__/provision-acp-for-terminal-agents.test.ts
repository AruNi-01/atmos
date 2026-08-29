import { describe, expect, test } from "bun:test";
import {
  acpProvisionTargets,
  type AcpProvisionCandidate,
} from "../acp-provision-targets";

function agent(
  partial: Partial<AcpProvisionCandidate> & Pick<AcpProvisionCandidate, "id" | "name">,
): AcpProvisionCandidate {
  return {
    installed: false,
    ...partial,
  };
}

describe("acpProvisionTargets", () => {
  test("downloads missing adapters for selected terminal agents", () => {
    const agents = [
      agent({
        id: "claude-acp",
        name: "Claude Agent",
        provision_kind: "adapter",
        terminal_agent_id: "claude",
        installed: false,
      }),
      agent({
        id: "codex-acp",
        name: "Codex",
        provision_kind: "adapter",
        terminal_agent_id: "codex",
        installed: true,
      }),
    ];

    const targets = acpProvisionTargets(agents, ["claude", "codex"]);
    expect(targets.map((item) => item.id)).toEqual(["claude-acp"]);
  });

  test("binds native agents only when the official CLI is already installed", () => {
    const agents = [
      agent({
        id: "gemini",
        name: "Gemini CLI",
        provision_kind: "native",
        terminal_agent_id: "gemini",
        installed: true,
      }),
      agent({
        id: "cursor",
        name: "Cursor",
        provision_kind: "native",
        terminal_agent_id: "cursor",
        installed: false,
      }),
    ];

    const targets = acpProvisionTargets(agents, ["gemini", "cursor"]);
    expect(targets.map((item) => item.id)).toEqual(["gemini"]);
  });

  test("ignores registry agents that are not mapped to the selection", () => {
    const agents = [
      agent({
        id: "goose",
        name: "goose",
        provision_kind: "native",
        installed: true,
      }),
      agent({
        id: "claude-acp",
        name: "Claude Agent",
        provision_kind: "adapter",
        terminal_agent_id: "claude",
        installed: false,
      }),
    ];

    const targets = acpProvisionTargets(agents, ["gemini"]);
    expect(targets).toEqual([]);
  });

  test("binds local overlay natives such as kiro when the CLI is present", () => {
    const agents = [
      agent({
        id: "kiro",
        name: "Kiro",
        provision_kind: "native",
        terminal_agent_id: "kiro",
        installed: true,
      }),
      agent({
        id: "openclaw",
        name: "OpenClaw",
        provision_kind: "native",
        terminal_agent_id: "openclaw",
        installed: false,
      }),
      agent({
        id: "hermes",
        name: "Hermes Agent",
        provision_kind: "native",
        terminal_agent_id: "hermes",
        installed: true,
      }),
    ];

    const targets = acpProvisionTargets(agents, ["kiro", "openclaw", "hermes"]);
    expect(targets.map((item) => item.id).sort()).toEqual(["hermes", "kiro"]);
  });
});
