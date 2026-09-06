import { describe, expect, it } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const session = readFileSync(
  join(import.meta.dir, "../use-agent-chat-session.ts"),
  "utf8",
);

describe("composer config defer-until-send", () => {
  it("updates local draft on setConfigOption without calling persistConfig", () => {
    const start = session.indexOf("const setConfigOption = useCallback");
    const end = session.indexOf("const setProviderId = useCallback", start);
    expect(start).toBeGreaterThanOrEqual(0);
    expect(end).toBeGreaterThan(start);
    const body = session.slice(start, end);
    expect(body).toContain('setModelId(value)');
    expect(body).toContain('setModeId(value)');
    expect(body).toContain('setPermissionModeId(value)');
    expect(body).toContain('setThinkingId(value)');
    expect(body).toContain('setFastId(value)');
    expect(body).toContain("persistNewSessionPreferences");
    expect(body).not.toContain("persistConfig");
  });

  it("applies composerSelection patch at send, queue, and auth retry", () => {
    expect(session).toContain("await persistConfig(composerSelection().patch)");
    expect(session).toContain(
      "await persistConfigRef.current(composerSelectionRef.current().patch)",
    );
    expect(session).toContain("await agentChatApi.send");
    expect(session).toContain("await agentChatApi.queueAdd");
  });

  it("still configures immediately when switching provider on an active chat", () => {
    const start = session.indexOf("const setProviderId = useCallback");
    const end = session.indexOf("const activeAgent =", start);
    expect(start).toBeGreaterThanOrEqual(0);
    expect(end).toBeGreaterThan(start);
    const body = session.slice(start, end);
    expect(body).toContain("void persistConfig({");
    expect(body).toContain("provider_id: next");
  });

  it("does not write last New Chat config from eager tab create", () => {
    const start = session.indexOf("const ensureCreatedChat = useCallback");
    const end = session.indexOf("useEffect(() => {\n    if (variant !== \"center\")", start);
    expect(start).toBeGreaterThanOrEqual(0);
    expect(end).toBeGreaterThan(start);
    const body = session.slice(start, end);
    expect(body).toContain("keepComposerChrome: true");
    expect(body).not.toContain("persistNewSessionPreferences");
  });

  it("paints new-chat composer chrome from local cache instead of blocking on prefsGet", () => {
    expect(session).toContain("seedNewChatComposer");
    expect(session).toContain("useState(composerSeed.hydrated)");
    expect(session).toContain("const [prefsRestored, setPrefsRestored] = useState(true)");
    expect(session).not.toContain("setLoadingAgents(true)");
    expect(session).not.toContain("agentApi.listRegistry()");
    expect(session).toContain("agentChatApi.prefsGet()");
  });
});
