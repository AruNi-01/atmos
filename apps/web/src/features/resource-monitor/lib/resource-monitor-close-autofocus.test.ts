import { describe, expect, test } from "bun:test";
import {
  isResourceMonitorDetailEventTarget,
  isResourceMonitorDetailOpen,
  preventResourceMonitorCloseAutoFocus,
  preventResourceMonitorParentDismiss,
  preventResourceMonitorParentEscape,
} from "@/features/resource-monitor/lib/resource-monitor-close-autofocus";

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

describe("nested resource-monitor detail dismiss", () => {
  test("keeps the parent open for detail targets and Escape while a detail is open", () => {
    const detail = {
      closest: (selector: string) =>
        selector === "[data-resource-monitor-detail]" ? detail : null,
    };
    expect(isResourceMonitorDetailEventTarget(detail as unknown as EventTarget)).toBe(
      true,
    );
    expect(isResourceMonitorDetailEventTarget(null)).toBe(false);

    let dismissed = 0;
    expect(
      preventResourceMonitorParentDismiss({
        target: detail as unknown as EventTarget,
        preventDefault: () => {
          dismissed += 1;
        },
      }),
    ).toBe(true);
    expect(dismissed).toBe(1);
    expect(
      preventResourceMonitorParentDismiss({
        target: null,
        preventDefault: () => {
          dismissed += 1;
        },
      }),
    ).toBe(false);

    let escaped = 0;
    expect(
      preventResourceMonitorParentEscape(
        {
          preventDefault: () => {
            escaped += 1;
          },
        },
        true,
      ),
    ).toBe(true);
    expect(
      preventResourceMonitorParentEscape(
        {
          preventDefault: () => {
            escaped += 1;
          },
        },
        false,
      ),
    ).toBe(false);
    expect(escaped).toBe(1);

    const root = {
      querySelector: (selector: string) =>
        selector === "[data-resource-monitor-detail]" ? {} : null,
    } as unknown as ParentNode;
    expect(isResourceMonitorDetailOpen(root)).toBe(true);
    expect(
      isResourceMonitorDetailOpen({
        querySelector: () => null,
      } as unknown as ParentNode),
    ).toBe(false);
  });
});
