// @ts-expect-error bun:test is available at runtime but not in tsconfig types
import { describe, expect, test } from "bun:test";
import { formatSessionRowSubtitle } from "./session-row-subtitle";

describe("formatSessionRowSubtitle", () => {
  test("omits empty segments", () => {
    expect(
      formatSessionRowSubtitle({
        projectName: "Atmos",
        workspaceName: "mobile",
        branch: "",
        prState: null,
      }),
    ).toBe("Atmos · mobile");

    expect(
      formatSessionRowSubtitle({
        projectName: "Atmos",
        workspaceName: "mobile",
        branch: null,
        prState: "open",
      }),
    ).toBe("Atmos · mobile · Open");
  });

  test("scoped lists omit project and workspace", () => {
    expect(
      formatSessionRowSubtitle({
        projectName: "Atmos",
        workspaceName: "mobile",
        branch: "main",
        prState: "open",
        omitPlace: true,
      }),
    ).toBe("main · Open");
  });

  test("project-scoped omits workspace", () => {
    expect(
      formatSessionRowSubtitle({
        projectName: "Atmos",
        workspaceName: "mobile",
        branch: "main",
        prState: null,
        projectScoped: true,
      }),
    ).toBe("Atmos · main");
  });
});
