// @ts-expect-error bun:test is available at runtime but not in tsconfig types
import { afterEach, describe, expect, it } from "bun:test";

import { useCanvasRuntimeStore } from "../store/canvas-runtime-store";

afterEach(() => {
  useCanvasRuntimeStore.getState().reset();
});

describe("canvas unsupported interaction notice", () => {
  it("starts with no notice", () => {
    expect(useCanvasRuntimeStore.getState().unsupportedInteractionNotice).toBeNull();
  });

  it("records the widget label and target path when shown", () => {
    useCanvasRuntimeStore.getState().showUnsupportedInteraction({
      widgetLabel: "Review",
      targetPath: "/workspace?id=ws-1",
    });

    expect(useCanvasRuntimeStore.getState().unsupportedInteractionNotice).toEqual({
      widgetLabel: "Review",
      targetPath: "/workspace?id=ws-1",
    });
  });

  it("dismisses the notice", () => {
    useCanvasRuntimeStore.getState().showUnsupportedInteraction({
      widgetLabel: "Files",
      targetPath: null,
    });
    useCanvasRuntimeStore.getState().dismissUnsupportedInteraction();

    expect(useCanvasRuntimeStore.getState().unsupportedInteractionNotice).toBeNull();
  });

  it("clears the notice on reset", () => {
    useCanvasRuntimeStore.getState().showUnsupportedInteraction({
      widgetLabel: "Changes",
      targetPath: "/project?id=p-1",
    });
    useCanvasRuntimeStore.getState().reset();

    expect(useCanvasRuntimeStore.getState().unsupportedInteractionNotice).toBeNull();
  });
});
