// @ts-expect-error bun:test is available at runtime but not in tsconfig types
import { describe, expect, test } from "bun:test";
import { pathDisplay } from "./path-display";

describe("pathDisplay", () => {
  test("returns the path text and never an editor route", () => {
    expect(pathDisplay("  /repo/src/main.ts  ")).toEqual({
      text: "/repo/src/main.ts",
      route: null,
    });
  });
});
