const AGENT_FALLBACK = "Agent";

function readEnv(name: string): string | undefined {
  if (typeof process === "undefined" || !process.env) return undefined;
  const value = process.env[name];
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

/** Human display name. Agents use their own name, otherwise "Agent". */
export function resolveCollaboratorName(
  role: "human" | "agent",
  explicit?: string | null,
): string {
  const named = explicit?.trim();
  if (named) return named;
  if (role === "agent") {
    return readEnv("PT_DESIGN_AGENT_NAME") ?? readEnv("AGENT_NAME") ?? AGENT_FALLBACK;
  }
  return "You";
}

export function isAgentName(name: string): boolean {
  return name.trim().toLowerCase() === "agent" || /agent/i.test(name);
}

const PALETTE = [
  { background: "#f5c6a0", stroke: "#9a6b3f" },
  { background: "#86efac", stroke: "#166534" },
  { background: "#93c5fd", stroke: "#1d4ed8" },
  { background: "#f9a8d4", stroke: "#9d174d" },
  { background: "#fde68a", stroke: "#92400e" },
];

const AGENT_COLOR = { background: "#7c3aed", stroke: "#ede9fe" };

export function colorForCollaborator(name: string, socketId = ""): { background: string; stroke: string } {
  if (isAgentName(name)) return AGENT_COLOR;
  const seed = `${name}:${socketId}`;
  let hash = 0;
  for (let i = 0; i < seed.length; i += 1) hash = (hash * 31 + seed.charCodeAt(i)) >>> 0;
  return PALETTE[hash % PALETTE.length]!;
}
