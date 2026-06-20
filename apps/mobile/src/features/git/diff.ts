export type DiffLine = {
  kind: "context" | "added" | "removed";
  content: string;
  oldLineNumber?: number;
  newLineNumber?: number;
};

export function createInlineDiff(oldContent: string, newContent: string): DiffLine[] {
  const oldLines = oldContent.split("\n");
  const newLines = newContent.split("\n");
  const lines: DiffLine[] = [];
  const oldCount = oldLines.length;
  const newCount = newLines.length;
  const columns = newCount + 1;
  const table = new Uint32Array((oldCount + 1) * (newCount + 1));

  for (let oldIndex = oldCount - 1; oldIndex >= 0; oldIndex -= 1) {
    for (let newIndex = newCount - 1; newIndex >= 0; newIndex -= 1) {
      const offset = oldIndex * columns + newIndex;
      if (oldLines[oldIndex] === newLines[newIndex]) {
        table[offset] = table[(oldIndex + 1) * columns + newIndex + 1] + 1;
      } else {
        const removeScore = table[(oldIndex + 1) * columns + newIndex];
        const addScore = table[oldIndex * columns + newIndex + 1];
        table[offset] = Math.max(removeScore, addScore);
      }
    }
  }

  let oldIndex = 0;
  let newIndex = 0;
  let oldLineNumber = 1;
  let newLineNumber = 1;

  while (oldIndex < oldCount && newIndex < newCount) {
    if (oldLines[oldIndex] === newLines[newIndex]) {
      lines.push({
        kind: "context",
        content: oldLines[oldIndex],
        oldLineNumber,
        newLineNumber,
      });
      oldIndex += 1;
      newIndex += 1;
      oldLineNumber += 1;
      newLineNumber += 1;
      continue;
    }

    const removeScore = table[(oldIndex + 1) * columns + newIndex];
    const addScore = table[oldIndex * columns + newIndex + 1];

    if (removeScore >= addScore) {
      lines.push({
        kind: "removed",
        content: oldLines[oldIndex],
        oldLineNumber,
      });
      oldIndex += 1;
      oldLineNumber += 1;
    } else {
      lines.push({
        kind: "added",
        content: newLines[newIndex],
        newLineNumber,
      });
      newIndex += 1;
      newLineNumber += 1;
    }
  }

  while (oldIndex < oldCount) {
    lines.push({
      kind: "removed",
      content: oldLines[oldIndex],
      oldLineNumber,
    });
    oldIndex += 1;
    oldLineNumber += 1;
  }

  while (newIndex < newCount) {
    lines.push({
      kind: "added",
      content: newLines[newIndex],
      newLineNumber,
    });
    newIndex += 1;
    newLineNumber += 1;
  }

  return lines;
}
