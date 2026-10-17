// @ts-expect-error bun:test is available at runtime but not in tsconfig types
import { describe, expect, test } from "bun:test";
import {
  PASTE_CHIP_BORDER_DARK,
  PASTE_CHIP_BORDER_LIGHT,
  PASTE_CHIP_FILL_DARK,
  PASTE_CHIP_FILL_LIGHT,
  PASTE_CHIP_HEIGHT,
  PASTE_LINE_THRESHOLD,
  applyComposerPaste,
  expandComposerPaste,
  pasteChipBorder,
  pasteChipFill,
  pasteChipLabel,
  pasteToken,
  rememberSentPaste,
  removeComposerPaste,
  resetSentPasteForTests,
  retainComposerPasteChips,
  sentPasteDisplay,
} from "./composer-paste";

function lines(count: number, prefix = "line"): string {
  return Array.from({ length: count }, (_, index) => `${prefix} ${index + 1}`).join("\n");
}

describe("composer paste chips", () => {
  test("chips an insertion over 10 lines and leaves the threshold as text", () => {
    expect(PASTE_LINE_THRESHOLD).toBe(10);
    const ten = lines(10);
    expect(applyComposerPaste("", ten)).toEqual({ draft: ten, chip: null });
    expect(applyComposerPaste("", `${ten}\n`).chip).toBeNull();

    const eleven = lines(11);
    const chipped = applyComposerPaste("AB", `A${eleven}B`);
    expect(chipped.chip?.body).toBe(eleven);
    expect(chipped.chip?.lineCount).toBe(11);
    expect(chipped.draft).toBe(`A${pasteToken(chipped.chip!.id)}B`);
    expect(chipped.draft.includes("line 1")).toBe(false);
    expect(chipped.draft).toMatch(/\[#paste:[a-zA-Z0-9_-]+\]/);
  });

  test("expands tokens back to the inserted body and leaves unknown tokens", () => {
    const body = lines(12);
    const applied = applyComposerPaste("note ", `note ${body}`);
    expect(expandComposerPaste(applied.draft, [applied.chip!])).toBe(`note ${body}`);
    expect(expandComposerPaste("see [#paste:missing] ok", [])).toBe("see [#paste:missing] ok");
    expect(expandComposerPaste("hello", [])).toBe("hello");
  });

  test("a short edit or a deletion does not create a chip", () => {
    const body = lines(20);
    expect(applyComposerPaste("hi", "hi!")).toEqual({ draft: "hi!", chip: null });
    expect(applyComposerPaste(body, body.replace("line 1", "line X"))).toEqual({
      draft: body.replace("line 1", "line X"),
      chip: null,
    });
    expect(applyComposerPaste(body, "hi")).toEqual({ draft: "hi", chip: null });
    expect(applyComposerPaste("same", "same")).toEqual({ draft: "same", chip: null });
  });

  test("counts CRLF pastes and keeps a trailing newline outside the chip when it is shared", () => {
    const body = Array.from({ length: 11 }, (_, index) => `row ${index + 1}`).join("\r\n");
    const applied = applyComposerPaste("", body);
    expect(applied.chip?.lineCount).toBe(11);
    expect(applied.chip?.body).toBe(body);
    expect(expandComposerPaste(applied.draft, [applied.chip!])).toBe(body);

    const between = lines(11);
    const previous = "before\nafter";
    const next = `before\n${between}\nafter`;
    const mid = applyComposerPaste(previous, next);
    expect(mid.chip?.lineCount).toBe(11);
    expect(expandComposerPaste(mid.draft, [mid.chip!])).toBe(next);
  });

  test("chips are removable and a second paste expands on its own", () => {
    const first = applyComposerPaste("", lines(11));
    const secondBody = lines(12).replaceAll("line", "row");
    const second = applyComposerPaste(first.draft, `${first.draft}\n${secondBody}`);
    const chips = retainComposerPasteChips(
      second.draft,
      retainComposerPasteChips(first.draft, [], first.chip),
      second.chip,
    );
    expect(chips).toHaveLength(2);
    expect(expandComposerPaste(second.draft, chips)).toBe(`${first.chip!.body}\n${secondBody}`);

    const removed = removeComposerPaste(second.draft, chips, first.chip!.id);
    expect(removed.chips.map((chip) => chip.id)).toEqual([second.chip!.id]);
    expect(removed.draft.includes(pasteToken(first.chip!.id))).toBe(false);
    expect(removed.draft.includes(pasteToken(second.chip!.id))).toBe(true);
    expect(retainComposerPasteChips("hello", chips, null)).toEqual([]);
  });

  test("labels the chip in sentence case", () => {
    expect(pasteChipLabel(11)).toBe("Pasted: 11 lines");
  });

  test("a sent paste is a chip for this session and full text everywhere else", () => {
    resetSentPasteForTests();
    const body = lines(12);
    const applied = applyComposerPaste("note ", `note ${body}`);
    const chip = applied.chip;
    if (!chip) throw new Error("expected a paste chip");
    const expanded = expandComposerPaste(applied.draft, [chip]);
    expect(sentPasteDisplay(expanded)).toBeNull();
    rememberSentPaste(expanded, applied.draft, [chip]);
    const shown = sentPasteDisplay(expanded);
    expect(shown?.segments).toEqual([
      { type: "text", value: "note " },
      { type: "paste", token: pasteToken(chip.id), text: body, lineCount: 12 },
    ]);
    expect(sentPasteDisplay(`  ${expanded}  `)?.segments[1]).toMatchObject({ type: "paste" });
    expect(sentPasteDisplay("a different message")).toBeNull();
    expect(sentPasteDisplay(`see ${pasteToken("missing")} now`)).toBeNull();
    rememberSentPaste(expanded, expanded, [chip]);
    expect(PASTE_CHIP_HEIGHT).toBe(20);
    expect(pasteChipFill(false)).toBe(PASTE_CHIP_FILL_LIGHT);
    expect(pasteChipFill(true)).toBe(PASTE_CHIP_FILL_DARK);
    expect(pasteChipBorder(false)).toBe(PASTE_CHIP_BORDER_LIGHT);
    expect(pasteChipBorder(true)).toBe(PASTE_CHIP_BORDER_DARK);
    expect(PASTE_CHIP_FILL_LIGHT).toBe("rgba(222, 222, 224, 0.6)");
    expect(PASTE_CHIP_FILL_DARK).toBe("rgba(39, 39, 42, 0.6)");
    expect(PASTE_CHIP_BORDER_LIGHT).toBe("rgba(0, 0, 0, 0.07)");
    expect(PASTE_CHIP_BORDER_DARK).toBe("rgba(255, 255, 255, 0.07)");
    resetSentPasteForTests();
  });
});
