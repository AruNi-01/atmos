"use client";

import { wsRequest } from "@/api/ws/request";
import type {
  AgentBehaviourSettings,
  CodeAgentCustomPayload,
  FunctionSettings,
  LlmProvidersFile,
} from "@/api/ws/settings-api";

export interface SettingsBootstrapPayload {
  function_settings: FunctionSettings;
  llm_providers: LlmProvidersFile;
  code_agent_custom: CodeAgentCustomPayload;
  agent_behaviour_settings: AgentBehaviourSettings;
}

let snapshot: Partial<SettingsBootstrapPayload> | null = null;
let inflight: Promise<SettingsBootstrapPayload> | null = null;
let mutationVersion = 0;

const SECTION_KEYS = [
  "function_settings",
  "llm_providers",
  "code_agent_custom",
  "agent_behaviour_settings",
] as const satisfies ReadonlyArray<keyof SettingsBootstrapPayload>;

type SettingsBootstrapSection = (typeof SECTION_KEYS)[number];

const sectionVersions: Record<SettingsBootstrapSection, number> = {
  function_settings: 0,
  llm_providers: 0,
  code_agent_custom: 0,
  agent_behaviour_settings: 0,
};

function bumpSections(keys: SettingsBootstrapSection[]) {
  mutationVersion += 1;
  for (const key of keys) {
    sectionVersions[key] = mutationVersion;
  }
}

function isCompleteSnapshot(
  value: Partial<SettingsBootstrapPayload> | null,
): value is SettingsBootstrapPayload {
  return Boolean(
    value?.function_settings &&
      value.llm_providers &&
      value.code_agent_custom &&
      value.agent_behaviour_settings,
  );
}

function mergeSnapshot(partial: Partial<SettingsBootstrapPayload>) {
  snapshot = {
    ...(snapshot ?? {}),
    ...partial,
  };
  bumpSections(Object.keys(partial) as SettingsBootstrapSection[]);
}

async function loadBootstrap(): Promise<SettingsBootstrapPayload> {
  if (isCompleteSnapshot(snapshot)) {
    return snapshot;
  }

  if (inflight) return inflight;

  const requestMutationVersion = mutationVersion;
  const requestSectionVersions = { ...sectionVersions };

  inflight = wsRequest<SettingsBootstrapPayload>("settings_bootstrap_get")
    .then((payload) => {
      if (mutationVersion === requestMutationVersion) {
        snapshot = payload;
      } else {
        const next: Partial<SettingsBootstrapPayload> = { ...(snapshot ?? {}) };
        for (const key of SECTION_KEYS) {
          if (sectionVersions[key] === requestSectionVersions[key]) {
            next[key] = payload[key] as never;
          }
        }
        if (isCompleteSnapshot(next)) {
          snapshot = next;
        }
      }
      inflight = null;
      return isCompleteSnapshot(snapshot) ? snapshot : payload;
    })
    .catch((error) => {
      inflight = null;
      throw error;
    });

  return inflight;
}

export const settingsBootstrapCache = {
  getFunctionSettings: async (): Promise<FunctionSettings> => {
    return loadBootstrap().then((payload) => payload.function_settings);
  },

  getLlmProviders: async (): Promise<LlmProvidersFile> => {
    return loadBootstrap().then((payload) => payload.llm_providers);
  },

  getCodeAgentCustom: async (): Promise<CodeAgentCustomPayload> => {
    return loadBootstrap().then((payload) => payload.code_agent_custom);
  },

  getAgentBehaviourSettings: async (): Promise<AgentBehaviourSettings> => {
    return loadBootstrap().then((payload) => payload.agent_behaviour_settings);
  },

  patchFunctionSetting: (
    functionName: string,
    key: string,
    value: unknown,
  ): void => {
    const current = snapshot?.function_settings ?? {};
    const section = current[functionName];
    const nextSection =
      section && typeof section === "object" && !Array.isArray(section)
        ? { ...section, [key]: value }
        : { [key]: value };

    mergeSnapshot({
      function_settings: {
        ...current,
        [functionName]: nextSection,
      },
    });
  },

  setLlmProviders: (config: LlmProvidersFile): void => {
    mergeSnapshot({ llm_providers: config });
  },

  setCodeAgentCustom: (payload: CodeAgentCustomPayload): void => {
    mergeSnapshot({ code_agent_custom: payload });
  },

  setAgentBehaviourSettings: (settings: AgentBehaviourSettings): void => {
    const partial: Partial<SettingsBootstrapPayload> = {
      agent_behaviour_settings: settings,
    };

    if (snapshot?.code_agent_custom) {
      partial.code_agent_custom = {
        ...snapshot.code_agent_custom,
        idle_session_timeout_mins: settings.idle_session_timeout_mins,
      };
    }

    mergeSnapshot(partial);
  },

  invalidateAgentBehaviourSettings: (): void => {
    bumpSections(["agent_behaviour_settings"]);
    if (!snapshot) return;
    snapshot = { ...snapshot };
    delete snapshot.agent_behaviour_settings;
  },

  invalidate: (): void => {
    bumpSections([...SECTION_KEYS]);
    snapshot = null;
    inflight = null;
  },
};
