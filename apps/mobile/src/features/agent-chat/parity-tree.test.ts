// @ts-expect-error bun:test is available at runtime but not in tsconfig types
import { expect, test } from "bun:test";
import { parityFixtureById, projectParityTree as fromPackage } from "@atmos/agent-transcript";
import { projectParityTree as fromMobile } from "./parity-tree";

test("mobile re-exports the shared projector", () => {
  expect(fromMobile).toBe(fromPackage);
  const fixture = parityFixtureById("F3");
  expect(fixture).toBeDefined();
  const messages = fixture!.messages;
  expect(fromMobile(messages)).toEqual(fromPackage(messages));
  expect(
    fromMobile(messages).some((node) => node.kind === "process" && node.label === "Worked for 42s"),
  ).toBe(true);
});
