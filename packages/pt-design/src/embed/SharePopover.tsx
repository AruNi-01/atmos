"use client";

import React from "react";
import { Check, Copy } from "lucide-react";
import { chromeTokens } from "./chrome";
import { buildLocalAgentPrompt } from "./agent-prompt";
import type { CollabRoom } from "../collab/constants";

export type CollabMode = "local" | "invite";

export type SharePanelTab = "agent" | "human";

export type ShareCopy = {
  title: string;
  nameLabel: string;
  agentTab: string;
  humanTab: string;
  agentHint: string;
  copyPrompt: string;
  linkLabel: string;
  linkPlaceholder: string;
  copy: string;
  copied: string;
  invalidLink: string;
  privacy: string;
  stopHint: string;
  start: string;
  stop: string;
  startMenu: string;
  openMenu: string;
};

export const SHARE_COPY_EN: ShareCopy = {
  title: "Collaborate",
  nameLabel: "Your name",
  agentTab: "With Agent",
  humanTab: "With Human",
  agentHint: "Copy this prompt into your Agent. It calls the open board on this computer.",
  copyPrompt: "Copy prompt",
  linkLabel: "Link",
  linkPlaceholder: "Paste a collaboration link to join",
  copy: "Copy link",
  copied: "Copied",
  invalidLink: "That link does not contain a room.",
  privacy: "End-to-end encrypted. The server cannot see the board.",
  stopHint: "Stopping disconnects you only. Others can keep collaborating.",
  start: "Start collaboration",
  stop: "Stop collaboration",
  startMenu: "Collaborate",
  openMenu: "Collaborate",
};

export const SHARE_COPY_ZH: ShareCopy = {
  title: "协作",
  nameLabel: "你的名称",
  agentTab: "和 Agent",
  humanTab: "和人类",
  agentHint: "把这段 Prompt 发给 Agent。它会改本机已打开的画板。",
  copyPrompt: "复制 Prompt",
  linkLabel: "链接",
  linkPlaceholder: "粘贴协作链接以加入",
  copy: "复制链接",
  copied: "已复制",
  invalidLink: "这个链接里没有房间。",
  privacy: "端到端加密，服务器看不到画布内容。",
  stopHint: "结束协作只会断开你自己，其他人仍可继续协作。",
  start: "开始协作",
  stop: "停止协作",
  startMenu: "协作",
  openMenu: "协作",
};

function preferZh(): boolean {
  if (typeof document !== "undefined" && document.documentElement.lang.toLowerCase().startsWith("zh")) {
    return true;
  }
  if (typeof navigator !== "undefined" && navigator.language.toLowerCase().startsWith("zh")) {
    return true;
  }
  return false;
}

export function resolveShareCopy(explicit?: Partial<ShareCopy>): ShareCopy {
  return { ...(preferZh() ? SHARE_COPY_ZH : SHARE_COPY_EN), ...explicit };
}

async function writeClipboard(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    return false;
  }
}

