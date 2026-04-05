import type { SkillInfo } from '@/api/ws-api';

// Agent display names
export const AGENT_CONFIG: Record<string, { name: string }> = {
  unified: { name: 'Unified' },
  amp: { name: 'Amp' },
  antigravity: { name: 'Antigravity' },
  augment: { name: 'Augment' },
  claude: { name: 'Claude' },
  'in-project': { name: 'InsideTheProject' },
  cline: { name: 'Cline' },
  codebuddy: { name: 'CodeBuddy' },
  codex: { name: 'Codex' },
  commandcode: { name: 'Command Code' },
  continue: { name: 'Continue' },
  crush: { name: 'Crush' },
  cursor: { name: 'Cursor' },
  factory: { name: 'Droid' },
  gemini: { name: 'Gemini' },
  copilot: { name: 'Copilot' },
  goose: { name: 'Goose' },
  junie: { name: 'Junie' },
  iflow: { name: 'iFlow' },
  kilocode: { name: 'Kilo Code' },
  kimi: { name: 'Kimi' },
  kiro: { name: 'Kiro' },
  kode: { name: 'Kode' },
  mcpjam: { name: 'MCPJam' },
  vibe: { name: 'Mistral Vibe' },
  mux: { name: 'Mux' },
  opencode: { name: 'OpenCode' },
  openclaude: { name: 'OpenClaude' },
  openhands: { name: 'OpenHands' },
  pi: { name: 'Pi' },
  qoder: { name: 'Qoder' },
  qwen: { name: 'Qwen' },
  replit: { name: 'Replit' },
  roo: { name: 'Roo Code' },
  trae: { name: 'Trae' },
  windsurf: { name: 'Windsurf' },
  zed: { name: 'Zed' },
  zencoder: { name: 'Zencoder' },
  neovate: { name: 'Neovate' },
  pochi: { name: 'Pochi' },
  adal: { name: 'AdaL' },
};

// Map skills agent keys to AgentIcon registryIds
// AgentIcon handles icon resolution (remaps, aliases, fallbacks)
export const AGENT_REGISTRY_ID_MAP: Record<string, string> = {
  amp: 'amp',
  antigravity: 'antigravity',
  augment: 'auggie',
  claude: 'claude',
  cline: 'cline',
  codebuddy: 'codebuddy-code',
  codex: 'codex',
  cursor: 'cursor',
  factory: 'factory-droid',
  gemini: 'gemini',
  copilot: 'github-copilot',
  goose: 'goose',
  junie: 'junie',
  kilocode: 'kilocode',
  kimi: 'kimi',
  kiro: 'kiro',
  opencode: 'opencode',
  qoder: 'qoder',
  qwen: 'qwen-code',
  roo: 'roo',
  trae: 'trae',
  vibe: 'mistral-vibe',
  windsurf: 'windsurf',
};

export function getAgentConfig(agent: string) {
  return AGENT_CONFIG[agent] || { name: agent };
}

export function getAgentRegistryId(agent: string): string | null {
  return AGENT_REGISTRY_ID_MAP[agent] ?? null;
}

/** Sort agents so "unified" always comes first */
export function sortAgents(agents: string[]): string[] {
  return [...agents].sort((a, b) => {
    if (a === 'unified') return -1;
    if (b === 'unified') return 1;
    return 0;
  });
}

function isUnifiedPath(path: string) {
  return path.includes('/.agents/skills/') || path.includes('\\.agents\\skills\\');
}

export function getAgentStatus(skill: SkillInfo, agent: string): 'enabled' | 'disabled' | 'partial' {
  const placements = skill.placements.filter((placement) => {
    if (agent === 'unified') {
      return isUnifiedPath(placement.original_path) || isUnifiedPath(placement.path);
    }
    return placement.agent === agent;
  });

  const hasEnabled = placements.some((placement) => placement.status === 'enabled');
  const hasDisabled = placements.some((placement) => placement.status === 'disabled');

  if (hasEnabled && hasDisabled) {
    return 'partial';
  }
  if (hasEnabled) {
    return 'enabled';
  }
  return 'disabled';
}
