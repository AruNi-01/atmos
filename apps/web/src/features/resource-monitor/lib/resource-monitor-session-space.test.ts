import { describe, expect, test } from "bun:test";
import { DEFAULT_CENTER_SPACE_ID } from "@/app-shell/center-space/center-space";
import { resolveResourceMonitorSessionSpaceBadge } from "@/features/resource-monitor/lib/resource-monitor-session-space";

const DEFAULT = { id: DEFAULT_CENTER_SPACE_ID, name: "Default" };
const REVIEW = { id: "space-review", name: "Review" };

describe("resolveResourceMonitorSessionSpaceBadge", () => {
  test("hides the badge when the host only has the default Space", () => {
    expect(
      resolveResourceMonitorSessionSpaceBadge({
        spaces: [DEFAULT],
        spaceId: DEFAULT_CENTER_SPACE_ID,
        defaultSpaceName: "Default",
      }),
    ).toBeNull();
  });

  test("hides the badge when no spaces are registered", () => {
    expect(
      resolveResourceMonitorSessionSpaceBadge({
        spaces: [],
        spaceId: DEFAULT_CENTER_SPACE_ID,
        defaultSpaceName: "Default",
      }),
    ).toBeNull();
  });

  test("hides the badge when the live space cannot be resolved", () => {
    expect(
      resolveResourceMonitorSessionSpaceBadge({
        spaces: [DEFAULT, REVIEW],
        spaceId: null,
        defaultSpaceName: "Default",
      }),
    ).toBeNull();
  });

  test("hides the badge when the live space is not in the host list", () => {
    expect(
      resolveResourceMonitorSessionSpaceBadge({
        spaces: [DEFAULT, REVIEW],
        spaceId: "space-missing",
        defaultSpaceName: "Default",
      }),
    ).toBeNull();
  });

  test("labels the default Space when the host has extra Spaces", () => {
    expect(
      resolveResourceMonitorSessionSpaceBadge({
        spaces: [DEFAULT, REVIEW],
        spaceId: DEFAULT_CENTER_SPACE_ID,
        defaultSpaceName: "Default",
      }),
    ).toEqual({
      spaceId: DEFAULT_CENTER_SPACE_ID,
      name: "Default",
    });
  });

  test("uses the extra Space name and the localized default label", () => {
    expect(
      resolveResourceMonitorSessionSpaceBadge({
        spaces: [DEFAULT, REVIEW],
        spaceId: REVIEW.id,
        defaultSpaceName: "默认",
      }),
    ).toEqual({
      spaceId: REVIEW.id,
      name: "Review",
    });
    expect(
      resolveResourceMonitorSessionSpaceBadge({
        spaces: [DEFAULT, REVIEW],
        spaceId: DEFAULT_CENTER_SPACE_ID,
        defaultSpaceName: "默认",
      }),
    ).toEqual({
      spaceId: DEFAULT_CENTER_SPACE_ID,
      name: "默认",
    });
  });
});
