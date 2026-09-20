import { describe, expect, test } from "bun:test";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { sceneToViewport } from "./viewport";

function walk(dir: string, files: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    const st = statSync(p);
    if (st.isDirectory()) walk(p, files);
    else if (/\.(ts|tsx)$/.test(name) && !name.includes(".test.")) files.push(p);
  }
  return files;
}

describe("sceneToViewport", () => {
  test("identity at zoom 1 and zero scroll", () => {
    const box = sceneToViewport(
      { x: 10, y: 20, width: 100, height: 40, rotation: 15 },
      { scrollX: 0, scrollY: 0, zoom: { value: 1 } },
    );
    expect(box).toEqual({ x: 10, y: 20, width: 100, height: 40, rotation: 15 });
  });

  test("scales position and size by zoom and applies scroll", () => {
    const box = sceneToViewport(
      { x: 20, y: 10, width: 40, height: 30, rotation: 45 },
      { scrollX: -10, scrollY: 5, zoom: { value: 2 } },
    );
    expect(box.x).toBe(20);
    expect(box.y).toBe(30);
    expect(box.width).toBe(80);
    expect(box.height).toBe(60);
    expect(box.rotation).toBe(45);
  });

  test("defaults rotation to 0", () => {
    const box = sceneToViewport(
      { x: 0, y: 0, width: 8, height: 8 },
      { scrollX: 0, scrollY: 0, zoom: { value: 0.5 } },
    );
    expect(box.width).toBe(4);
    expect(box.height).toBe(4);
    expect(box.rotation).toBe(0);
  });

  test("source stays (x + scrollX) * zoom with no chrome offset", () => {
    const src = readFileSync(new URL("./viewport.ts", import.meta.url), "utf8");
    expect(src).toContain("(box.x + appState.scrollX) * zoom");
    expect(src).toContain("(box.y + appState.scrollY) * zoom");
    expect(src).not.toContain("offsetLeft");
    expect(src).not.toContain("offsetTop");
  });
});

describe("excalidraw-bridge sources", () => {
  test("do not import Excalidraw", () => {
    const dir = dirname(fileURLToPath(import.meta.url));
    const hits: string[] = [];
    for (const file of walk(dir)) {
      const text = readFileSync(file, "utf8");
      if (text.includes("@excalidraw/excalidraw")) hits.push(file);
    }
    expect(hits).toEqual([]);
  });
});
