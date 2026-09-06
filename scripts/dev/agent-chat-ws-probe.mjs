#!/usr/bin/env bun
/**
 * Probe Agent Chat over main /ws (no UI).
 *
 *   bun scripts/dev/agent-chat-ws-probe.mjs --provider claude
 *   bun scripts/dev/agent-chat-ws-probe.mjs --provider grok --prompt "Reply with ping only"
 *   bun scripts/dev/agent-chat-ws-probe.mjs --provider grok --op fork --respond fork_no_worktree
 *   bun scripts/dev/agent-chat-ws-probe.mjs --provider claude --permission-mode manual --prompt "Run echo pong"
 *   bun scripts/dev/agent-chat-ws-probe.mjs --provider pi --op rewind
 *
 * Reads ~/.atmos/runtime_manifest.json for the API port unless --url is set.
 * `--op fork|rewind` intercepts on send (no LLM turn unless `--seed` first).
 * `--respond OPTION` then calls agent_chat_session_op_respond (omit to only print chrome).
 * `--permission-mode MODE` calls agent_chat_configure before the first send (spawn is lazy).
 * Permission requests auto-respond with the first allow-like option unless `--no-permission`.
 * A `turn_completed` with `status: "failed"` is a FAIL (quota/auth errors are not success).
 */

import { readFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

function arg(name, fallback) {
  const idx = process.argv.indexOf(`--${name}`);
  if (idx >= 0 && process.argv[idx + 1]) return process.argv[idx + 1];
  return fallback;
}

function flag(name) {
  return process.argv.includes(`--${name}`);
}

function runtimeWsUrl() {
  const explicit = arg("url");
  if (explicit) return explicit;
  const manifestPath = join(homedir(), ".atmos", "runtime_manifest.json");
  try {
    const manifest = JSON.parse(readFileSync(manifestPath, "utf8"));
    const base = manifest?.api?.ws_url ?? "ws://127.0.0.1:30303";
    return `${String(base).replace(/\/$/, "")}/ws?client_type=web`;
  } catch {
    return "ws://127.0.0.1:30303/ws?client_type=web";
  }
}

const provider = arg("provider", "claude");
const cwd = arg("cwd", ""); // omit → API scratch dir (~/.atmos/data/agent/scratch)
const model = arg("model", "");
const permissionMode = arg("permission-mode", "");
const prompt = arg("prompt", "Reply with the single word pong and nothing else.");
const op = arg("op", "");
const respond = arg("respond", "");
const permissionOption = arg("permission-option", "");
const timeoutMs = Number(arg("timeout", "90000"));
const url = runtimeWsUrl();
const seedFirst = flag("seed") || (op === "rewind" && provider !== "pi");

function isQuotaError(value) {
  if (!value) return false;
  const payload = value.payload ?? value;
  const pieces = [payload.error, payload.message, payload.status];
  const text = pieces
    .map((piece) => (typeof piece === "string" ? piece : JSON.stringify(piece ?? "")))
    .join(" ");
  return /Payment Required|usage balance exhausted|API error \(status 402/i.test(text);
}

let seq = 0;
function request(ws, action, data) {
  const request_id = `probe-${++seq}-${Date.now()}`;
  ws.send(JSON.stringify({ type: "request", payload: { request_id, action, data } }));
  return request_id;
}

function waitFor(ws, matcher, label, ms = timeoutMs) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      ws.removeEventListener("message", onMessage);
      reject(new Error(`timeout waiting for ${label}`));
    }, ms);
    function onMessage(event) {
      let parsed;
      try {
        parsed = JSON.parse(String(event.data));
      } catch {
        return;
      }
      if (matcher(parsed)) {
        clearTimeout(timer);
        ws.removeEventListener("message", onMessage);
        resolve(parsed);
      }
    }
    ws.addEventListener("message", onMessage);
  });
}

function isResponse(parsed, requestId) {
  return parsed?.type === "response" && parsed?.payload?.request_id === requestId;
}

function isError(parsed, requestId) {
  return parsed?.type === "error" && parsed?.payload?.request_id === requestId;
}

function chatEvent(parsed, chatId) {
  if (parsed?.type !== "notification") return null;
  if (parsed?.payload?.event !== "agent_chat_event") return null;
  const data = parsed.payload.data;
  if (data?.chat_id && data.chat_id !== chatId) return null;
  return data;
}

const events = [];
const ws = new WebSocket(url);

