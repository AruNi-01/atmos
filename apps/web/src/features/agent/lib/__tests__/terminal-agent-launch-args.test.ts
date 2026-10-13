// @ts-expect-error bun:test is available at runtime but not in tsconfig types
import { describe, expect, it } from "bun:test";
import {
  buildStructuredRunConfigArgs,
  clearRememberedTerminalAgentCatalog,
  effortLevelsForTerminalRow,
  probedEffortForStoredModel,
  rememberTerminalAgentCatalog,
  terminalFastVisible,
  terminalModelCatalogEnabled,
  visibleEffortOptions,
} from "@/features/agent/lib/terminal-agent-launch-args";

describe("buildStructuredRunConfigArgs", () => {
  it("matches the closed Terminal Agent launch contracts", () => {
    expect(
      buildStructuredRunConfigArgs("claude", { reasoning: { mode: "enum", value: "max" } }),
    ).toEqual(["--effort", "max"]);
    expect(() =>
      buildStructuredRunConfigArgs("claude", { reasoning: { mode: "enum", value: "ultracode" } }),
    ).toThrow(/does not accept effort/);

    expect(
      buildStructuredRunConfigArgs("codex", {
        model: "gpt-5.4",
        reasoning: { mode: "enum", value: "high" },
      }),
    ).toEqual(["--model", "gpt-5.4", "-c", 'model_reasoning_effort="high"']);
    expect(() =>
      buildStructuredRunConfigArgs("codex", {
        model: "gpt-5.4",
        reasoning: { mode: "enum", value: "max" },
      }),
    ).toThrow(/does not accept effort/);

    expect(
      buildStructuredRunConfigArgs("antigravity", {
        model: "gemini",
        reasoning: { mode: "enum", value: "max" },
      }),
    ).toEqual(["--model", "gemini", "--effort", "max"]);

    expect(
      buildStructuredRunConfigArgs(
        "droid",
        { model: "gpt", reasoning: { mode: "enum", value: "high" } },
        ["low", "high"],
      ),
    ).toEqual(["--model", "gpt", "--reasoning-effort", "high"]);
    expect(() =>
      buildStructuredRunConfigArgs(
        "droid",
        { model: "gpt", reasoning: { mode: "enum", value: "max" } },
        ["low", "high"],
      ),
    ).toThrow(/does not accept effort/);

    expect(
      buildStructuredRunConfigArgs("grok-build", {
        model: "grok-4.5",
        reasoning: { mode: "manual", value: "high" },
      }),
    ).toEqual(["--model", "grok-4.5", "--reasoning-effort", "high"]);
    for (const illegal of ["max", "none", "minimal"]) {
      expect(() =>
        buildStructuredRunConfigArgs("grok-build", {
          model: "grok-4.5",
          reasoning: { mode: "enum", value: illegal },
        }),
      ).toThrow(/does not accept effort/);
    }
    expect(() =>
      buildStructuredRunConfigArgs("grok-build", {
        model: "grok-4.7",
        reasoning: { mode: "enum", value: "max" },
      }),
    ).toThrow(/does not accept effort/);
    expect(
      buildStructuredRunConfigArgs("grok-build", {
        model: "grok-4.7",
        reasoning: { mode: "enum", value: "xhigh" },
      }),
    ).toEqual(["--model", "grok-4.7", "--reasoning-effort", "xhigh"]);
    expect(() =>
      buildStructuredRunConfigArgs(
        "grok-build",
        { model: "grok-4", reasoning: { mode: "enum", value: "max" } },
        ["low"],
      ),
    ).toThrow(/does not accept effort/);
    expect(visibleEffortOptions("grok-build", ["low"])).toEqual(["low"]);
    expect(visibleEffortOptions("grok-build", ["low", "medium", "high"])).toEqual([
      "low",
      "medium",
      "high",
    ]);
    expect(visibleEffortOptions("grok-build", ["low", "medium", "high", "xhigh"])).toEqual([
      "low",
      "medium",
      "high",
      "xhigh",
    ]);
    expect(() =>
      buildStructuredRunConfigArgs(
        "grok-build",
        { model: "grok-4.5", reasoning: { mode: "enum", value: "xhigh" } },
        ["low", "medium", "high"],
      ),
    ).toThrow(/does not accept effort/);
    expect(
      buildStructuredRunConfigArgs(
        "grok-build",
        { model: "grok-4.7", reasoning: { mode: "enum", value: "xhigh" } },
        ["low", "medium", "high", "xhigh"],
      ),
    ).toEqual(["--model", "grok-4.7", "--reasoning-effort", "xhigh"]);

    expect(
      buildStructuredRunConfigArgs("pi", {
        model: "pi-model",
        reasoning: { mode: "enum", value: "max" },
      }),
    ).toEqual(["--model", "pi-model", "--thinking", "max"]);

    expect(
      buildStructuredRunConfigArgs("commandcode", {
        model: "cmd-model",
        reasoning: { mode: "enum", value: "high" },
      }),
    ).toEqual(["--model", "cmd-model", "--effort", "high"]);
    expect(() =>
      buildStructuredRunConfigArgs("commandcode", {
        model: "cmd-model",
        reasoning: { mode: "enum", value: "max" },
      }),
    ).toThrow(/does not accept effort/);

    expect(
      buildStructuredRunConfigArgs("opencode", {
        model: "provider/model",
        reasoning: { mode: "manual", value: "high" },
      }),
    ).toEqual(["--model", "provider/model"]);
    expect(
      buildStructuredRunConfigArgs("kilocode", {
        model: "provider/model",
        reasoning: { mode: "manual", value: "high" },
      }),
    ).toEqual(["--model", "provider/model"]);
    expect(
      buildStructuredRunConfigArgs("gemini", {
        model: "gemini-flash",
        reasoning: { mode: "manual", value: "high" },
      }),
    ).toEqual(["--model", "gemini-flash"]);
    expect(
      buildStructuredRunConfigArgs("amp", { reasoning: { mode: "manual", value: "high" } }),
    ).toEqual([]);

    expect(
      buildStructuredRunConfigArgs(
        "cursor",
        { model: "claude-opus", reasoning: { mode: "encoded_in_model", value: "high" } },
        ["high", "low"],
      ),
    ).toEqual(["--model", "claude-opus[effort=high]"]);
    expect(
      buildStructuredRunConfigArgs(
        "cursor",
        {
          model: "claude-opus[context=1m,effort=low,fast=false]",
          reasoning: { mode: "encoded_in_model", value: "high" },
        },
        ["high", "low"],
      ),
    ).toEqual(["--model", "claude-opus[context=1m,effort=high,fast=false]"]);
    expect(
      buildStructuredRunConfigArgs(
        "cursor",
        {
          model: "claude-opus[context=1m,fast=false]",
          reasoning: { mode: "encoded_in_model", value: "high" },
        },
        [],
      ),
    ).toEqual(["--model", "claude-opus[context=1m,fast=false]"]);
    expect(
      buildStructuredRunConfigArgs("cursor", {
        model: "claude-opus[context=1m,fast=false]",
        reasoning: { mode: "encoded_in_model", value: "nope" },
      }),
    ).toEqual(["--model", "claude-opus[context=1m,fast=false]"]);

    expect(
      buildStructuredRunConfigArgs("claude", {
        model: "typed-id",
      }),
    ).toEqual(["--model", "typed-id"]);
    expect(
      buildStructuredRunConfigArgs("custom-agent", { extra_args: ["--foo", "bar"] }),
    ).toEqual(["--foo", "bar"]);

    expect(visibleEffortOptions("cursor", ["low", "high"])).toEqual(["low", "high"]);
    expect(visibleEffortOptions("cursor", [])).toEqual([]);
    expect(visibleEffortOptions("claude", undefined)).toEqual(["low", "medium", "high", "xhigh", "max"]);
    expect(visibleEffortOptions("droid", ["low", "medium"])).toEqual(["low", "medium"]);
    expect(visibleEffortOptions("opencode", ["high"])).toEqual(["high"]);
    expect(visibleEffortOptions("opencode", undefined)).toEqual([]);
    expect(visibleEffortOptions("amp", ["high"])).toEqual([]);
    expect(terminalModelCatalogEnabled("claude")).toBe(true);
    expect(terminalModelCatalogEnabled("codex")).toBe(true);
    expect(terminalModelCatalogEnabled("gemini")).toBe(false);
    expect(terminalModelCatalogEnabled("hermes")).toBe(false);
  });

  it("uses a remembered model row when launch does not pass a probe", () => {
    rememberTerminalAgentCatalog("droid", [
      { id: "gpt", thinking: { options: ["low", "high"] } },
    ]);
    rememberTerminalAgentCatalog("cursor", [
      { id: "claude-opus", thinking: { options: [] } },
      { id: "claude-opus-listed", thinking: { options: ["low", "high"] } },
    ]);
    try {
      expect(() =>
        buildStructuredRunConfigArgs("droid", {
          model: "gpt",
          reasoning: { mode: "enum", value: "max" },
        }),
      ).toThrow(/does not accept effort `max`/);
      expect(
        buildStructuredRunConfigArgs("droid", {
          model: "gpt",
          reasoning: { mode: "enum", value: "high" },
        }),
      ).toEqual(["--model", "gpt", "--reasoning-effort", "high"]);
      expect(
        buildStructuredRunConfigArgs("cursor", {
          model: "claude-opus",
          reasoning: { mode: "encoded_in_model", value: "high" },
        }),
      ).toEqual(["--model", "claude-opus"]);
      expect(
        buildStructuredRunConfigArgs("cursor", {
          model: "claude-opus-listed",
          reasoning: { mode: "encoded_in_model", value: "high" },
        }),
      ).toEqual(["--model", "claude-opus-listed[effort=high]"]);
      expect(
        buildStructuredRunConfigArgs(
          "droid",
          { model: "gpt", reasoning: { mode: "enum", value: "max" } },
          ["max"],
        ),
      ).toEqual(["--model", "gpt", "--reasoning-effort", "max"]);
    } finally {
      clearRememberedTerminalAgentCatalog();
    }
  });

  it("keeps thinking levels to each model's CLI effort and passes only a real fast parameter", () => {
    const modelDump = Array.from({ length: 67 }, (_, index) => `vendor/model-${index}`);

    expect(visibleEffortOptions("commandcode", modelDump)).toEqual(["low", "medium", "high"]);
    expect(visibleEffortOptions("commandcode", modelDump).join(" ")).not.toContain("vendor/model");
    expect(visibleEffortOptions("cursor", modelDump)).toEqual([]);
    expect(visibleEffortOptions("droid", ["low", "medium"])).toEqual(["low", "medium"]);
    expect(visibleEffortOptions("droid", ["none", "low"])).toEqual(["none", "low"]);
    expect(visibleEffortOptions("claude", ["high", "max"])).toEqual(["high", "max"]);
    expect(visibleEffortOptions("codex", ["none", "high"])).toEqual(["none", "high"]);
    expect(visibleEffortOptions("droid", ["minimal", "low", "medium", "high"])).toEqual([
      "minimal",
      "low",
      "medium",
      "high",
    ]);
    expect(visibleEffortOptions("opencode", ["none", "thinking"])).toEqual(["none", "thinking"]);

    expect(visibleEffortOptions("gemini", modelDump)).toEqual([]);
    expect(visibleEffortOptions("devin", ["low", "high"])).toEqual([]);
    expect(visibleEffortOptions("kilocode", ["high"], "acp")).toEqual([]);
    expect(visibleEffortOptions("antigravity", ["turbo", "ludicrous"], "acp")).toEqual([
      "low",
      "medium",
      "high",
      "xhigh",
      "max",
    ]);
    expect(visibleEffortOptions("droid", modelDump, "acp")).toEqual([
      "off",
      "low",
      "medium",
      "high",
      "xhigh",
      "max",
    ]);
    expect(visibleEffortOptions("opencode", modelDump)).toEqual([]);
    expect(
      buildStructuredRunConfigArgs(
        "opencode",
        { model: "provider/model", reasoning: { mode: "manual", value: "high" } },
        ["high", "max"],
      ),
    ).toEqual(["--model", "provider/model", "--variant", "high"]);
    expect(
      buildStructuredRunConfigArgs("opencode", {
        model: "provider/model",
        reasoning: { mode: "manual", value: "high" },
      }),
    ).toEqual(["--model", "provider/model"]);
    expect(
      buildStructuredRunConfigArgs(
        "opencode",
        { model: "opencode-go/minimax-m3", reasoning: { mode: "manual", value: "thinking" } },
        ["none", "thinking"],
      ),
    ).toEqual(["--model", "opencode-go/minimax-m3", "--variant", "thinking"]);
    expect(
      buildStructuredRunConfigArgs(
        "codex",
        { model: "stealth/union-alpha", reasoning: { mode: "enum", value: "none" } },
        ["none", "high"],
      ),
    ).toEqual(["--model", "stealth/union-alpha", "-c", 'model_reasoning_effort="none"']);
    expect(() =>
      buildStructuredRunConfigArgs("codex", {
        model: "gpt-5.4",
        reasoning: { mode: "enum", value: "none" },
      }),
    ).toThrow(/does not accept effort/);
    expect(
      buildStructuredRunConfigArgs(
        "droid",
        { model: "gemini-3.5-flash", reasoning: { mode: "enum", value: "minimal" } },
        ["minimal", "low", "medium", "high"],
      ),
    ).toEqual(["--model", "gemini-3.5-flash", "--reasoning-effort", "minimal"]);

    expect(terminalFastVisible("claude")).toBe(false);
    expect(terminalFastVisible("gemini")).toBe(false);
    expect(terminalFastVisible("codex")).toBe(false);
    expect(terminalFastVisible("droid")).toBe(false);
    expect(terminalFastVisible("droid", { fast: true })).toBe(true);
    expect(terminalFastVisible("cursor", { fast: true })).toBe(true);
    expect(terminalFastVisible("grok-build")).toBe(false);
    expect(terminalFastVisible("amp")).toBe(true);

    expect(buildStructuredRunConfigArgs("amp", { fast: true })).toEqual(["--fast"]);
    expect(buildStructuredRunConfigArgs("amp", { fast: false })).toEqual([]);
    expect(
      buildStructuredRunConfigArgs("gemini", { model: "gemini-flash", fast: true }),
    ).toEqual(["--model", "gemini-flash"]);
    expect(buildStructuredRunConfigArgs("amp", { fast: true }).join(" ")).not.toContain("session");
    expect(
      buildStructuredRunConfigArgs(
        "droid",
        { model: "gpt", reasoning: { mode: "enum", value: "high" }, fast: true },
        ["low", "high"],
      ),
    ).toEqual(["--model", "gpt-fast", "--reasoning-effort", "high"]);
    expect(
      buildStructuredRunConfigArgs(
        "cursor",
        {
          model: "claude-opus",
          reasoning: { mode: "encoded_in_model", value: "high" },
          fast: true,
        },
        ["high", "low"],
      ),
    ).toEqual(["--model", "claude-opus[effort=high,fast=true]"]);
    expect(
      buildStructuredRunConfigArgs("grok-build", { model: "grok-4.5", fast: true }),
    ).toEqual(["--model", "grok-4.5-build-fast"]);

    const lineList = [
      { id: "grok-4.5", thinking: null },
      { id: "grok-4.7", thinking: { options: [] as string[] } },
      { id: "grok-4.7-build-fast", thinking: null },
      { id: "grok-4.6" },
    ];
    rememberTerminalAgentCatalog("grok-build", lineList);
    try {
      expect(probedEffortForStoredModel("grok-build", "grok-4.5")).toEqual([]);
      expect(probedEffortForStoredModel("grok-build", "grok-4.7")).toEqual([]);
      expect(probedEffortForStoredModel("grok-build", "grok-4.7-build-fast")).toEqual([]);
      const grok45 = effortLevelsForTerminalRow("grok-build", "grok-4.5", lineList[0]);
      expect(grok45).toEqual(["low", "medium", "high"]);
      expect(grok45).not.toContain("max");
      expect(grok45).not.toContain("none");
      expect(grok45).not.toContain("minimal");
      expect(effortLevelsForTerminalRow("grok-build", "grok-4.7", lineList[1])).toEqual([
        "low",
        "medium",
        "high",
        "xhigh",
      ]);
      expect(effortLevelsForTerminalRow("grok-build", "grok-4.7-build-fast", lineList[2])).toEqual([
        "low",
        "medium",
        "high",
        "xhigh",
      ]);
      expect(effortLevelsForTerminalRow("grok-build", "grok-4.6", lineList[3])).toEqual([
        "low",
        "medium",
        "high",
        "xhigh",
      ]);
      expect(
        visibleEffortOptions(
          "grok-build",
          probedEffortForStoredModel("grok-build", "grok-4.5"),
          "cli",
          "grok-4.5",
        ),
      ).toEqual(grok45);
      expect(() =>
        buildStructuredRunConfigArgs("grok-build", {
          model: "grok-4.5",
          reasoning: { mode: "enum", value: "max" },
        }),
      ).toThrow(/does not accept effort/);
      expect(
        buildStructuredRunConfigArgs("grok-build", {
          model: "grok-4.7-build-fast",
          reasoning: { mode: "enum", value: "xhigh" },
        }),
      ).toEqual(["--model", "grok-4.7-build-fast", "--reasoning-effort", "xhigh"]);
    } finally {
      clearRememberedTerminalAgentCatalog();
    }
  });
});
