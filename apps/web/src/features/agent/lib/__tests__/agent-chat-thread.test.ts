import { describe, expect, it } from "bun:test";
import {
  agentChatHistoryListRequest,
  catalogToConfigOptions,
  chatTitleFromPrompt,
  chatsToHistoryRows,
  filterAgentChatHistoryRows,
  defaultCatalogModelId,
  isCatalogModelsLoading,
  parsePlan,
  probingCatalog,
  overlayPendingConfigValues,
  splitComposerConfigOptions,
  isComposerTrailingConfigOption,
  isThinkingConfigId,
  thinkingChoices,
  thinkingLevelLabel,
} from "@/features/agent/lib/agent-chat-thread";

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
    expect(isCatalogModelsLoading(null, "cursor")).toBe(true);
    expect(
      isCatalogModelsLoading(
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
      isCatalogModelsLoading(
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
      isCatalogModelsLoading(
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
    expect(isCatalogModelsLoading(probingCatalog("opencode"), "opencode")).toBe(true);
  });

  it("picks the catalog default model when none is selected yet", () => {
    expect(
      defaultCatalogModelId(
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
    const options = catalogToConfigOptions(
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
    const options = catalogToConfigOptions(
      probingCatalog("claude"),
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
    const opusOptions = catalogToConfigOptions(catalog, "claude-opus-5", "high");
    expect(opusOptions.find((item) => item.id === "thinking")?.options.map((item) => item.name)).toEqual([
      "Off",
      "Low",
      "Medium",
      "High",
      "Extra high",
      "Max",
    ]);
    expect(thinkingLevelLabel("xhigh")).toBe("Extra high");
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

  it("puts ACP reasoning-effort options on the trailing thinking control", () => {
    expect(
      isComposerTrailingConfigOption({ id: "reasoning_effort", category: "thinking" }),
    ).toBe(true);
    expect(isThinkingConfigId("reasoningEffort")).toBe(true);
  });

  it("builds model and thinking config options from the catalog", () => {
    const options = catalogToConfigOptions(
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
    const options = catalogToConfigOptions(
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
});