ws.addEventListener("message", (event) => {
  try {
    const parsed = JSON.parse(String(event.data));
    if (parsed?.type === "notification" && parsed?.payload?.event === "agent_chat_event") {
      events.push(parsed.payload.data);
      const payload = parsed.payload.data?.payload ?? parsed.payload.data;
      const payloadType = payload?.type ?? parsed.payload.data?.type;
      if (payloadType === "unknown") {
        console.log(`[event] unknown ${payload?.event_type ?? ""}`);
      } else {
        console.log(`[event] ${payloadType ?? "unknown"}`);
      }
    }
  } catch {
    /* ignore */
  }
});

await new Promise((resolve, reject) => {
  ws.addEventListener("open", resolve, { once: true });
  ws.addEventListener("error", () => reject(new Error(`ws error connecting ${url}`)), {
    once: true,
  });
});
console.log(`connected ${url}`);

const createBody = {
  provider_id: provider,
  origin: "normal",
  title: `probe-${provider}`,
};
if (cwd) createBody.cwd = cwd;
if (model) createBody.model = model;
const createId = request(ws, "agent_chat_create", createBody);
const created = await Promise.race([
  waitFor(ws, (m) => isResponse(m, createId), "agent_chat_create"),
  waitFor(ws, (m) => isError(m, createId), "agent_chat_create error").then((err) => {
    throw new Error(err.payload?.message ?? JSON.stringify(err));
  }),
]);
if (!created.payload?.success) {
  throw new Error(`create failed: ${JSON.stringify(created.payload)}`);
}
const meta = created.payload.data;
const chatId = meta.chat_id ?? meta.id;
if (!chatId) throw new Error(`no chat_id in ${JSON.stringify(meta)}`);
const descriptor = meta.descriptor ?? {};
console.log(`created chat_id=${chatId} provider=${meta.provider_id ?? provider}`);
console.log(
  "descriptor",
  JSON.stringify({
    support: descriptor.support ?? null,
    capabilities: descriptor.capabilities ?? null,
    current_config: descriptor.current_config ?? null,
    permission_modes: descriptor.supported_options?.permission_modes ?? null,
  }),
);

const subId = request(ws, "agent_chat_subscribe", { chat_id: chatId });
await waitFor(ws, (m) => isResponse(m, subId) || isError(m, subId), "subscribe");

if (permissionMode) {
  const cfgId = request(ws, "agent_chat_configure", {
    chat_id: chatId,
    permission_mode: permissionMode,
  });
  const configured = await Promise.race([
    waitFor(ws, (m) => isResponse(m, cfgId), "configure"),
    waitFor(ws, (m) => isError(m, cfgId), "configure error").then((err) => {
      throw new Error(err.payload?.message ?? JSON.stringify(err));
    }),
  ]);
  if (!configured.payload?.success) {
    throw new Error(`configure failed: ${JSON.stringify(configured.payload)}`);
  }
  const next = configured.payload.data?.descriptor?.current_config ?? {};
  console.log("configured", JSON.stringify({ permission_mode: next.permission_mode ?? permissionMode }));
}

async function sendText(text, label) {
  const sendId = request(ws, "agent_chat_send", { chat_id: chatId, text });
  const sent = await Promise.race([
    waitFor(ws, (m) => isResponse(m, sendId), label),
    waitFor(ws, (m) => isError(m, sendId), `${label} error`).then((err) => {
      throw new Error(err.payload?.message ?? JSON.stringify(err));
    }),
  ]);
  if (!sent.payload?.success) {
    throw new Error(`${label} failed: ${JSON.stringify(sent.payload)}`);
  }
  console.log(
    `${label} ok turn_id=${sent.payload.data?.turn_id ?? sent.payload.data?.id ?? "?"}`,
  );
  return sent;
}

function payloadType(data) {
  return data?.payload?.type ?? data?.type;
}

let eventCursor = 0;

function waitChat(types, label) {
  const wanted = new Set(types);
  function matchFrom(start) {
    for (let i = start; i < events.length; i++) {
      const data = events[i];
      const t = payloadType(data);
      if (wanted.has(t) || data?.payload?.status === "error") {
        eventCursor = i + 1;
        return {
          type: "notification",
          payload: { event: "agent_chat_event", data },
        };
      }
    }
    return null;
  }
  const already = matchFrom(eventCursor);
  if (already) return Promise.resolve(already);
  return waitFor(
    ws,
    (m) => {
      const data = chatEvent(m, chatId);
      if (!data) return false;
      const t = payloadType(data);
      return wanted.has(t) || data.payload?.status === "error";
    },
    label,
  ).then((parsed) => matchFrom(eventCursor) ?? parsed);
}

