import { describe, expect, test } from "bun:test";
import { preventResourceMonitorCloseAutoFocus } from "@/features/resource-monitor/lib/resource-monitor-close-autofocus";

describe("preventResourceMonitorCloseAutoFocus", () => {
  test("prevents and clears only after a navigation is marked", () => {
    const navigating = { current: true };
    let prevented = 0;
    expect(
      preventResourceMonitorCloseAutoFocus(navigating, {
        preventDefault: () => {
          prevented += 1;
        },
      }),
    ).toBe(true);
    expect(prevented).toBe(1);
    expect(navigating.current).toBe(false);
  });

  test("does nothing when navigation is not marked", () => {
    const navigating = { current: false };
    let prevented = 0;
    expect(
      preventResourceMonitorCloseAutoFocus(navigating, {
        preventDefault: () => {
          prevented += 1;
        },
      }),
    ).toBe(false);
    expect(prevented).toBe(0);
    expect(navigating.current).toBe(false);
  });

  test("failed reopen keeps the flag until close autofocus", () => {
    const navigating = { current: false };
    const markNavigating = () => {
      navigating.current = true;
    };
    const reopen = () => {
      // Footer reopen only shows the popover again. It must not clear the flag.
    };
    const onCloseAutoFocus = (event: { preventDefault: () => void }) =>
      preventResourceMonitorCloseAutoFocus(navigating, event);

    markNavigating();
    reopen();
    expect(navigating.current).toBe(true);

    let prevented = 0;
    expect(onCloseAutoFocus({ preventDefault: () => { prevented += 1; } })).toBe(true);
    expect(prevented).toBe(1);
    expect(navigating.current).toBe(false);
  });
});
