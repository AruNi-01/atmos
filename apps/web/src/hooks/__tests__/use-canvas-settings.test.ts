// @ts-expect-error bun:test is available at runtime but not in tsconfig types
import { afterEach, describe, expect, it } from "bun:test";
import { toastManager } from "@workspace/ui";
import { functionSettingsApi } from "@/api/ws-api";
import {
  DEFAULT_CANVAS_MAX_RENDERED_TERMINALS,
  MAX_CANVAS_MAX_RENDERED_TERMINALS,
  MIN_CANVAS_MAX_RENDERED_TERMINALS,
  normalizeCanvasMaxRenderedTerminals,
  useCanvasSettings,
} from "../use-canvas-settings";

const originalUpdate = functionSettingsApi.update;
const originalToast = toastManager.add;

afterEach(() => {
  functionSettingsApi.update = originalUpdate;
  toastManager.add = originalToast;
  useCanvasSettings.setState({
    autoSaveInterval: 1,
    maxRenderedTerminals: DEFAULT_CANVAS_MAX_RENDERED_TERMINALS,
    loaded: false,
    loading: false,
  });
});

describe("normalizeCanvasMaxRenderedTerminals", () => {
  it("falls back for non-finite values and clamps finite values into bounds", () => {
    expect(normalizeCanvasMaxRenderedTerminals(Number.NaN)).toBe(DEFAULT_CANVAS_MAX_RENDERED_TERMINALS);
    expect(normalizeCanvasMaxRenderedTerminals(Number.POSITIVE_INFINITY)).toBe(
      DEFAULT_CANVAS_MAX_RENDERED_TERMINALS,
    );
    expect(normalizeCanvasMaxRenderedTerminals(0)).toBe(MIN_CANVAS_MAX_RENDERED_TERMINALS);
    expect(normalizeCanvasMaxRenderedTerminals(999)).toBe(MAX_CANVAS_MAX_RENDERED_TERMINALS);
    expect(normalizeCanvasMaxRenderedTerminals(4.8)).toBe(4);
  });
});

describe("useCanvasSettings", () => {
  it("does not roll back a newer rendered-terminal limit when an older request fails later", async () => {
    let rejectFirstRequest: ((reason?: unknown) => void) | null = null;
    let updateCallCount = 0;

    functionSettingsApi.update = async () => {
      updateCallCount += 1;
      if (updateCallCount === 1) {
        return await new Promise<{ ok: boolean }>((_, reject) => {
          rejectFirstRequest = reject;
        });
      }

      return { ok: true };
    };
    toastManager.add = () => undefined;

    const firstRequest = useCanvasSettings.getState().setMaxRenderedTerminals(20);
    const secondRequest = useCanvasSettings.getState().setMaxRenderedTerminals(30);

    expect(useCanvasSettings.getState().maxRenderedTerminals).toBe(30);

    rejectFirstRequest?.(new Error("late failure"));

    await firstRequest;
    await secondRequest;

    expect(useCanvasSettings.getState().maxRenderedTerminals).toBe(30);
  });
});
