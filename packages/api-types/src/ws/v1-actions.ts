/** Historical v1 domain cut (APP-064 M6). Full catalog is now on `WsContract`. */
import { WS_ACTIONS, type WsAction } from "./actions";

const V1_PREFIXES = [
  "fs_",
  "git_",
  "github_",
  "group_",
  "linear_",
  "project_",
  "workspace_",
] as const;

/** Skills action that shares the `git_` prefix but is not a git domain action. */
const V1_PREFIX_EXCLUDES = new Set<string>(["git_commit_skill_system_status"]);

const V1_EXTRAS = new Set<string>(["script_get", "script_save"]);

export function isV1MappedAction(action: string): boolean {
  if (V1_PREFIX_EXCLUDES.has(action)) return false;
  if (V1_EXTRAS.has(action)) return true;
  return V1_PREFIXES.some((prefix) => action.startsWith(prefix));
}

export const V1_WS_ACTIONS: WsAction[] = WS_ACTIONS.filter(isV1MappedAction);