if (op && seedFirst) {
  await sendText(prompt, "seed_send");
  const seeded = await waitChat(["turn_completed", "error"], "seed_turn");
  const seedPayload = chatEvent(seeded, chatId)?.payload ?? null;
  console.log("seed_terminal", JSON.stringify(seedPayload, null, 2));
  if (isQuotaError(seedPayload) || seedPayload?.status === "failed" && isQuotaError(seedPayload?.error)) {
    console.error("STOP: 402 quota on seed — not sending more turns");
    if (!flag("keep")) request(ws, "agent_chat_delete", { chat_id: chatId });
    ws.close();
    process.exit(2);
  }
}

const sendTextValue = op === "fork" ? "/fork" : op === "rewind" ? "/rewind" : prompt;
try {
  await sendText(sendTextValue, op ? `op_send ${sendTextValue}` : "send");
} catch (error) {
  const text = String(error?.message ?? error);
  if (provider === "codex" && /Codex CLI/.test(text)) {
    console.log("OK codex refused broken or missing CLI");
    console.log(text);
    if (!flag("keep")) request(ws, "agent_chat_delete", { chat_id: chatId });
    ws.close();
    process.exit(0);
  }
  throw error;
}

const terminal = await waitChat(
  ["turn_completed", "error", "session_op_requested", "permission_requested"],
  op ? "session_op_or_turn" : "turn_or_permission",
);

let last = chatEvent(terminal, chatId);
console.log("terminal_event", JSON.stringify(last, null, 2));

if (!flag("no-permission")) {
  for (let round = 0; round < 6 && last?.payload?.type === "permission_requested"; round++) {
    const requestId = last.payload.request?.request_id;
    const options = last.payload.request?.options ?? [];
    const optionId = permissionOption
      ? options.find((opt) => opt.option_id === permissionOption)?.option_id
      : options.find((opt) => {
          const key = `${opt.option_id ?? ""} ${opt.kind ?? ""} ${opt.name ?? ""}`.toLowerCase();
          return /allow|accept|once/.test(key) && !/reject|deny|decline|cancel|always/.test(key);
        })?.option_id
        ?? options.find((opt) => !/reject|deny|decline|cancel/i.test(`${opt.option_id} ${opt.kind}`))
          ?.option_id;
    console.log(
      "permission_request",
      JSON.stringify(
        {
          request_id: requestId,
          tool: last.payload.request?.tool,
          description: last.payload.request?.description,
          options,
          chosen: optionId,
        },
        null,
        2,
      ),
    );
    if (!requestId || !optionId) {
      throw new Error(`cannot permission_respond: request_id=${requestId} option=${optionId}`);
    }
    const respondId = request(ws, "agent_chat_permission_respond", {
      chat_id: chatId,
      request_id: requestId,
      option_id: optionId,
    });
    const responded = await Promise.race([
      waitFor(ws, (m) => isResponse(m, respondId), "permission_respond"),
      waitFor(ws, (m) => isError(m, respondId), "permission_respond error").then((err) => {
        throw new Error(err.payload?.message ?? JSON.stringify(err));
      }),
    ]);
    if (!responded.payload?.success) {
      throw new Error(`permission_respond failed: ${JSON.stringify(responded.payload)}`);
    }
    const next = await waitChat(
      ["turn_completed", "error", "permission_requested", "permission_resolved"],
      "after_permission",
    );
    last = chatEvent(next, chatId);
    console.log("after_permission", JSON.stringify(last, null, 2));
    if (last?.payload?.type === "permission_resolved") {
      const after = await waitChat(
        ["turn_completed", "error", "permission_requested"],
        "after_permission_resolved",
      );
      last = chatEvent(after, chatId);
      console.log("terminal_event", JSON.stringify(last, null, 2));
    }
  }
}

