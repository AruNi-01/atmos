import { expect, test } from "bun:test";

import { createDocumentScriptHelpers } from "../lib/document-script-helpers";

test("claimInputScope captures keys without changing tldraw pointer state", () => {
  const received: string[] = [];
  const windowDescriptor = Object.getOwnPropertyDescriptor(globalThis, "window");
  const windowTarget = new EventTarget();
  Object.defineProperty(globalThis, "window", {
    configurable: true,
    value: windowTarget,
  });
  const editor = {
    dispatch: () => editor,
    markEventAsHandled: () => undefined,
    on: () => undefined,
    off: () => undefined,
  };
  try {
    const helpers = createDocumentScriptHelpers(editor as never);
    const scope = helpers.claimInputScope({
      onKeyDown: (event) => received.push(event.code),
    });

    const event = new Event("keydown", { bubbles: true, cancelable: true });
    Object.defineProperty(event, "code", { value: "ArrowRight" });
    windowTarget.dispatchEvent(event);

    expect(received).toEqual(["ArrowRight"]);
    expect(event.defaultPrevented).toBe(true);
    scope.release();
  } finally {
    if (windowDescriptor) {
      Object.defineProperty(globalThis, "window", windowDescriptor);
    } else {
      delete (globalThis as { window?: unknown }).window;
    }
  }
});
