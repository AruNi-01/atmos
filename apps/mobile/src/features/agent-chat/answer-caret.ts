const FENCE = /^[ \t]{0,3}(`{3,}|~{3,})/;
const TABLE_RULE = /^\|?[ \t]*:?-{1,}:?[ \t]*(\|[ \t]*:?-{1,}:?[ \t]*)*\|?$/;

/** Same unclosed-fence check Streamdown uses before it paints a block caret. */
export function markdownHasUnclosedFence(text: string): boolean {
  let marker: string | null = null;
  let length = 0;
  for (const line of text.split("\n")) {
    const match = FENCE.exec(line);
    const fence = match?.[1];
    if (!fence) continue;
    if (marker === null) {
      marker = fence[0] ?? null;
      length = fence.length;
      continue;
    }
    if (fence[0] === marker && fence.length >= length) {
      marker = null;
      length = 0;
    }
  }
  return marker !== null;
}

/** Streamdown hides the caret when the last block is a table. */
export function markdownLastBlockIsTable(text: string): boolean {
  const blocks = text.split(/\n\s*\n/);
  const last = blocks[blocks.length - 1] ?? "";
  for (const line of last.split("\n")) {
    const trimmed = line.trim();
    if (trimmed.length > 0 && trimmed.includes("|") && TABLE_RULE.test(trimmed)) return true;
  }
  return false;
}

/**
 * Streamdown paints `caret="block"` only while `isAnimating` is set, the last
 * block is not a fence or a table, and reduced motion is off. `isAnimating`
 * on the web answer is the streaming display tail.
 */
export function answerShowsBlockCaret(input: {
  reduced: boolean;
  tail: boolean;
  text: string;
}): boolean {
  if (!input.tail || input.reduced || input.text.length === 0) return false;
  if (markdownHasUnclosedFence(input.text)) return false;
  if (markdownLastBlockIsTable(input.text)) return false;
  return true;
}
