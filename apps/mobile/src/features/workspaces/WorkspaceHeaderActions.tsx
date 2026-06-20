import { Platform } from "react-native";
import type { ComponentType } from "react";
import type { WorkspaceHeaderActionsProps } from "./WorkspaceHeaderActions.types";

type WorkspaceHeaderActionsModule = {
  WorkspaceHeaderActions: ComponentType<WorkspaceHeaderActionsProps>;
};

declare const require: (id: string) => WorkspaceHeaderActionsModule;

const AndroidWorkspaceHeaderActions =
  Platform.OS === "ios"
    ? null
    : require("./WorkspaceHeaderActions.android").WorkspaceHeaderActions;

export const WorkspaceHeaderActions: ComponentType<WorkspaceHeaderActionsProps> =
  AndroidWorkspaceHeaderActions ?? function IosHeaderActionsFallback() {
    return null;
  };
