import { describe, expect, it } from "bun:test";
import {
  agentChatHistoryListRequest,
  optionsSnapshotToConfigOptions,
  chatTitleFromPrompt,
  chatsToHistoryRows,
  filterAgentChatHistoryRows,
  defaultOptionsModelId,
  isOptionsModelsLoading,
  parsePlan,
  probingOptionsSnapshot,
  overlayPendingConfigValues,
  splitComposerConfigOptions,
  isComposerTrailingConfigOption,
  isThinkingConfigId,
  thinkingChoices,
  thinkingLevelLabel,
  thinkingLevelMessageKey,
  permissionModeMessageKey,
  configPickerGroupMessageKey,
  descriptorToConfigOptions,
  descriptorForComposerProvider,
  fillEmptyDescriptorOptionsFromSnapshot,
  composerConfigOptions,
  displayedComposerConfigValue,
  configKindMatches,
} from "@/features/agent/lib/agent-chat-thread";
import type { AgentCapabilities, AgentDescriptor, AgentOptionSupport } from "@atmos/api-types/ws/dto/agent-chat";

describe("agent chat helpers", () => {
  it("uses the first line of the prompt as a fallback session title", () => {
    expect(chatTitleFromPrompt("hello\nworld")).toBe("hello");
    expect(chatTitleFromPrompt(` ${"a".repeat(80)} `)).toHaveLength(60);
  });

  it("filters history rows by chat title only", () => {
    const rows = chatsToHistoryRows([
      {
        id: "1",
        title: "Fix auth",
        cwd: "/tmp/app",
        workspace_id: null,
        project_id: null,
        provider_id: "claude",
        updated_at: "2026-08-30T12:00:00.000Z",
        last_message_at: null,
        deleted: false,
      },
      {
        id: "2",
        title: "Write docs",
        cwd: "/tmp/auth-service",
        workspace_id: "ws-1",
        project_id: "proj-1",
        provider_id: "claude",
        updated_at: "2026-08-30T12:00:00.000Z",
        last_message_at: null,
        deleted: false,
      },
    ]);
    expect(filterAgentChatHistoryRows(rows, "auth").map((row) => row.chat_id)).toEqual(["1"]);
    expect(filterAgentChatHistoryRows(rows, "  ")).toHaveLength(2);
    expect(filterAgentChatHistoryRows(rows, "missing")).toHaveLength(0);
  });

  it("parses a plan payload into the composer plan model", () => {
    const plan = parsePlan({
      entries: [{ content: "Inspect", priority: "high", status: "completed" }],
    });
    expect(plan?.entries[0]?.content).toBe("Inspect");
    expect(parsePlan(null)).toBeNull();
    expect(parsePlan({ entries: [] })).toBeNull();
  });

  it("treats a missing or probing catalog as models still loading", () => {
    expect(isOptionsModelsLoading(null, "cursor")).toBe(true);
    expect(
      isOptionsModelsLoading(
        {
          agent_id: "cursor",
          status: "probing",
          models: [],
          modes: [],
          thinking: { type: "none" },
          strategies_used: [],
          fetched_at: "",
          source: "live",
          message: null,
        },
        "cursor",
      ),
    ).toBe(true);
    expect(
      isOptionsModelsLoading(
        {
          agent_id: "claude",
          status: "ok",
          models: [{ id: "opus", label: "Opus" }],
          modes: [],
          thinking: { type: "none" },
          strategies_used: [],
          fetched_at: "",
          source: "cache",
          message: null,
        },
        "cursor",
      ),
    ).toBe(true);
    expect(
      isOptionsModelsLoading(
        {
          agent_id: "cursor",
          status: "ok",
          models: [],
          modes: [],
          thinking: { type: "none" },
          strategies_used: [],
          fetched_at: "",
          source: "live",
          message: null,
        },
        "cursor",
      ),
    ).toBe(false);
    expect(
      isOptionsModelsLoading(
        {
          agent_id: "cursor",
          status: "ok",
          models: [{ id: "gpt", label: "GPT" }],
          modes: [],
          thinking: { type: "none" },
          strategies_used: [],
          fetched_at: "",
          source: "cache",
          message: null,
        },
        "cursor",
      ),
    ).toBe(false);
    expect(isOptionsModelsLoading(probingOptionsSnapshot("opencode"), "opencode")).toBe(true);
  });

  it("picks the catalog default model when none is selected yet", () => {
    expect(
      defaultOptionsModelId(
        {
          agent_id: "cursor",
          status: "ok",
          models: [
            { id: "auto", label: "Auto" },
            { id: "gemini-3.5-flash", label: "Gemini 3.5 Flash", is_default: true },
          ],
          modes: [],
          thinking: { type: "encoded_in_model" },
          strategies_used: [],
          fetched_at: "",
          source: "cache",
          message: null,
        },
        "",
      ),
    ).toBe("gemini-3.5-flash");
    const displayed = composerConfigOptions({
      descriptor: null,
      catalog: {
        agent_id: "codex",
        status: "ok",
        models: [
          { id: "gpt-5.6-sol", label: "GPT-5.6" },
          { id: "gpt-5.6-luna", label: "GPT-5.6-Luna", is_default: true },
        ],
        modes: [{ id: "default", label: "Default", is_default: true }],
        thinking: { type: "enum", options: ["low", "high"] },
        strategies_used: [],
        fetched_at: "",
        source: "cache",
        message: null,
      },
      providerId: "codex",
      modelId: "",
      thinkingId: "",
      modeId: "",
      permissionModeId: "",
    });
    expect(displayedComposerConfigValue(displayed, "model", "")).toBe("gpt-5.6-luna");
    expect(displayedComposerConfigValue(displayed, "thinking", "")).toBe("low");
    expect(displayedComposerConfigValue(displayed, "mode", "")).toBe("default");
    expect(displayedComposerConfigValue(displayed, "model", "gpt-5.6-sol")).toBe("gpt-5.6-sol");
    expect(displayedComposerConfigValue(displayed, "thinking", "xhigh")).toBe("low");
    const options = optionsSnapshotToConfigOptions(
      {
        agent_id: "cursor",
        status: "ok",
        models: [
          { id: "auto", label: "Auto" },
          { id: "gemini-3.5-flash", label: "Gemini 3.5 Flash", is_default: true },
        ],
        modes: [],
        thinking: { type: "encoded_in_model" },
        strategies_used: [],
        fetched_at: "",
        source: "cache",
        message: null,
      },
      "",
      "",
    );
    expect(options[0]?.currentValue).toBe("gemini-3.5-flash");
    expect(options[0]?.options.map((item) => item.name)).toEqual([
      "Auto",
      "Gemini 3.5 Flash",
    ]);
  });

  it("shows an ACP-reported model before the catalog list arrives", () => {
    const options = optionsSnapshotToConfigOptions(
      probingOptionsSnapshot("claude"),
      "grok-4",
      "",
    );
    expect(options).toEqual([
      {
        id: "model",
        name: "Model",
        type: "select",
        currentValue: "grok-4",
        options: [{ value: "grok-4", name: "grok-4" }],
      },
    ]);
  });

  it("uses each Factory Droid model's own reasoning ladder", () => {
    const catalog = {
      agent_id: "factory-droid",
      status: "ok" as const,
      models: [
        {
          id: "claude-opus-5",
          label: "Opus 5",
          thinking: {
            type: "enum",
            options: ["off", "low", "medium", "high", "xhigh", "max"],
          },
        },
        {
          id: "gpt-5.3-codex",
          label: "GPT-5.3-Codex",
          thinking: { type: "enum", options: ["low", "medium", "high", "xhigh"] },
        },
        {
          id: "auto",
          label: "Auto Model",
          thinking: { type: "none" },
        },
      ],
      modes: [],
      thinking: { type: "manual", arg: "--reasoning-effort" },
      strategies_used: [],
      fetched_at: "",
      source: "cache" as const,
      message: null,
    };
    expect(thinkingChoices(catalog, "claude-opus-5")).toEqual([
      "off",
      "low",
      "medium",
      "high",
      "xhigh",
      "max",
    ]);
    expect(thinkingChoices(catalog, "gpt-5.3-codex")).toEqual([
      "low",
      "medium",
      "high",
      "xhigh",
    ]);
    expect(thinkingChoices(catalog, "auto")).toEqual([]);
    const opusOptions = optionsSnapshotToConfigOptions(catalog, "claude-opus-5", "high");

    expect(opusOptions.find((item) => item.id === "thinking")?.options.map((item) => item.name)).toEqual([
      "Off",
      "Low",
      "Medium",
      "High",
      "Extra high",
      "Max",
    ]);
    expect(thinkingLevelLabel("xhigh")).toBe("Extra high");
    expect(thinkingLevelMessageKey("xhigh")).toBe("extraHigh");
    expect(thinkingLevelMessageKey("extra_high")).toBe("extraHigh");
    expect(permissionModeMessageKey("yolo")).toBe("yolo");
    expect(permissionModeMessageKey("bypassPermissions")).toBe("yolo");
    expect(permissionModeMessageKey("accept_edits")).toBe("acceptEdits");
    expect(permissionModeMessageKey("auto")).toBe("auto");
    expect(permissionModeMessageKey("ask_always")).toBe("askAlways");
    expect(permissionModeMessageKey("on-request")).toBe("askAlways");
    expect(configPickerGroupMessageKey("permission_mode")).toBe("permissionMode");
    expect(
      thinkingChoices(
        {
          ...catalog,
          models: [
            ...catalog.models,
            {
              id: "kimi-k3",
              label: "Kimi K3 (Droid Core)",
              thinking: { type: "none" },
            },
          ],
        },
        "kimi-k3",
      ),
    ).toEqual([]);
  });

  it("does not reuse Cursor session effort for models without their own ladder", () => {
    const catalog = {
      agent_id: "cursor",
      status: "ok" as const,
      models: [
        {
          id: "claude-opus-5",
          label: "Claude Opus 5",
          is_default: true,
          thinking: {
            type: "enum",
            arg: "effort",
            options: ["low", "medium", "high", "xhigh", "max"],
          },
        },
        { id: "composer-2.5", label: "Composer 2.5" },
        {
          id: "auto",
          label: "Auto",
          thinking: { type: "none" },
        },
      ],
      modes: [],
      thinking: {
        type: "enum",
        arg: "effort",
        options: ["low", "medium", "high", "xhigh", "max"],
      },
      strategies_used: [],
      fetched_at: "",
      source: "cache" as const,
      message: null,
    };
    expect(thinkingChoices(catalog, "claude-opus-5")).toEqual([
      "low",
      "medium",
      "high",
      "xhigh",
      "max",
    ]);
    expect(thinkingChoices(catalog, "composer-2.5")).toEqual([]);
    expect(thinkingChoices(catalog, "auto")).toEqual([]);
    const options = descriptorToConfigOptions({
      identity: { id: "cursor", name: "Cursor" },
      capabilities: {
        steer: "unsupported",
        resume: "unsupported",
        permission: "supported",
        configure: "supported",
        fork: "unsupported",
        rewind: "unsupported",
      },
      support: {
        models: "supported",
        thinking: "supported",
        modes: "unsupported",
        permission_modes: "supported",
        fast: "supported",
      },
      supported_options: {
        models: catalog.models,
        thinking: catalog.thinking,
        modes: [],
        permission_modes: [],
        fast: [],
      },
      current_config: { model: "composer-2.5", thinking: null },
    } as never);
    expect(options.find((item) => item.id === "thinking")).toBeUndefined();
  });

  it("puts ACP reasoning-effort options on the trailing thinking control", () => {
    expect(
      isComposerTrailingConfigOption({ id: "reasoning_effort", category: "thinking" }),
    ).toBe(true);
    expect(isThinkingConfigId("reasoningEffort")).toBe(true);
  });

  it("builds model and thinking config options from the catalog", () => {
    const options = optionsSnapshotToConfigOptions(
      {
        agent_id: "claude",
        status: "ok",
        models: [{ id: "opus", label: "Opus" }],
        modes: [],
        thinking: { type: "enum", options: ["low", "high"] },
        strategies_used: [],
        fetched_at: "",
        source: "cache",
        message: null,
      },
      "opus",
      "high",
    );
    expect(options.map((item) => item.id)).toEqual(["model", "thinking"]);
    expect(options[0]?.currentValue).toBe("opus");
    expect(options[1]?.currentValue).toBe("high");
  });

  it("puts catalog modes on the leading composer cluster and model/thinking on the trailing cluster", () => {
    const options = optionsSnapshotToConfigOptions(
      {
        agent_id: "codex",
        status: "ok",
        models: [{ id: "gpt-5", label: "GPT-5" }],
        modes: [
          { id: "ask", label: "Ask" },
          { id: "agent", label: "Agent", is_default: true },
          { id: "debug", label: "Debug" },
        ],
        thinking: { type: "enum", options: ["low", "high"] },
        strategies_used: [],
        fetched_at: "",
        source: "cache",
        message: null,
      },
      "gpt-5",
      "low",
      "",
    );
    expect(options.map((item) => item.id)).toEqual(["mode", "model", "thinking"]);
    expect(options[0]?.currentValue).toBe("agent");
    const split = splitComposerConfigOptions(options);
    expect(split.leading.map((item) => item.id)).toEqual(["mode"]);
    expect(split.trailing.map((item) => item.id)).toEqual(["model", "thinking"]);
  });

  it("maps list rows to chat history identity", () => {
    const rows = chatsToHistoryRows([
      {
        id: "chat-1",
        title: "Fix auth",
        cwd: "/tmp/app",
        workspace_id: "ws-1",
        project_id: null,
        provider_id: "claude",
        updated_at: "2026-08-28T00:00:00.000Z",
        last_message_at: null,
        deleted: false,
      },
    ]);
    expect(rows[0]).toEqual({
      chat_id: "chat-1",
      provider_id: "claude",
      title: "Fix auth",
      cwd: "/tmp/app",
      origin: "normal",
      updated_at: "2026-08-28T00:00:00.000Z",
    });
  });

  it("lists every conversation on the standalone history sidebar", () => {
    expect(agentChatHistoryListRequest({ variant: "standalone" })).toEqual({ all: true });
    expect(
      agentChatHistoryListRequest({
        variant: "standalone",
        workspaceId: "ws-1",
        projectId: "proj-1",
      }),
    ).toEqual({ all: true });
    expect(agentChatHistoryListRequest({ variant: "modal" })).toEqual({
      all: true,
      origin: "quick",
    });
    expect(
      agentChatHistoryListRequest({
        variant: "center",
        workspaceId: "ws-1",
        projectId: "proj-1",
      }),
    ).toEqual({
      workspace_id: "ws-1",
      project_id: "proj-1",
    });
  });

  it("overlays pending values only when they are advertised options", () => {
    const advertised = [
      {
        id: "models",
        category: "model",
        type: "select",
        currentValue: "opus",
        options: [
          { value: "opus", name: "Opus" },
          { value: "grok-4", name: "Grok" },
        ],
      },
    ];
    expect(
      overlayPendingConfigValues(advertised, { modelId: "grok-4" })[0]?.currentValue,
    ).toBe("grok-4");
    expect(
      overlayPendingConfigValues(advertised, { modelId: "catalog-opus" })[0]?.currentValue,
    ).toBe("opus");
  });

  it("S2/S6 builds composer options from descriptor current_config", () => {
    const capabilities: AgentCapabilities = {
      steer: "supported",
      resume: "supported",
      permission: "supported",
      configure: "supported",
      fork: "unsupported",
      rewind: "unsupported",
    };
    const support: AgentOptionSupport = {
      models: "supported",
      thinking: "supported",
      modes: "supported",
      permission_modes: "unsupported",
    };
    const descriptorA: AgentDescriptor = {
      identity: { id: "claude", name: "Claude" },
      capabilities,
      support,
      supported_options: {
        models: [{ id: "opus", label: "Opus" }],
        thinking: { type: "enum", options: ["low", "high"] },
        modes: [{ id: "code", label: "Code" }],
      },
      current_config: { model: "opus", thinking: "high", mode: "code" },
    };
    const optionsA = descriptorToConfigOptions(descriptorA);
    expect(optionsA.map((item) => item.id)).toEqual(["mode", "model", "thinking"]);
    expect(optionsA.find((item) => item.id === "thinking")?.currentValue).toBe("high");
    expect(optionsA.find((item) => item.id === "mode")?.currentValue).toBe("code");
    expect(optionsA.find((item) => item.id === "model")?.currentValue).toBe("opus");
    expect(JSON.stringify(optionsA)).not.toContain("session_config_options");

    const descriptorB: AgentDescriptor = {
      identity: { id: "grok", name: "Grok" },
      capabilities: {
        steer: "unsupported",
        resume: "unsupported",
        permission: "unsupported",
        configure: "supported",
        fork: "unsupported",
        rewind: "unsupported",
      },
      support: {
        models: "supported",
        thinking: "unsupported",
        modes: "unsupported",
        permission_modes: "unsupported",
      },
      supported_options: {
        models: [{ id: "grok-4", label: "Grok 4" }],
        thinking: { type: "none" },
        modes: [],
      },
      current_config: { model: "grok-4" },
    };
    const optionsB = descriptorToConfigOptions(descriptorB);
    expect(optionsB.map((item) => item.id)).toEqual(["model"]);
    expect(optionsB[0]?.currentValue).toBe("grok-4");
  });

  it("APP-069 S8 hides pickers when support is unsupported or the list is empty", () => {
    const capabilities: AgentCapabilities = {
      steer: "supported",
      resume: "supported",
      permission: "supported",
      configure: "supported",
      fork: "unsupported",
      rewind: "unsupported",
    };
    const emptyUnsupported = descriptorToConfigOptions({
      identity: { id: "claude", name: "Claude" },
      capabilities,
      support: {
        models: "supported",
        thinking: "supported",
        modes: "supported",
        permission_modes: "supported",
      },
      supported_options: {
        models: [],
        thinking: { type: "none" },
        modes: [],
        permission_modes: [],
      },
      current_config: {},
    });
    expect(emptyUnsupported.filter((item) => item.type === "select")).toEqual([]);

    const flagsOff = descriptorToConfigOptions({
      identity: { id: "claude", name: "Claude" },
      capabilities,
      support: {
        models: "unsupported",
        thinking: "unsupported",
        modes: "unsupported",
        permission_modes: "unsupported",
      },
      supported_options: {
        models: [{ id: "opus", label: "Opus" }],
        thinking: { type: "enum", options: ["low", "high"] },
        modes: [{ id: "plan", label: "Plan" }],
        permission_modes: [{ id: "ask", label: "Ask" }],
      },
      current_config: { model: "opus", thinking: "high", mode: "plan", permission_mode: "ask" },
    });
    expect(flagsOff.map((item) => item.id)).toEqual([]);
  });

  it("APP-069 S8 emits a leading permission_mode picker and keeps model/thinking trailing", () => {
    const options = descriptorToConfigOptions({
      identity: { id: "codex", name: "Codex" },
      capabilities: {
        steer: "supported",
        resume: "supported",
        permission: "supported",
        configure: "supported",
        fork: "supported",
        rewind: "supported",
      },
      support: {
        models: "supported",
        thinking: "supported",
        modes: "supported",
        permission_modes: "supported",
      },
      supported_options: {
        models: [{ id: "gpt-5", label: "GPT-5" }],
        thinking: { type: "enum", options: ["low", "high"] },
        modes: [{ id: "agent", label: "Agent" }],
        permission_modes: [
          { id: "ask", label: "Ask" },
          { id: "acceptEdits", label: "Accept edits", is_default: true },
        ],
      },
      current_config: {
        model: "gpt-5",
        thinking: "low",
        mode: "agent",
        permission_mode: "acceptEdits",
      },
    });
    expect(options.map((item) => item.id)).toEqual([
      "permission_mode",
      "mode",
      "model",
      "thinking",
    ]);
    const split = splitComposerConfigOptions(options);
    expect(split.leading.map((item) => item.id)).toEqual(["permission_mode", "mode"]);
    expect(split.trailing.map((item) => item.id)).toEqual(["model", "thinking"]);
    expect(configKindMatches("permission_mode", undefined, "mode")).toBe(false);
    expect(configKindMatches("permission_mode", undefined, "permission_mode")).toBe(true);
  });

  it("APP-069 S8 shows Claude Mode and Permission as two independent pickers", () => {
    const options = descriptorToConfigOptions({
      identity: { id: "claude", name: "Claude" },
      capabilities: {
        steer: "supported",
        resume: "supported",
        permission: "supported",
        configure: "supported",
        fork: "unsupported",
        rewind: "unsupported",
      },
      support: {
        models: "supported",
        thinking: "supported",
        modes: "supported",
        permission_modes: "supported",
      },
      supported_options: {
        models: [{ id: "opus", label: "Opus" }],
        thinking: { type: "enum", options: ["low", "high"] },
        modes: [
          { id: "default", label: "Default", is_default: true },
          { id: "plan", label: "Plan" },
        ],
        permission_modes: [
          { id: "yolo", label: "Yolo" },
          { id: "accept_edits", label: "Accept edits" },
          { id: "auto", label: "Auto" },
          { id: "ask_always", label: "Ask always", is_default: true },
        ],
      },
      current_config: { model: "opus", thinking: "high", permission_mode: "ask_always" },
    });
    expect(options.map((item) => item.id)).toEqual([
      "permission_mode",
      "mode",
      "model",
      "thinking",
    ]);
    expect(splitComposerConfigOptions(options).leading.map((item) => item.id)).toEqual([
      "permission_mode",
      "mode",
    ]);
    expect(options.find((item) => item.id === "permission_mode")?.options.map((item) => item.value)).toEqual([
      "yolo",
      "accept_edits",
      "auto",
      "ask_always",
    ]);
  });

  it("APP-069 S8 shows Codex Yolo, Auto, and Ask always without Accept edits", () => {
    const options = descriptorToConfigOptions({
      identity: { id: "codex", name: "Codex" },
      capabilities: {
        steer: "supported",
        resume: "supported",
        permission: "supported",
        configure: "supported",
        fork: "unsupported",
        rewind: "unsupported",
      },
      support: {
        models: "supported",
        thinking: "supported",
        modes: "supported",
        permission_modes: "supported",
      },
      supported_options: {
        models: [{ id: "gpt-5.6-luna", label: "GPT-5.6-Luna" }],
        thinking: { type: "enum", options: ["low", "high"] },
        modes: [
          { id: "default", label: "Default", is_default: true },
          { id: "plan", label: "Plan" },
        ],
        permission_modes: [
          { id: "yolo", label: "Yolo" },
          { id: "auto", label: "Auto" },
          { id: "ask_always", label: "Ask always", is_default: true },
        ],
      },
      current_config: { model: "gpt-5.6-luna", permission_mode: "ask_always" },
    });
    expect(options.map((item) => item.id)).toEqual([
      "permission_mode",
      "mode",
      "model",
      "thinking",
    ]);
    expect(options.find((item) => item.id === "permission_mode")?.options.map((item) => item.value)).toEqual([
      "yolo",
      "auto",
      "ask_always",
    ]);
  });

  it("APP-069 S8 hides Pi Mode and Permission when both support flags are unsupported", () => {
    const options = descriptorToConfigOptions({
      identity: { id: "pi", name: "Pi" },
      capabilities: {
        steer: "supported",
        resume: "supported",
        permission: "supported",
        configure: "supported",
        fork: "unsupported",
        rewind: "unsupported",
      },
      support: {
        models: "supported",
        thinking: "supported",
        modes: "unsupported",
        permission_modes: "unsupported",
      },
      supported_options: {
        models: [{ id: "sonnet", label: "Sonnet" }],
        thinking: { type: "enum", options: ["low", "high"] },
        modes: [{ id: "plan", label: "Plan" }],
        permission_modes: [{ id: "yolo", label: "Yolo" }],
      },
      current_config: { model: "sonnet" },
    });
    expect(options.map((item) => item.id)).toEqual(["model", "thinking"]);
    expect(options.find((item) => item.id === "mode")).toBeUndefined();
    expect(options.find((item) => item.id === "permission_mode")).toBeUndefined();
  });

  it("fills empty descriptor option groups from a ready catalog without overriding current_config", () => {
    const descriptor: AgentDescriptor = {
      identity: { id: "factory-droid", name: "Factory Droid" },
      capabilities: {
        steer: "unsupported",
        resume: "supported",
        permission: "supported",
        configure: "supported",
        fork: "unsupported",
        rewind: "unsupported",
      },
      support: {
        models: "supported",
        thinking: "supported",
        modes: "supported",
        permission_modes: "supported",
      },
      supported_options: {
        models: [],
        thinking: { type: "none" },
        modes: [],
        permission_modes: [],
      },
      current_config: { model: "glm-5" },
    };
    const catalog = {
      agent_id: "factory-droid",
      status: "ok" as const,
      models: [{ id: "glm-5", label: "GLM 5", is_default: true }],
      modes: [{ id: "code", label: "Code" }],
      permission_modes: [{ id: "default", label: "Default", is_default: true }],
      thinking: { type: "enum" as const, options: ["low", "high"] },
      strategies_used: [],
      fetched_at: "",
      source: "cache" as const,
      message: null,
    };
    const filled = fillEmptyDescriptorOptionsFromSnapshot(descriptor, catalog);
    expect(filled.current_config).toEqual({ model: "glm-5" });
    expect(descriptorToConfigOptions(filled).map((item) => item.id)).toEqual([
      "permission_mode",
      "mode",
      "model",
      "thinking",
    ]);
    expect(
      fillEmptyDescriptorOptionsFromSnapshot(descriptor, { ...catalog, agent_id: "claude" }),
    ).toBe(descriptor);
  });

  it("keeps live descriptor lists instead of replacing them from catalog", () => {
    const descriptor: AgentDescriptor = {
      identity: { id: "claude", name: "Claude" },
      capabilities: {
        steer: "unsupported",
        resume: "supported",
        permission: "supported",
        configure: "supported",
        fork: "unsupported",
        rewind: "unsupported",
      },
      support: {
        models: "supported",
        thinking: "supported",
        modes: "unsupported",
        permission_modes: "supported",
      },
      supported_options: {
        models: [{ id: "opus", label: "Opus" }],
        thinking: { type: "enum", options: ["low"] },
        modes: [],
        permission_modes: [{ id: "ask", label: "Ask" }],
      },
      current_config: { model: "opus" },
    };
    const filled = fillEmptyDescriptorOptionsFromSnapshot(descriptor, {
      agent_id: "claude",
      status: "ok",
      models: [{ id: "sonnet", label: "Sonnet" }],
      modes: [{ id: "plan", label: "Plan" }],
      permission_modes: [{ id: "bypass", label: "Bypass" }],
      thinking: { type: "enum", options: ["high"] },
      strategies_used: [],
      fetched_at: "",
      source: "cache",
      message: null,
    });
    expect(filled.supported_options.models.map((item) => item.id)).toEqual(["opus"]);
    expect(filled.supported_options.permission_modes?.map((item) => item.id)).toEqual(["ask"]);
    expect(filled.supported_options.thinking).toEqual({ type: "enum", options: ["low"] });
    expect(filled.supported_options.modes).toEqual([{ id: "plan", label: "Plan" }]);
  });

  it("replaces pre-PMP Cursor CLI-encoded models with bare catalog list", () => {
    const descriptor: AgentDescriptor = {
      identity: { id: "cursor", name: "Cursor" },
      capabilities: {
        steer: "unsupported",
        resume: "supported",
        permission: "supported",
        configure: "supported",
        fork: "unsupported",
        rewind: "unsupported",
      },
      support: {
        models: "supported",
        thinking: "supported",
        modes: "supported",
        permission_modes: "supported",
        fast: "supported",
      },
      supported_options: {
        models: [
          { id: "gpt-5.3-codex-low", label: "Codex 5.3 Low" },
          { id: "gpt-5.3-codex-low-fast", label: "Codex 5.3 Low Fast" },
          { id: "gpt-5.3-codex", label: "Codex 5.3" },
          { id: "gpt-5.3-codex-fast", label: "Codex 5.3 Fast" },
          { id: "gpt-5.3-codex-high", label: "Codex 5.3 High" },
          { id: "gpt-5.3-codex-high-fast", label: "Codex 5.3 High Fast" },
          { id: "gpt-5.3-codex-xhigh", label: "Codex 5.3 Extra High" },
          { id: "gpt-5.3-codex-xhigh-fast", label: "Codex 5.3 Extra High Fast" },
          { id: "composer-2.5-fast", label: "Composer 2.5 Fast" },
        ],
        thinking: { type: "encoded_in_model" },
        modes: [],
        permission_modes: [],
        fast: [],
      },
      current_config: { model: "gpt-5.3-codex" },
    };
    const filled = fillEmptyDescriptorOptionsFromSnapshot(descriptor, {
      agent_id: "cursor",
      status: "ok",
      models: [
        { id: "gpt-5.3-codex", label: "Codex 5.3", is_default: true },
        { id: "composer-2.5", label: "Composer 2.5" },
      ],
      modes: [{ id: "agent", label: "Agent" }],
      permission_modes: [],
      thinking: { type: "enum", options: ["low", "medium", "high", "xhigh", "max"] },
      strategies_used: [],
      fetched_at: "",
      source: "cache",
      message: null,
    });
    expect(filled.supported_options.models.map((item) => item.id)).toEqual([
      "gpt-5.3-codex",
      "composer-2.5",
    ]);
    expect(filled.supported_options.thinking).toEqual({
      type: "enum",
      options: ["low", "medium", "high", "xhigh", "max"],
    });
    expect(filled.supported_options.fast?.map((item) => item.id)).toEqual(["false", "true"]);
  });

  it("replaces boolean Cursor thinking with catalog effort levels", () => {
    const descriptor: AgentDescriptor = {
      identity: { id: "cursor", name: "Cursor" },
      capabilities: {
        steer: "unsupported",
        resume: "supported",
        permission: "supported",
        configure: "supported",
        fork: "unsupported",
        rewind: "unsupported",
      },
      support: {
        models: "supported",
        thinking: "supported",
        modes: "supported",
        permission_modes: "supported",
        fast: "supported",
      },
      supported_options: {
        models: [
          { id: "gpt-5.3-codex", label: "Codex 5.3" },
          { id: "composer-2.5", label: "Composer 2.5" },
        ],
        thinking: { type: "enum", options: ["false", "true"] },
        modes: [],
        permission_modes: [],
        fast: [],
      },
      current_config: { model: "gpt-5.3-codex", thinking: "false" },
    };
    const filled = fillEmptyDescriptorOptionsFromSnapshot(descriptor, {
      agent_id: "cursor",
      status: "ok",
      models: [
        { id: "gpt-5.3-codex", label: "Codex 5.3", is_default: true },
        { id: "composer-2.5", label: "Composer 2.5" },
      ],
      modes: [],
      permission_modes: [],
      thinking: { type: "enum", arg: "effort", options: ["low", "medium", "high", "xhigh", "max"] },
      strategies_used: [],
      fetched_at: "",
      source: "cache",
      message: null,
    });
    expect(filled.supported_options.models.map((item) => item.id)).toEqual([
      "gpt-5.3-codex",
      "composer-2.5",
    ]);
    expect(filled.supported_options.thinking).toEqual({
      type: "enum",
      arg: "effort",
      options: ["low", "medium", "high", "xhigh", "max"],
    });
    expect(filled.supported_options.fast?.map((item) => item.id)).toEqual(["false", "true"]);
  });

  it("overlays catalog human labels onto Cursor ACP slug labels", () => {
    const descriptor: AgentDescriptor = {
      identity: { id: "cursor", name: "Cursor" },
      capabilities: {
        steer: "unsupported",
        resume: "supported",
        permission: "supported",
        configure: "supported",
        fork: "unsupported",
        rewind: "unsupported",
      },
      support: {
        models: "supported",
        thinking: "supported",
        modes: "supported",
        permission_modes: "supported",
        fast: "supported",
      },
      supported_options: {
        models: [
          { id: "claude-opus-4-8", label: "claude-opus-4-8" },
          { id: "grok-4.6", label: "grok-4.6" },
        ],
        thinking: { type: "none" },
        modes: [],
        permission_modes: [{ id: "ask_always", label: "Ask always", is_default: true }],
        fast: [],
      },
      current_config: { model: "claude-opus-4-8" },
    };
    const filled = fillEmptyDescriptorOptionsFromSnapshot(descriptor, {
      agent_id: "cursor",
      status: "ok",
      models: [
        { id: "claude-opus-4-8", label: "Claude Opus 4.8" },
        { id: "grok-4.6", label: "Cursor Grok 4.6" },
      ],
      modes: [
        { id: "agent", label: "Agent", is_default: true },
        { id: "plan", label: "Plan" },
        { id: "ask", label: "Ask" },
      ],
      permission_modes: [
        { id: "yolo", label: "Yolo" },
        { id: "auto", label: "Auto" },
        { id: "ask_always", label: "Ask always", is_default: true },
      ],
      thinking: { type: "none" },
      strategies_used: [],
      fetched_at: "",
      source: "cache",
      message: null,
    });
    expect(filled.supported_options.models.map((item) => item.label)).toEqual([
      "Claude Opus 4.8",
      "Cursor Grok 4.6",
    ]);
    expect(filled.supported_options.modes?.map((item) => item.id)).toEqual([
      "agent",
      "plan",
      "ask",
    ]);
    expect(filled.supported_options.permission_modes?.map((item) => item.id)).toEqual([
      "yolo",
      "auto",
      "ask_always",
    ]);
  });

  it("maps vendor permission aliases onto listed Atmos ids for display", () => {
    const options = [
      {
        id: "permission_mode",
        name: "Permission",
        type: "select" as const,
        currentValue: "default",
        options: [
          { value: "yolo", name: "Yolo" },
          { value: "ask_always", name: "Ask always" },
        ],
      },
      {
        id: "mode",
        name: "Mode",
        type: "select" as const,
        currentValue: "",
        options: [
          { value: "agent", name: "Agent" },
          { value: "plan", name: "Plan" },
        ],
      },
    ];
    expect(displayedComposerConfigValue(options, "permission_mode", "")).toBe("ask_always");
    expect(displayedComposerConfigValue(options, "permission_mode", "default")).toBe("ask_always");
    expect(displayedComposerConfigValue(options, "mode", "")).toBe("agent");
  });

  it("defaults empty permission to Ask always for any agent, not the first listed id", () => {
    const options = [
      {
        id: "permission_mode",
        name: "Permission",
        type: "select" as const,
        currentValue: "",
        options: [
          { value: "yolo", name: "Yolo" },
          { value: "accept_edits", name: "Accept edits" },
          { value: "auto", name: "Auto" },
          { value: "ask_always", name: "Ask always" },
        ],
      },
      {
        id: "mode",
        name: "Mode",
        type: "select" as const,
        currentValue: "unknown-mode",
        options: [
          { value: "default", name: "Default" },
          { value: "plan", name: "Plan" },
        ],
      },
    ];
    expect(displayedComposerConfigValue(options, "permission_mode", "")).toBe("ask_always");
    expect(displayedComposerConfigValue(options, "mode", "")).toBe("default");
  });

  it("overlays catalog per-model thinking onto a stale descriptor union", () => {
    const descriptor: AgentDescriptor = {
      identity: { id: "codex", name: "Codex" },
      capabilities: {
        steer: "supported",
        resume: "supported",
        permission: "supported",
        configure: "supported",
        fork: "supported",
        rewind: "supported",
      },
      support: {
        models: "supported",
        thinking: "supported",
        modes: "supported",
        permission_modes: "unsupported",
      },
      supported_options: {
        models: [
          {
            id: "gpt-5.5",
            label: "GPT-5.5",
            is_default: true,
            thinking: {
              type: "enum",
              options: ["low", "medium", "high", "xhigh", "max", "ultra"],
            },
          },
          {
            id: "gpt-5.6-sol",
            label: "GPT-5.6-Sol",
            thinking: {
              type: "enum",
              options: ["low", "medium", "high", "xhigh", "max", "ultra"],
            },
          },
        ],
        thinking: { type: "enum", options: ["low", "medium", "high", "xhigh", "max", "ultra"] },
        modes: [{ id: "default", label: "Default", is_default: true }],
        permission_modes: [],
      },
      current_config: { model: "gpt-5.6-sol" },
    };
    const catalog = {
      agent_id: "codex",
      status: "ok" as const,
      models: [
        {
          id: "gpt-5.5",
          label: "GPT-5.5",
          is_default: true,
          thinking: { type: "enum" as const, options: ["low", "medium", "high", "xhigh"] },
        },
        {
          id: "gpt-5.6-sol",
          label: "GPT-5.6-Sol",
          thinking: {
            type: "enum" as const,
            options: ["low", "medium", "high", "xhigh", "max", "ultra"],
          },
        },
      ],
      modes: [{ id: "default", label: "Default", is_default: true }],
      thinking: { type: "enum" as const, options: ["low", "medium", "high", "xhigh", "max", "ultra"] },
      strategies_used: [],
      fetched_at: "",
      source: "cache" as const,
      message: null,
    };
    expect(thinkingChoices(catalog, "gpt-5.5")).toEqual(["low", "medium", "high", "xhigh"]);
    const options = composerConfigOptions({
      descriptor,
      catalog,
      providerId: "codex",
      modelId: "gpt-5.5",
      thinkingId: "medium",
      modeId: "",
      permissionModeId: "",
    });
    expect(options.find((item) => item.id === "thinking")?.options.map((item) => item.value)).toEqual([
      "low",
      "medium",
      "high",
      "xhigh",
    ]);
    expect(thinkingLevelMessageKey("ultra")).toBe("ultra");
    expect(thinkingLevelLabel("ultra")).toBe("Ultra");
  });

  it("uses displayed catalog defaults when descriptor current_config.model is empty", () => {
    const descriptor: AgentDescriptor = {
      identity: { id: "codex", name: "Codex" },
      capabilities: {
        steer: "supported",
        resume: "supported",
        permission: "supported",
        configure: "supported",
        fork: "supported",
        rewind: "supported",
      },
      support: {
        models: "supported",
        thinking: "supported",
        modes: "supported",
        permission_modes: "unsupported",
      },
      supported_options: {
        models: [{ id: "gpt-5.6-luna", label: "GPT-5.6-Luna", is_default: true }],
        thinking: { type: "enum", options: ["low", "high"] },
        modes: [{ id: "default", label: "Default", is_default: true }],
        permission_modes: [],
      },
      current_config: {},
    };
    const options = composerConfigOptions({
      descriptor,
      catalog: null,
      providerId: "codex",
      modelId: "",
      thinkingId: "",
      modeId: "",
      permissionModeId: "",
    });
    expect(displayedComposerConfigValue(options, "model", "")).toBe("gpt-5.6-luna");
    expect(displayedComposerConfigValue(options, "thinking", "")).toBe("low");
    expect(displayedComposerConfigValue(options, "mode", "")).toBe("default");
    expect(options.some((option) => option.id === "permission_mode")).toBe(false);
  });

  it("drops a leftover descriptor when switching to another agent so catalog lists can show", () => {
    const descriptor: AgentDescriptor = {
      identity: { id: "claude", name: "Claude" },
      capabilities: {
        steer: "unsupported",
        resume: "supported",
        permission: "supported",
        configure: "supported",
        fork: "unsupported",
        rewind: "unsupported",
      },
      support: {
        models: "supported",
        thinking: "supported",
        modes: "unsupported",
        permission_modes: "supported",
      },
      supported_options: {
        models: [{ id: "opus", label: "Opus" }],
        thinking: { type: "none" },
        modes: [],
        permission_modes: [],
      },
      current_config: {},
    };
    expect(descriptorForComposerProvider(descriptor, "grok")).toBeNull();
    expect(descriptorForComposerProvider(descriptor, "claude")).toBe(descriptor);
    const grokCatalog = {
      agent_id: "grok",
      status: "ok" as const,
      models: [{ id: "grok-4", label: "Grok 4", is_default: true }],
      modes: [
        { id: "default", label: "Default", is_default: true },
        { id: "plan", label: "Plan" },
      ],
      permission_modes: [
        { id: "yolo", label: "Yolo" },
        { id: "accept_edits", label: "Accept edits" },
        { id: "auto", label: "Auto" },
        { id: "ask_always", label: "Ask always", is_default: true },
      ],
      thinking: { type: "none" as const },
      strategies_used: [],
      fetched_at: "",
      source: "cache" as const,
      message: null,
    };
    const options = optionsSnapshotToConfigOptions(grokCatalog, "", "", "", "");
    expect(options.map((item) => item.id)).toEqual(["permission_mode", "mode", "model"]);
  });
});

