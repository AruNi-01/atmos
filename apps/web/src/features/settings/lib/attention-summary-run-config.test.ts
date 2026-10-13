// @ts-expect-error bun:test is available at runtime but not in tsconfig types
import { describe, expect, it } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  attentionSummaryFieldsFromRunConfig,
  attentionSummaryRunConfig,
} from "@/features/settings/lib/attention-summary-run-config";

describe("attention summary run config", () => {
  it("echoes effort and extra args into the controlled picker value", () => {
    const echoed = attentionSummaryRunConfig("claude", {
      model: " opus ",
      effort: " high ",
      extraArgs: [" --custom-flag ", " "],
    });
    expect(echoed).toEqual({
      model: "opus",
      reasoning: { mode: "enum", value: "high" },
      extra_args: ["--custom-flag"],
    });

    const next = attentionSummaryFieldsFromRunConfig({
      model: "opus",
      reasoning: { mode: "enum", value: "max" },
      extra_args: ["--custom-flag"],
    });
    expect(next).toEqual({
      model: "opus",
      effort: "max",
      extraArgs: ["--custom-flag"],
    });
    expect(attentionSummaryRunConfig("claude", next)?.reasoning).toEqual({
      mode: "enum",
      value: "max",
    });
  });

  it("keeps effort when the model is empty and drops an empty config", () => {
    expect(
      attentionSummaryRunConfig("claude", { model: "", effort: "low", extraArgs: [] }),
    ).toEqual({
      model: null,
      reasoning: { mode: "enum", value: "low" },
      extra_args: [],
    });
    expect(
      attentionSummaryRunConfig("claude", { model: " ", effort: "", extraArgs: [" "] }),
    ).toBeNull();
  });

  it("wires the settings picker and the behaviour save through those fields", () => {
    const section = readFileSync(
      join(import.meta.dir, "../components/CodeAgentBehaviourSettingsSection.tsx"),
      "utf8",
    );
    expect(section).toContain("attentionSummaryRunConfig");
    expect(section).toContain("attentionSummaryFieldsFromRunConfig");
    expect(section).toContain("values.attentionSummaryEffort");
    expect(section).toContain("attentionSummaryExtraArgs");
    expect(section).toContain("hydrateLastPick={false}");

    const modal = readFileSync(
      join(import.meta.dir, "../components/SettingsModal.tsx"),
      "utf8",
    );
    expect(modal).toContain("attention_summary_effort: values.attentionSummaryEffort");
    expect(modal).toContain("attention_summary_extra_args: values.attentionSummaryExtraArgs");
  });
});
