// @ts-expect-error bun:test is available at runtime but not in tsconfig types
import { describe, expect, test } from "bun:test";
import type { FsValidateGitPathResponse } from "@/api/types";
import { getProjectImportReadiness, validationMatchesPath } from "./import-project-validation";

function validation(path: string, overrides: Partial<FsValidateGitPathResponse> = {}) {
  return {
    path,
    result: {
      is_valid: true,
      is_git_repo: true,
      suggested_name: "atmos",
      default_branch: "main",
      error: null,
      ...overrides,
    },
  };
}

describe("project import validation", () => {
  test("requires validation for the exact current path before import", () => {
    expect(validationMatchesPath(validation("/srv/atmos"), " /srv/atmos ")).toBe(true);
    expect(validationMatchesPath(validation("/srv/old"), "/srv/atmos")).toBe(false);
  });

  test("allows import only after a connected valid path and project name", () => {
    expect(
      getProjectImportReadiness({
        isConnected: true,
        isCreating: false,
        name: "Atmos",
        path: "/srv/atmos",
        validation: validation("/srv/atmos"),
      }),
    ).toEqual({ canImport: true, reason: null });
  });

  test("blocks create when the path was not validated or validation failed", () => {
    expect(
      getProjectImportReadiness({
        isConnected: true,
        isCreating: false,
        name: "Atmos",
        path: "/srv/atmos",
        validation: null,
      }).reason,
    ).toBe("Validate the current remote path before importing.");

    expect(
      getProjectImportReadiness({
        isConnected: true,
        isCreating: false,
        name: "Atmos",
        path: "/srv/atmos",
        validation: validation("/srv/atmos", {
          is_valid: false,
          is_git_repo: false,
          error: "Not a Git repository.",
        }),
      }),
    ).toEqual({ canImport: false, reason: "Not a Git repository." });
  });
});
