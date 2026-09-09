import type { AgentAuthMethod, AgentAuthRequiredPayload } from "@/api/rest-api";
import { parseAuthRequiredError } from "@/features/agent/lib/agent-runtime-socket";
import {
  canonicalizeChatProviderId,
  isTokenAuthMethodId,
} from "@/features/agent/lib/custom-agent-registry";
import type { AgentOptionsSnapshot } from "@/api/ws/agent-chat-api";

export const CLI_LOGIN_METHOD_PREFIX = "cli_login:";
export const NATIVE_OAUTH_METHOD_PREFIX = "native_oauth:";
export const AUTHENTICATED_HOLD_MS = 800;

export type CatalogAuthMethodKind = "browser" | "token" | "cli";

export type CatalogAuthStartResult =
  | { status: "still_required" }
  | { status: "authenticated"; refresh: boolean };

export function isCliLoginMethodId(methodId: string): boolean {
  return methodId.startsWith(CLI_LOGIN_METHOD_PREFIX);
}

export function isNativeOauthMethodId(methodId: string): boolean {
  return methodId.startsWith(NATIVE_OAUTH_METHOD_PREFIX);
}

export function catalogAuthMethodKind(methodId: string): CatalogAuthMethodKind {
  if (isTokenAuthMethodId(methodId)) return "token";
  if (isCliLoginMethodId(methodId)) return "cli";
  return "browser";
}

export function nativeCliLoginCommand(agentId: string): string {
  switch (canonicalizeChatProviderId(agentId)) {
    case "claude":
      return "claude auth login";
    case "codex":
      return "codex login";
    case "opencode":
      return "opencode auth login";
    case "grok":
      return "grok login";
    default:
      return "";
  }
}

/** Keep in sync with `crates/agent/src/options/probe/auth.rs` `native_auth_methods`. */
export function nativeAuthMethods(agentId: string): AgentAuthMethod[] {
  switch (canonicalizeChatProviderId(agentId)) {
    case "claude":
      return [
        {
          id: "native_oauth:claude",
          name: "Claude subscription",
          description: "claude auth login",
        },
        {
          id: "native_oauth:claude-console",
          name: "Anthropic console",
          description: "claude auth login --console",
        },
        { id: "token:ANTHROPIC_API_KEY", name: "API key", description: "ANTHROPIC_API_KEY" },
      ];
    case "codex":
      return [
        { id: "native_oauth:codex", name: "ChatGPT", description: "codex login" },
        { id: "token:OPENAI_API_KEY", name: "API key", description: "OPENAI_API_KEY" },
      ];
    case "opencode":
      return [
        {
          id: `${CLI_LOGIN_METHOD_PREFIX}opencode`,
          name: "Sign in",
          description: "opencode auth login",
        },
      ];
    case "pi":
      return [
        { id: "token:GEMINI_API_KEY", name: "Google API key", description: "GEMINI_API_KEY" },
        {
          id: "token:ANTHROPIC_API_KEY",
          name: "Anthropic API key",
          description: "ANTHROPIC_API_KEY",
        },
        { id: "token:OPENAI_API_KEY", name: "OpenAI API key", description: "OPENAI_API_KEY" },
      ];
    case "grok":
      return [
        { id: "native_oauth:grok", name: "Grok", description: "grok login" },
        { id: "native_oauth:grok-oauth", name: "xAI", description: "grok login --oauth" },
      ];
    default:
      return [];
  }
}

export function catalogAuthFromSnapshot(
  snapshot: Pick<AgentOptionsSnapshot, "agent_id" | "status" | "message">,
): AgentAuthRequiredPayload | null {
  const parsed = parseAuthRequiredError(snapshot.message ?? "");
  if (parsed) return parsed;
  if (snapshot.status !== "auth_required") return null;
  const methods = nativeAuthMethods(snapshot.agent_id);
  const command = nativeCliLoginCommand(snapshot.agent_id);
  return {
    request_id: `catalog-${snapshot.agent_id}`,
    methods: methods.length > 0
      ? methods
      : [
          {
            id: `${CLI_LOGIN_METHOD_PREFIX}${canonicalizeChatProviderId(snapshot.agent_id)}`,
            name: "Sign in",
            description: command || "Sign in from the agent CLI, then continue.",
          },
        ],
    message: snapshot.message?.trim() || "Authentication required by agent",
  };
}

export function catalogAuthToastDescription(
  payload: AgentAuthRequiredPayload,
  fallback: string,
): string {
  const message = payload.message.trim();
  if (!message || message.startsWith("ACP_AUTH_REQUIRED::")) return fallback;
  return message;
}
