import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { renderToStaticMarkup } from "react-dom/server";
import { AgentCopyButton, agentCopyLabels } from "../client/components/agent-copy-button";
import { SimulatorToolbar } from "../client/simulator";

const exec = async () => ({ stdout: "", stderr: "", exitCode: 0 });

describe("AgentCopyButton", () => {
  test("renders an icon-only Agent control with a tooltip", () => {
    const html = renderToStaticMarkup(
      <SimulatorToolbar exec={exec} deviceUdid="booted" streaming>
        <AgentCopyButton />
      </SimulatorToolbar>,
    );

    expect(html).toContain('aria-label="Copy the prompt for Agent to operate this device"');
    expect(html).toContain('role="tooltip"');
    expect(html).toContain("Copy the prompt for Agent to operate this device");
    expect(html).not.toContain(">Agent</button>");
    expect(html).not.toContain('aria-label="Agent"');
  });

  test("uses Chinese copy when lang is zh", () => {
    expect(agentCopyLabels("zh").tooltip).toBe("复制 prompt 给 Agent，用于操作这台设备");
    expect(agentCopyLabels("en").tooltip).toContain("Copy the prompt");
  });

  test("lives in the same AX pill as the overlay toggle", () => {
    const client = readFileSync(
      join(import.meta.dir, "../client/client.tsx"),
      "utf8",
    );
    const axStart = client.indexOf('aria-label="Accessibility and Agent"');
    const axEnd = client.indexOf("</SimulatorToolbar>", axStart);
    const pill = client.slice(axStart, axEnd);
    expect(pill).toContain("AxToolbarButton");
    expect(pill).toContain("AgentCopyButton");
  });
});
