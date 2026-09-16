import { describe, expect, test } from "bun:test";
import {
  persistFromLibraryBody,
  shouldPromptLibraryName,
  libraryFileStem,
  namedPersistForLibrarySave,
} from "./library-file";

describe("library file bind", () => {
  test("prompts for a name only before the board is bound to a file", () => {
    expect(shouldPromptLibraryName(null)).toBe(true);
    expect(shouldPromptLibraryName(undefined)).toBe(true);
    expect(shouldPromptLibraryName("design-a.ptdesign.json")).toBe(false);
  });

  test("strips the on-disk suffix for display", () => {
    expect(libraryFileStem("design-a.ptdesign.json")).toBe("design-a");
    expect(libraryFileStem("design-a")).toBe("design-a");
  });

  test("first save writes the file stem onto persist meta.name", () => {
    const named = namedPersistForLibrarySave(
      {
        ptx: "<page id=\"page\"></page>\n",
        meta: {
          id: "doc-1",
          name: "",
          scope: "global",
          pinned: false,
          pinOrder: 0,
          updatedAt: 1,
          openMode: "canvas",
        },
      },
      "Home.ptdesign.json",
    );
    expect(named.meta?.name).toBe("Home");
  });

  test("reads ptx persist bodies and legacy scene-only files", () => {
    expect(
      persistFromLibraryBody({
        ptx: "<page id=\"p\"/>",
        canvas: { elements: [{ id: "h" }] },
      }),
    ).toEqual({
      ptx: "<page id=\"p\"/>",
      canvas: { elements: [{ id: "h" }] },
    });
    expect(
      persistFromLibraryBody({
        format: "pt-design-file/1",
        scene: { elements: [], appState: { viewBackgroundColor: "#fff" } },
      }),
    ).toEqual({
      ptx: "",
      canvas: { elements: [], appState: { viewBackgroundColor: "#fff" } },
    });
  });
});