export function SharePopover({
  theme,
  username,
  clientId,
  room,
  inviteUrl,
  apiBase,
  copy,
  onStart,
  onUsernameChange,
  onJoin,
  onStop,
}: {
  theme: "light" | "dark";
  username: string;
  clientId?: string;
  room: CollabRoom | null;
  inviteUrl: string | null;
  apiBase?: string | null;
  copy: ShareCopy;
  onStart: () => void;
  onUsernameChange: (name: string) => void;
  onJoin: (raw: string) => boolean;
  onStop: () => void;
}) {
  const chrome = chromeTokens(theme);
  const [tab, setTab] = React.useState<SharePanelTab>(room ? "human" : "agent");
  const [draftName, setDraftName] = React.useState(username);
  const [draftUrl, setDraftUrl] = React.useState(inviteUrl ?? "");
  const [linkError, setLinkError] = React.useState(false);
  const [copied, setCopied] = React.useState<"prompt" | "link" | null>(null);
  const copiedTimer = React.useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  React.useEffect(() => {
    setDraftName(username);
  }, [username]);

  React.useEffect(() => {
    setDraftUrl(inviteUrl ?? "");
    setLinkError(false);
  }, [inviteUrl]);

  React.useEffect(() => {
    if (room) setTab("human");
  }, [room]);

  React.useEffect(() => {
    return () => {
      if (copiedTimer.current) clearTimeout(copiedTimer.current);
    };
  }, []);

  const markCopied = (kind: "prompt" | "link") => {
    setCopied(kind);
    if (copiedTimer.current) clearTimeout(copiedTimer.current);
    copiedTimer.current = setTimeout(() => setCopied(null), 1600);
  };

  const field: React.CSSProperties = {
    width: "100%",
    height: 36,
    boxSizing: "border-box",
    borderRadius: 8,
    border: `1px solid ${chrome.border}`,
    background: chrome.bg,
    color: chrome.fg,
    padding: "0 10px",
    fontSize: 13,
    outline: "none",
  };

  const primaryBtn = (enabled: boolean): React.CSSProperties => ({
    flexShrink: 0,
    height: 36,
    padding: "0 12px",
    border: "none",
    borderRadius: 8,
    cursor: enabled ? "pointer" : "default",
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    fontSize: 13,
    fontWeight: 500,
    background: theme === "dark" ? "var(--primary, #fafafa)" : "var(--primary, #18181b)",
    color: theme === "dark" ? "var(--primary-foreground, #09090b)" : "var(--primary-foreground, #fafafa)",
    opacity: enabled ? 1 : 0.55,
  });

  const segment = (active: boolean): React.CSSProperties => ({
    flex: 1,
    height: 30,
    border: "none",
    borderRadius: 6,
    cursor: "pointer",
    fontSize: 12,
    fontWeight: 500,
    background: active ? chrome.card : "transparent",
    color: chrome.fg,
    boxShadow: active ? `0 0 0 1px ${chrome.border}` : "none",
  });

  return (
    <div
      data-testid="pt-design-share-popover"
      data-tab={tab}
      role="dialog"
      aria-label={copy.title}
      onMouseDown={(event) => event.stopPropagation()}
      style={{
        width: 360,
        padding: 16,
        borderRadius: 12,
        background: chrome.card,
        color: chrome.fg,
        border: `1px solid ${chrome.border}`,
        boxShadow: "0 16px 40px rgba(0,0,0,0.28)",
        display: "flex",
        flexDirection: "column",
        gap: 12,
      }}
    >
      <div style={{ fontSize: 16, fontWeight: 600, letterSpacing: "-0.01em" }}>{copy.title}</div>

      <div
        role="tablist"
        style={{
          display: "flex",
          gap: 4,
          padding: 3,
          borderRadius: 8,
          background: chrome.muted,
        }}
      >
        {(["agent", "human"] as const).map((id) => (
          <button
            key={id}
            type="button"
            role="tab"
            aria-selected={tab === id}
            data-testid={`pt-design-share-tab-${id}`}
            onClick={() => setTab(id)}
            style={segment(tab === id)}
          >
            {id === "agent" ? copy.agentTab : copy.humanTab}
          </button>
        ))}
      </div>

      {tab === "agent" ? (
        <>
          <p style={{ margin: 0, fontSize: 12, lineHeight: 1.5, color: chrome.mutedFg }}>{copy.agentHint}</p>

          <button
            type="button"
            data-testid="pt-design-share-copy-prompt"
            disabled={!clientId}
            onClick={async () => {
              if (!clientId) return;
              if (await writeClipboard(buildLocalAgentPrompt(clientId, apiBase))) markCopied("prompt");
            }}
            style={{ ...primaryBtn(Boolean(clientId)), width: "100%" }}
          >
            {copied === "prompt" ? <Check size={14} strokeWidth={2} /> : <Copy size={14} strokeWidth={2} />}
            {copied === "prompt" ? copy.copied : copy.copyPrompt}
          </button>
        </>
      ) : (
        <>
          <label style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            <span style={{ fontSize: 12, fontWeight: 500, color: chrome.mutedFg }}>{copy.nameLabel}</span>
            <input
              data-testid="pt-design-share-name"
              value={draftName}
              onChange={(event) => setDraftName(event.target.value)}
              onBlur={() => onUsernameChange(draftName)}
              onKeyDown={(event) => {
                if (event.key === "Enter") event.currentTarget.blur();
              }}
              style={field}
            />
          </label>

          {room ? (
            <>
              <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                <span style={{ fontSize: 12, fontWeight: 500, color: chrome.mutedFg }}>{copy.linkLabel}</span>
                <div style={{ display: "flex", gap: 8 }}>
                  <input
                    data-testid="pt-design-share-url"
                    value={draftUrl}
                    placeholder={copy.linkPlaceholder}
                    onChange={(event) => {
                      setDraftUrl(event.target.value);
                      setLinkError(false);
                    }}
                    onBlur={() => {
                      const raw = draftUrl.trim();
                      if (!raw) {
                        setDraftUrl(inviteUrl ?? "");
                        setLinkError(false);
                        return;
                      }
                      if (raw === (inviteUrl ?? "").trim()) return;
                      setLinkError(!onJoin(raw));
                    }}
                    onKeyDown={(event) => {
                      if (event.key === "Enter") event.currentTarget.blur();
                    }}
                    onFocus={(event) => event.currentTarget.select()}
                    onPaste={(event) => {
                      const text = event.clipboardData.getData("text").trim();
                      if (!text) return;
                      event.preventDefault();
                      setDraftUrl(text);
                      setLinkError(!onJoin(text));
                    }}
                    style={{ ...field, flex: 1, minWidth: 0 }}
                  />
                  <button
                    type="button"
                    data-testid="pt-design-share-copy"
                    disabled={!inviteUrl}
                    onClick={async () => {
                      if (!inviteUrl) return;
                      if (await writeClipboard(inviteUrl)) markCopied("link");
                    }}
                    style={primaryBtn(Boolean(inviteUrl))}
                  >
                    {copied === "link" ? <Check size={14} strokeWidth={2} /> : <Copy size={14} strokeWidth={2} />}
                    {copied === "link" ? copy.copied : copy.copy}
                  </button>
                </div>
                {linkError ? (
                  <span data-testid="pt-design-share-url-error" style={{ fontSize: 12, color: "var(--destructive, #ef4444)" }}>
                    {copy.invalidLink}
                  </span>
                ) : null}
              </div>

              <button
                type="button"
                data-testid="pt-design-share-stop"
                onClick={onStop}
                style={{
                  height: 36,
                  borderRadius: 8,
                  border: "1px solid var(--destructive, #ef4444)",
                  background: "transparent",
                  color: "var(--destructive, #ef4444)",
                  fontSize: 13,
                  fontWeight: 500,
                  cursor: "pointer",
                }}
              >
                {copy.stop}
              </button>

              <div style={{ height: 1, background: chrome.border }} />
              <div style={{ display: "flex", flexDirection: "column", gap: 6, fontSize: 12, lineHeight: 1.5, color: chrome.mutedFg }}>
                <p style={{ margin: 0 }}>{copy.privacy}</p>
                <p style={{ margin: 0 }}>{copy.stopHint}</p>
              </div>
            </>
          ) : (
            <button
              type="button"
              data-testid="pt-design-share-start"
              onClick={onStart}
              style={{ ...primaryBtn(true), width: "100%" }}
            >
              {copy.start}
            </button>
          )}
        </>
      )}
    </div>
  );
}
