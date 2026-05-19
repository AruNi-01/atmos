import { getArrowBindings, type Editor, type TLArrowShape, type TLShapeId } from "tldraw";

import { getShapePageBoundsBox } from "./canvas-agent-bounds";

export type CanvasAgentLint = {
  type: "overlap" | "unbound_arrow";
  shape_ids: string[];
  message: string;
};

function boxesOverlap(
  a: { minX: number; minY: number; maxX: number; maxY: number },
  b: { minX: number; minY: number; maxX: number; maxY: number },
  padding = 4,
): boolean {
  return !(
    a.maxX + padding < b.minX ||
    b.maxX + padding < a.minX ||
    a.maxY + padding < b.minY ||
    b.maxY + padding < a.minY
  );
}

export function computeCanvasLints(editor: Editor): CanvasAgentLint[] {
  const lints: CanvasAgentLint[] = [];
  const shapes = editor.getCurrentPageShapes();
  const boxes: Array<{ id: string; bb: NonNullable<ReturnType<typeof getShapePageBoundsBox>> }> =
    [];

  for (const shape of shapes) {
    const bb = getShapePageBoundsBox(editor, shape.id);
    if (!bb || bb.width < 1 || bb.height < 1) continue;
    boxes.push({ id: shape.id, bb });
  }

  for (let i = 0; i < boxes.length; i++) {
    for (let j = i + 1; j < boxes.length; j++) {
      const a = boxes[i]!;
      const b = boxes[j]!;
      if (boxesOverlap(a.bb, b.bb)) {
        lints.push({
          type: "overlap",
          shape_ids: [a.id, b.id],
          message: `Shapes ${a.id} and ${b.id} overlap on the page.`,
        });
      }
    }
  }

  for (const shape of shapes) {
    if (shape.type !== "arrow") continue;
    const bindings = getArrowBindings(editor, shape as TLArrowShape);
    const hasStart = Boolean(bindings.start);
    const hasEnd = Boolean(bindings.end);
    if (!hasStart || !hasEnd) {
      const missing: string[] = [];
      if (!hasStart) missing.push("start");
      if (!hasEnd) missing.push("end");
      lints.push({
        type: "unbound_arrow",
        shape_ids: [shape.id],
        message: `Arrow ${shape.id} is missing ${missing.join(" and ")} binding(s). Use create-arrow --from-id / --to-id.`,
      });
    }
  }

  return lints;
}
