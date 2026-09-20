import { afterEach, describe, expect, test } from "bun:test";
import {
  isMdLiveComposing,
  mdLiveCompositionDomHandlers,
  mdLiveMarkComposing,
} from "./composing";

describe("md-live composing guard", () => {
  afterEach(() => {
    mdLiveMarkComposing(false);
  });

  test("compositionstart is visible before view.composing is set", () => {
    mdLiveMarkComposing(false);
    expect(isMdLiveComposing({ composing: false })).toBe(false);
    mdLiveCompositionDomHandlers.compositionstart(null, new Event("compositionstart"));
    expect(isMdLiveComposing({ composing: false })).toBe(true);
    mdLiveCompositionDomHandlers.compositionend(null, new Event("compositionend"));
    expect(isMdLiveComposing({ composing: false })).toBe(false);
  });

  test("beforeinput composition types mark the session", () => {
    mdLiveMarkComposing(false);
    const event = new Event("beforeinput") as InputEvent;
    Object.defineProperty(event, "isComposing", { value: true });
    Object.defineProperty(event, "inputType", { value: "insertText" });
    mdLiveCompositionDomHandlers.beforeinput(null, event);
    expect(isMdLiveComposing()).toBe(true);
    mdLiveMarkComposing(false);
  });
});
