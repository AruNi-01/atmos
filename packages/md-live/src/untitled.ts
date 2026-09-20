const UNTITLED_STEM = "Untitled";
const UNTITLED_EXT = ".md";
const MAX_INDEX = 9999;

export function nextUntitledMarkdownName(namesInDir: string[]): string {
  const taken = new Set(namesInDir);
  const first = `${UNTITLED_STEM}${UNTITLED_EXT}`;
  if (!taken.has(first)) return first;
  for (let i = 1; i <= MAX_INDEX; i++) {
    const name = `${UNTITLED_STEM}-${i}${UNTITLED_EXT}`;
    if (!taken.has(name)) return name;
  }
  throw new Error("Could not allocate an Untitled markdown name");
}
