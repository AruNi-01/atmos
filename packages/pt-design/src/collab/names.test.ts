import { describe, expect, test } from "bun:test";
import { colorForCollaborator, isAgentName, resolveCollaboratorName } from "./names";
import {
  inviteUrlForRoom,
  isPrivateShareHost,
  parseRoomFromHash,
  parseRoomFromString,
  resolveShareBase,
  roomToHash,
  shareUrlForRoom,
} from "./room";
import { buildLocalAgentPrompt, buildMcpConfig } from "../embed/agent-prompt";
import { sceneFromLiveElements } from "./publish";
import { LIVE_COLLAB_REQUIRED_MESSAGE } from "./live-gate";
import { decryptData, encryptData, generateEncryptionKey } from "./crypto";
import {
  DEFAULT_COLLAB_SERVER,
  OFFICIAL_COLLAB_SERVER,
  collabWsUrl,
  isLocalCollabServer,
  isOfficialCollabHost,
  parseWireIn,
  resolveCollabServers,
} from "./wire";

describe("collaborator names", () => {
  test("agents fall back to Agent", () => {
    expect(resolveCollaboratorName("agent")).toBe("Agent");
    expect(resolveCollaboratorName("agent", "  Codex  ")).toBe("Codex");
    expect(resolveCollaboratorName("human")).toBe("You");
    expect(isAgentName("Agent")).toBe(true);
    expect(isAgentName("Codex Agent")).toBe(true);
    expect(colorForCollaborator("Agent").background).toBe("#7c3aed");
  });
});

describe("collab rooms", () => {
  test("parses official room hashes", () => {
    const room = parseRoomFromHash("#room=abc123,secretKey");
    expect(room).toEqual({ roomId: "abc123", roomKey: "secretKey" });
    expect(roomToHash(room!)).toBe("#room=abc123,secretKey");
    expect(parseRoomFromString("abc123,secretKey")).toEqual(room);
    expect(parseRoomFromHash("#nope")).toBeNull();
    expect(
      parseRoomFromString("https://app.atmos.land/?tab=pt-design#room=abc123,secretKey"),
    ).toEqual(room);
    expect(
      parseRoomFromString("http://localhost:30303/?tab=files#room=abc123,secretKey"),
    ).toEqual(room);
    expect(parseRoomFromString("not-a-room")).toBeNull();
  });

  test("local share links stay on this machine; hosted links stay public", () => {
    const room = { roomId: "abc123", roomKey: "secretKey" };
    expect(isPrivateShareHost("localhost")).toBe(true);
    expect(isPrivateShareHost("127.0.0.1")).toBe(true);
    expect(isPrivateShareHost("192.168.1.8")).toBe(true);
    expect(isPrivateShareHost("app.atmos.land")).toBe(false);
    expect(resolveShareBase("http://localhost:30303/?tab=files")).toBe(
      "http://localhost:30303/?tab=pt-design",
    );
    expect(shareUrlForRoom(room, "http://127.0.0.1:30303/")).toBe(
      "http://127.0.0.1:30303/?tab=pt-design#room=abc123,secretKey",
    );
    expect(shareUrlForRoom(room, "https://app.atmos.land/workspace?id=1")).toBe(
      "https://app.atmos.land/?tab=pt-design#room=abc123,secretKey",
    );
    expect(inviteUrlForRoom(room)).toBe(
      "https://app.atmos.land/?tab=pt-design#room=abc123,secretKey",
    );
    const prompt = buildLocalAgentPrompt(room, "http://127.0.0.1:30303");
    expect(prompt).toContain("POST http://127.0.0.1:30303/api/pt-design/agent/invoke");
    expect(prompt).toContain("abc123,secretKey");
    expect(prompt).not.toContain("pt-design-mcp");
    const mcp = JSON.parse(buildMcpConfig(room)).mcpServers["pt-design"];
    expect(mcp.command).toBe("npx");
    expect(mcp.args).toEqual(["-y", "-p", "@atmos/pt-design", "pt-design-mcp"]);
    expect(mcp.env.PT_DESIGN_COLLAB_ROOM).toBe("abc123,secretKey");
  });
});

describe("relay collab wire", () => {
  test("points at the Atmos relay and builds a room websocket URL", () => {
    expect(DEFAULT_COLLAB_SERVER).toBe("https://relay.atmos.land");
    expect(collabWsUrl("https://relay.atmos.land", "0123456789abcdef")).toBe(
      "wss://relay.atmos.land/ws/pt-design/0123456789abcdef",
    );
    expect(parseWireIn(JSON.stringify({ t: "ready", socketId: "abc" }))).toEqual({
      t: "ready",
      socketId: "abc",
    });
  });

  test("keeps official oss-collab as fallback unless primary is already official", () => {
    expect(OFFICIAL_COLLAB_SERVER).toBe("https://oss-collab.excalidraw.com");
    expect(isOfficialCollabHost(OFFICIAL_COLLAB_SERVER)).toBe(true);
    expect(isOfficialCollabHost("oss-collab.excalidraw.com")).toBe(true);
    expect(isOfficialCollabHost("oss-collab.excalidraw.com:443")).toBe(true);
    expect(isOfficialCollabHost("OSS-COLLAB.EXCALIDRAW.COM.")).toBe(true);
    expect(isOfficialCollabHost("https://evil.com/?q=oss-collab.excalidraw.com")).toBe(false);
    expect(isOfficialCollabHost("https://oss-collab.excalidraw.com.evil.com")).toBe(false);
    expect(isOfficialCollabHost("not-oss-collab.excalidraw.com")).toBe(false);
    expect(isOfficialCollabHost("evil.com/oss-collab.excalidraw.com")).toBe(false);
    expect(resolveCollabServers("https://relay.atmos.land")).toEqual({
      primary: "https://relay.atmos.land",
      fallback: OFFICIAL_COLLAB_SERVER,
    });
    expect(resolveCollabServers(OFFICIAL_COLLAB_SERVER)).toEqual({
      primary: OFFICIAL_COLLAB_SERVER,
      fallback: null,
    });
  });

  test("local Atmos Server has no remote fallback", () => {
    expect(isLocalCollabServer("http://127.0.0.1:30303")).toBe(true);
    expect(resolveCollabServers("http://127.0.0.1:30303")).toEqual({
      primary: "http://127.0.0.1:30303",
      fallback: null,
    });
  });
});

describe("live agent collab", () => {
  test("turns a live room snapshot into a session scene", () => {
    const scene = sceneFromLiveElements([
      { id: "a", type: "rectangle", x: 0, y: 0, width: 10, height: 10, isDeleted: false },
    ]);
    expect(scene.elements).toHaveLength(1);
    expect(scene.appState.viewBackgroundColor).toBe("#ffffff");
    expect(LIVE_COLLAB_REQUIRED_MESSAGE).toContain("Share");
  });
});

describe("collab crypto", () => {
  test("round-trips a scene payload", async () => {
    const key = await generateEncryptionKey();
    const payload = JSON.stringify({ type: "SCENE_UPDATE", payload: { elements: [{ id: "a" }] } });
    const { encryptedBuffer, iv } = await encryptData(key, payload);
    const decoded = new TextDecoder().decode(await decryptData(iv, encryptedBuffer, key));
    expect(JSON.parse(decoded).type).toBe("SCENE_UPDATE");
  });
});
