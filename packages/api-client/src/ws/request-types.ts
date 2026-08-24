/**
 * Compile-time contract checks for WsSession.request (APP-064).
 * Imported by typecheck; not a runtime test.
 */
import type { WsSession } from "./session";

declare const session: WsSession;

const home = session.request("fs_get_home_dir");
void home.then((result) => result.path);

const status = session.request("git_get_status", { path: "/repo" });
void status.then((result) => result.current_branch);

session.request("agent_list");
session.requestUnchecked("dynamic_action", { any: true });

const models = session.request("terminal_agent_models_get", { agent_id: "codex" });
void models.then((result) => result.models);

session.onNotification("agent_notification", (payload) => {
  void payload.session_id;
});

// @ts-expect-error unknown action is not in the catalog
session.request("not_an_action", {});

// @ts-expect-error mapped input rejects unknown fields
session.request("git_get_status", { not_a_field: true });
