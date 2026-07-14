"use client";

import { wsRequestForComputerScope } from "@/api/ws/request";
import { queryKeys } from "@/api/query/query-keys";
import {
  getComputerQueryScope,
  type ComputerQueryScope,
} from "@/api/query/query-scope";
import { getAtmosWebQueryClient } from "@/providers/app/query-client";
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

const SECTION_KEYS = [
  "function_settings",
  "llm_providers",
  "code_agent_custom",
  "agent_behaviour_settings",
] as const satisfies ReadonlyArray<keyof SettingsBootstrapPayload>;

type SettingsBootstrapSection = (typeof SECTION_KEYS)[number];

/** Tracks in-flight section mutations so late bootstrap responses do not clobber them. */
let mutationVersion = 0;
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

function bootstrapQueryKey(scope: ComputerQueryScope = getComputerQueryScope()) {
  return queryKeys.computer.settingsBootstrap(scope);
}

function readSnapshot(): SettingsBootstrapPayload | undefined {
  try {
    return getAtmosWebQueryClient().getQueryData<SettingsBootstrapPayload>(bootstrapQueryKey());
  } catch {
    return undefined;
  }
}

function writeSnapshot(payload: SettingsBootstrapPayload): void {
  try {
    getAtmosWebQueryClient().setQueryData(bootstrapQueryKey(), payload);
  } catch {
    // Outside browser (SSR / tests without Query): no-op; next ensure will fetch.
  }
}

function patchSnapshot(
  updater: (current: SettingsBootstrapPayload | undefined) => SettingsBootstrapPayload | undefined,
  scope?: ComputerQueryScope,
): void {
  try {
    const client = getAtmosWebQueryClient();
    const key = bootstrapQueryKey(scope);
    client.setQueryData<SettingsBootstrapPayload | undefined>(key, updater);
  } catch {
    // ignore
  }
}

async function fetchBootstrapFromServer(
  scope: ComputerQueryScope = getComputerQueryScope(),
): Promise<SettingsBootstrapPayload> {
  const requestMutationVersion = mutationVersion;
  const requestSectionVersions = { ...sectionVersions };
  // Capture scope key before await so a computer switch mid-flight cannot
  // merge against a different Query entry than the one that started this fetch.
  const queryKey = bootstrapQueryKey(scope);
  const payload = await wsRequestForComputerScope<SettingsBootstrapPayload>(
    scope,
    "settings_bootstrap_get",
  );

  if (mutationVersion === requestMutationVersion) {
    return payload;
  }

  let current: SettingsBootstrapPayload | undefined;
  try {
    current = getAtmosWebQueryClient().getQueryData<SettingsBootstrapPayload>(queryKey);
  } catch {
    current = undefined;
  }
  const next: Partial<SettingsBootstrapPayload> = { ...(current ?? {}) };
  for (const key of SECTION_KEYS) {
    if (sectionVersions[key] === requestSectionVersions[key]) {
      next[key] = payload[key] as never;
    }
  }

  if (
    next.function_settings &&
    next.llm_providers &&
    next.code_agent_custom &&
    next.agent_behaviour_settings
  ) {
    return next as SettingsBootstrapPayload;
  }

  return payload;
}

async function ensureSettingsBootstrap(): Promise<SettingsBootstrapPayload> {
  const scope = getComputerQueryScope();
  if (typeof window === "undefined") {
    return fetchBootstrapFromServer(scope);
  }
  try {
    const client = getAtmosWebQueryClient();
    const key = bootstrapQueryKey(scope);
    return client.ensureQueryData({
      queryKey: key,
      queryFn: () => fetchBootstrapFromServer(scope),
      staleTime: 15_000,
    });
  } catch {
    return fetchBootstrapFromServer(scope);
  }
}

export { ensureSettingsBootstrap };

export const settingsBootstrapQueryFn = fetchBootstrapFromServer;

export const settingsBootstrapCache = {
  getFunctionSettings: async (): Promise<FunctionSettings> => {
    return ensureSettingsBootstrap().then((payload) => payload.function_settings);
  },

  getLlmProviders: async (): Promise<LlmProvidersFile> => {
    return ensureSettingsBootstrap().then((payload) => payload.llm_providers);
  },

  getCodeAgentCustom: async (): Promise<CodeAgentCustomPayload> => {
    return ensureSettingsBootstrap().then((payload) => payload.code_agent_custom);
  },

  getAgentBehaviourSettings: async (): Promise<AgentBehaviourSettings> => {
    return ensureSettingsBootstrap().then((payload) => payload.agent_behaviour_settings);
  },

  patchFunctionSetting: (
    functionName: string,
    key: string,
    value: unknown,
    scope?: ComputerQueryScope,
  ): void => {
    bumpSections(["function_settings"]);
    patchSnapshot((current) => {
      if (!current) return current;
      const settings = current.function_settings ?? {};
      const section = settings[functionName];
      const nextSection =
        section && typeof section === "object" && !Array.isArray(section)
          ? { ...section, [key]: value }
          : { [key]: value };
      return {
        ...current,
        function_settings: {
          ...settings,
          [functionName]: nextSection,
        },
      };
    }, scope);
  },

  setLlmProviders: (config: LlmProvidersFile): void => {
    bumpSections(["llm_providers"]);
    patchSnapshot((current) => {
      if (!current) return current;
      return { ...current, llm_providers: config };
    });
  },

  setCodeAgentCustom: (payload: CodeAgentCustomPayload): void => {
    bumpSections(["code_agent_custom"]);
    patchSnapshot((current) => {
      if (!current) return current;
      return { ...current, code_agent_custom: payload };
    });
  },

  setAgentBehaviourSettings: (settings: AgentBehaviourSettings): void => {
    bumpSections(["agent_behaviour_settings", "code_agent_custom"]);
    patchSnapshot((current) => {
      if (!current) return current;
      const next: SettingsBootstrapPayload = {
        ...current,
        agent_behaviour_settings: settings,
      };
      if (current.code_agent_custom) {
        next.code_agent_custom = {
          ...current.code_agent_custom,
          idle_session_timeout_mins: settings.idle_session_timeout_mins,
        };
      }
      return next;
    });
  },

  invalidateAgentBehaviourSettings: (): void => {
    bumpSections(["agent_behaviour_settings"]);
    try {
      const client = getAtmosWebQueryClient();
      const key = bootstrapQueryKey();
      // Do not leave a incomplete-but-fresh cache entry for imperative readers.
      // Invalidate so the next get() refetches a complete bootstrap payload.
      void client.invalidateQueries({ queryKey: key });
    } catch {
      // ignore
    }
  },

  invalidate: (): void => {
    bumpSections([...SECTION_KEYS]);
    try {
      const client = getAtmosWebQueryClient();
      const key = bootstrapQueryKey();
      void client.cancelQueries({ queryKey: key });
      client.removeQueries({ queryKey: key });
    } catch {
      // ignore outside browser
    }
  },

  /** Test/debug: read current Query snapshot without fetching. */
  peek: (): SettingsBootstrapPayload | undefined => readSnapshot(),

  writeSnapshot,
};
