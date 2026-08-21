import { describe, expect, test } from "bun:test";
import { getWorkspaceSetupPopoverWidth } from "./workspace-setup";

describe("getWorkspaceSetupPopoverWidth", () => {
  test("uses the step-count width on a wide viewport", () => {
    expect(getWorkspaceSetupPopoverWidth(2, 1400)).toBe(720);
    expect(getWorkspaceSetupPopoverWidth(3, 1400)).toBe(720);
    expect(getWorkspaceSetupPopoverWidth(4, 1400)).toBe(840);
    expect(getWorkspaceSetupPopoverWidth(5, 1400)).toBe(960);
  });

  test("clamps to the viewport with a gutter", () => {
    expect(getWorkspaceSetupPopoverWidth(3, 500)).toBe(476);
    expect(getWorkspaceSetupPopoverWidth(5, 320)).toBe(296);
  });
});
