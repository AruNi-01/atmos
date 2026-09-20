import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { fail } from "./error";

export function readBundle(dir: string): { ptx: string; canvas?: unknown } {
  const ptxPath = join(dir, "document.ptx");
  if (!existsSync(ptxPath)) fail("missing_file", `Missing document.ptx in ${dir}`);
  const ptx = readFileSync(ptxPath, "utf8");
  const canvasPath = join(dir, "canvas.json");
  if (!existsSync(canvasPath)) return { ptx };
  const canvas: unknown = JSON.parse(readFileSync(canvasPath, "utf8"));
  return { ptx, canvas };
}

export function writeBundle(dir: string, input: { ptx: string; canvas?: unknown }): void {
  writeFileSync(join(dir, "document.ptx"), input.ptx, "utf8");
  if (input.canvas !== undefined) {
    writeFileSync(join(dir, "canvas.json"), `${JSON.stringify(input.canvas, null, 2)}\n`, "utf8");
  }
}
