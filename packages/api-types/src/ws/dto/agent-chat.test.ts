import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { WS_ACTIONS } from "../actions";
import { WS_EVENTS } from "../events";
import type {
  AgentCapabilities,
  AgentChatMeta,
  AgentDescriptor,
  AgentOptionSupport,
  AgentTool,
} from "./agent-chat";

type AssertNever<T extends never> = T;
type CapsKeys = keyof AgentCapabilities;
type UnexpectedCaps = Exclude<
  CapsKeys,
  "steer" | "resume" | "permission" | "configure" | "fork" | "rewind"
>;
type _CapsClosed = AssertNever<UnexpectedCaps>;
type SupportKeys = keyof AgentOptionSupport;
type UnexpectedSupport = Exclude<
  SupportKeys,
  "models" | "thinking" | "modes" | "permission_modes" | "fast"
>;
type _SupportClosed = AssertNever<UnexpectedSupport>;
type DescriptorKeys = keyof AgentDescriptor;
type UnexpectedDescriptor = Exclude<
  DescriptorKeys,
  "identity" | "capabilities" | "support" | "supported_options" | "current_config"
>;
type _DescriptorClosed = AssertNever<UnexpectedDescriptor>;
type ForbiddenMeta = Extract<
  keyof AgentChatMeta,
  "session_config_options" | "supports_steer" | "selected_model" | "selected_thinking" | "selected_mode"
>;
type _NoLegacyMeta = AssertNever<ForbiddenMeta>;
type ForbiddenTool = Extract<keyof AgentTool, "input" | "output" | "content" | "native">;
type _NoBagFields = AssertNever<ForbiddenTool>;

const __dirname = dirname(fileURLToPath(import.meta.url));
const dtoSource = readFileSync(join(__dirname, "./agent-chat.ts"), "utf8");

const AGENT_CHAT_ACTIONS = [
  "agent_chat_create",
  "agent_chat_list",
  "agent_chat_get",
  "agent_chat_messages",
  "agent_chat_rename",
  "agent_chat_configure",
  "agent_chat_delete",
  "agent_chat_subscribe",
  "agent_chat_unsubscribe",
  "agent_chat_send",
  "agent_chat_steer",
  "agent_chat_queue_add",
  "agent_chat_queue_update",
  "agent_chat_queue_reorder",
  "agent_chat_queue_delete",
  "agent_chat_cancel",
  "agent_chat_permission_respond",
  "agent_chat_session_op_respond",
  "agent_options_get",
  "agent_chat_prefs_get",
  "agent_chat_prefs_set",
] as const;

describe("APP-069 S18 Agent Chat stays on main /ws", () => {
  test("catalog keeps agent_chat_* plus agent_options_get", () => {
    for (const action of AGENT_CHAT_ACTIONS) {
      expect(WS_ACTIONS).toContain(action);
    }
    expect(WS_EVENTS).toContain("agent_chat_event");
    expect(WS_ACTIONS.filter((action) => action.startsWith("agent_chat_")).length).toBe(
      AGENT_CHAT_ACTIONS.filter((action) => action.startsWith("agent_chat_")).length,
    );
  });

  test("APP-069 S18 session_op_respond is the only new chat action and descriptor has support", () => {
    expect(WS_ACTIONS).toContain("agent_chat_session_op_respond");
    expect(dtoSource).toContain("support: AgentOptionSupport");
    expect(dtoSource).toContain("permission_modes");
    expect(dtoSource).toContain('type: "search_hits"');
    expect(WS_ACTIONS.filter((action) => action.includes("session_op")).length).toBe(1);
    expect(WS_ACTIONS.some((action) => action.includes("conversation"))).toBe(false);
    expect(WS_ACTIONS.some((action) => action.startsWith("rest_"))).toBe(false);
  });

  test("does not add a REST conversation action name", () => {
    expect(WS_ACTIONS.some((action) => action.includes("conversation"))).toBe(false);
    expect(WS_ACTIONS).not.toContain("agent_session_list");
    expect(dtoSource).not.toContain("session_config_options");
    expect(dtoSource).not.toContain("supports_steer");
    expect(dtoSource).toContain("descriptor: AgentDescriptor");
    expect(dtoSource).toContain("support: AgentOptionSupport");
    expect(dtoSource).toContain('type: "search_hits"');
    expect(dtoSource).toContain("params: AgentToolParams");
    expect(dtoSource).toContain("result?: AgentToolResult | null");
  });

  test("AgentChatEvent envelope includes optional turn_id", () => {
    const match = dtoSource.match(/export type AgentChatEvent = \{[\s\S]*?\};/);
    expect(match).toBeTruthy();
    expect(match![0]).toContain("chat_id: string");
    expect(match![0]).toContain("event_id: string");
    expect(match![0]).toContain("sequence: number");
    expect(match![0]).toContain("turn_id?: string | null");
    expect(match![0]).toContain("payload: AgentEvent");
  });
});
