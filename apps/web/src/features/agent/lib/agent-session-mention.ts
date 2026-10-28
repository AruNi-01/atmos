/**
 * `@` → Agent Sessions chip.
 * The chip stays compact in the composer and expands on send into an
 * atmos-agent-bridge instruction aimed at the chosen sessions.
 */

export type AgentSessionMentionTarget = {
  provider: string;
  chatId: string;
  title: string;
};

type AgentSessionMentionPayload = {
  s: string;
  t: Array<{ p: string; c: string; n: string }>;
};

const TOKEN_PREFIX = "@agent-sessions:";

export const AGENT_SESSION_MENTION_PAGE_SIZE = 100;

export function matchesAgentSessionsMentionQuery(query: string): boolean {
  const q = query.trim().toLowerCase();
  if (!q) return true;
  return ["agent sessions", "agent", "sessions", "session", "会话"].some((label) =>
    label.includes(q),
  );
}

/** The session list has no text query. Filter loaded rows the same way `@` files do: case-insensitive contains on the title, then the provider, tool, or status. */
export function sessionMatchesMentionQuery(
  session: { title: string; provider: string; detail?: string; tool?: string; status?: string },
  rawQuery: string,
): boolean {
  const query = rawQuery.trim().toLowerCase();
  if (!query) return true;
  return [
    session.title,
    session.provider,
    session.detail ?? "",
    session.tool ?? "",
    session.status ?? "",
  ].some((value) => value.toLowerCase().includes(query));
}

/** Agent Bridge addresses a chat by `provider_id` (`claude`), not the session tool slug (`claude-code`). */
export function bridgeProviderId(session: {
  providerId?: string | null;
  tool?: string | null;
}): string {
  const providerId = session.providerId?.trim();
  if (providerId) return providerId;
  return session.tool?.trim() || "agent";
}

export function agentSessionMentionToken(input: {
  skillPath: string;
  targets: AgentSessionMentionTarget[];
}): string {
  const payload: AgentSessionMentionPayload = {
    s: input.skillPath,
    t: input.targets.map((target) => ({
      p: target.provider,
      c: target.chatId,
      n: target.title,
    })),
  };
  return `${TOKEN_PREFIX}${encodeURIComponent(JSON.stringify(payload))}`;
}

export function decodeAgentSessionMention(
  token: string,
): { skillPath: string; targets: AgentSessionMentionTarget[] } | null {
  if (!token.startsWith(TOKEN_PREFIX)) return null;
  try {
    const parsed = JSON.parse(
      decodeURIComponent(token.slice(TOKEN_PREFIX.length)),
    ) as AgentSessionMentionPayload | null;
    if (!parsed || typeof parsed.s !== "string" || !Array.isArray(parsed.t)) return null;
    const targets = parsed.t.flatMap((item) => {
      if (!item || typeof item.c !== "string" || !item.c.trim()) return [];
      return [
        {
          provider: typeof item.p === "string" && item.p.trim() ? item.p.trim() : "agent",
          chatId: item.c.trim(),
          title: typeof item.n === "string" ? item.n.trim() : "",
        },
      ];
    });
    if (targets.length === 0) return null;
    return { skillPath: parsed.s, targets };
  } catch {
    return null;
  }
}

export function expandAgentSessionMentionTokens(text: string): string {
  return text.replace(/@agent-sessions:\S+/g, (token) => {
    const decoded = decodeAgentSessionMention(token);
    if (!decoded) return token;
    const lines = decoded.targets.map(
      (target) => `--to-provider ${target.provider} --to-chat ${target.chatId}`,
    );
    return [
      `/skill:${decoded.skillPath}`,
      "Use atmos-agent-bridge. Send the user's message in this prompt to each session below with `atmos agent-bridge send`. Do not choose other sessions. Run the command once per session and put that message in --body.",
      ...lines,
    ].join("\n");
  });
}