if (op && respond) {
  for (let round = 0; round < 3 && last?.payload?.type === "session_op_requested"; round++) {
    const requestId = last.payload.request?.request_id;
    const options = last.payload.request?.options ?? [];
    const optionId =
      respond === "first"
        ? options.find((opt) => opt.option_id !== "cancel")?.option_id
        : options.some((opt) => opt.option_id === respond)
          ? respond
          : options.find((opt) => opt.option_id !== "cancel")?.option_id;
    const sentExplicit = respond !== "first" && optionId === respond;
    if (!requestId || !optionId) {
      throw new Error(`cannot respond: request_id=${requestId} option=${optionId}`);
    }
    console.log(`respond request_id=${requestId} option_id=${optionId}`);
    const respondId = request(ws, "agent_chat_session_op_respond", {
      chat_id: chatId,
      request_id: requestId,
      option_id: optionId,
    });
    const responded = await Promise.race([
      waitFor(ws, (m) => isResponse(m, respondId), "session_op_respond"),
      waitFor(ws, (m) => isError(m, respondId), "session_op_respond error").then((err) => {
        throw new Error(err.payload?.message ?? JSON.stringify(err));
      }),
    ]);
    if (!responded.payload?.success) {
      throw new Error(`session_op_respond failed: ${JSON.stringify(responded.payload)}`);
    }
    const resolved = await waitChat(
      ["session_op_resolved", "session_op_requested", "error"],
      "session_op_result",
    );
    last = chatEvent(resolved, chatId);
    console.log("session_op_result", JSON.stringify(last, null, 2));
    await new Promise((r) => setTimeout(r, 250));
    if (last?.payload?.type !== "session_op_requested") break;
    if (sentExplicit) break;
  }
}

const childId = events
  .map((e) => e?.payload)
  .find((p) => p?.type === "session_forked")
  ?.chat_id?.trim();
if (!flag("keep")) {
  request(ws, "agent_chat_delete", { chat_id: chatId });
  if (childId && childId !== chatId) {
    request(ws, "agent_chat_delete", { chat_id: childId });
  }
}
ws.close();

const types = events.map((e) => payloadType(e)).filter(Boolean);
console.log("event_types", types.join(","));
const toolCalls = events
  .map((e) => e?.payload ?? e)
  .filter((p) => typeof p?.type === "string" && p.type.startsWith("tool_call"))
  .map((p) => ({
    type: p.type,
    name: p.tool_call?.name,
    kind: p.tool_call?.kind,
    status: p.tool_call?.status,
    params: p.tool_call?.params,
  }));
if (toolCalls.length) console.log("tool_calls", JSON.stringify(toolCalls, null, 2));
const permissions = events
  .map((e) => e?.payload ?? e)
  .filter((p) => p?.type === "permission_requested")
  .map((p) => p.request);
if (permissions.length) {
  console.log("permissions", JSON.stringify(permissions, null, 2));
}
const commandUpdates = events
  .map((e) => e?.payload ?? e)
  .filter((p) => p?.type === "available_commands_updated")
  .map((p) => (p.commands ?? []).map((c) => c.name));
if (commandUpdates.some((names) => names.length)) {
  console.log("slash_commands", JSON.stringify(commandUpdates.at(-1)));
}
if (events.some((e) => isQuotaError(e))) {
  console.error("STOP: 402 quota — not sending more turns");
  process.exit(2);
}
if (op === "fork" || op === "rewind") {
  const intercepted = types.includes("session_op_requested");
  if (op === "rewind" && provider === "pi") {
    if (intercepted) {
      process.exitCode = 2;
      console.error("FAIL: pi /rewind must not intercept");
    } else if (!types.includes("turn_completed") && !types.includes("error")) {
      process.exitCode = 2;
      console.error("FAIL: pi /rewind expected a user turn");
    } else {
      console.log("OK pi /rewind is a user turn");
    }
  } else if (!intercepted) {
    process.exitCode = 2;
    console.error(`FAIL: ${provider} ${sendTextValue} did not intercept`);
  } else if (respond && last?.payload?.outcome === "failed") {
    process.exitCode = 2;
    console.error(`FAIL: ${provider} ${sendTextValue} ${last.payload.error ?? "failed"}`);
  } else if (respond && !types.includes("session_op_resolved") && !types.includes("session_forked")) {
    process.exitCode = 2;
    console.error("FAIL: no session_op_resolved / session_forked after respond");
  } else {
    console.log("OK");
  }
  } else if (!types.includes("turn_completed")) {
  process.exitCode = 2;
  console.error("FAIL: no turn_completed");
} else {
  const turn = events.map((e) => e?.payload ?? e).find((p) => p?.type === "turn_completed");
  if (turn?.status === "failed") {
    process.exitCode = 2;
    console.error(`FAIL: turn_completed status=failed ${turn.error ?? ""}`);
  } else {
    console.log("OK");
  }
}

process.exit(process.exitCode ?? 0);
