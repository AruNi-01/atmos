// @ts-expect-error bun:test is available at runtime but not in tsconfig types
import { describe, expect, test } from "bun:test";
import {
  getCreateWorkspaceReadiness,
  selectCreateWorkspaceProjectGuid,
} from "./create-workspace-readiness";

const projects = [
  { label: "Atmos", value: "project-atmos" },
  { label: "Docs", value: "project-docs" },
];

describe("create workspace readiness", () => {
  test("uses the scoped project when no current project has been chosen", () => {
    expect(
      selectCreateWorkspaceProjectGuid({
        currentProjectGuid: "",
        initialProjectGuid: "project-docs",
        projectOptions: projects,
      }),
    ).toBe("project-docs");
  });

  test("keeps an existing valid current project selection", () => {
    expect(
      selectCreateWorkspaceProjectGuid({
        currentProjectGuid: "project-atmos",
        initialProjectGuid: "project-docs",
        projectOptions: projects,
      }),
    ).toBe("project-atmos");
  });

  test("falls back to the first project when the scoped project is unavailable", () => {
    expect(
      selectCreateWorkspaceProjectGuid({
        currentProjectGuid: "",
        initialProjectGuid: "missing-project",
        projectOptions: projects,
      }),
    ).toBe("project-atmos");
  });

  test("blocks creation while disconnected or missing required fields", () => {
    expect(
      getCreateWorkspaceReadiness({
        isAwaitingSetup: false,
        isConnected: false,
        isCreating: false,
        projectGuid: "project-atmos",
        title: "Ship mobile",
      }),
    ).toEqual({ canCreate: false, reason: "Connect to a Computer before creating a workspace." });

    expect(
      getCreateWorkspaceReadiness({
        isAwaitingSetup: false,
        isConnected: true,
        isCreating: false,
        projectGuid: "project-atmos",
        title: "",
      }),
    ).toEqual({ canCreate: false, reason: "Enter a workspace title." });
  });

  test("allows creation when connected with a project and title", () => {
    expect(
      getCreateWorkspaceReadiness({
        isAwaitingSetup: false,
        isConnected: true,
        isCreating: false,
        projectGuid: "project-atmos",
        title: "Ship mobile",
      }),
    ).toEqual({ canCreate: true, reason: null });
  });
});
