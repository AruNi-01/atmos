"use client";

import { useEffect, useRef, useState } from "react";
import type { EmojiMartData } from "@emoji-mart/data";

type EmojiMartApi = typeof import("emoji-mart");

let emojiLoadingPromise:
  | Promise<{ emojiMart: EmojiMartApi; emojiData: EmojiMartData }>
  | undefined;

async function loadEmojiMart() {
  if (emojiLoadingPromise) return emojiLoadingPromise;

  emojiLoadingPromise = (async () => {
    const [emojiMartModule, emojiDataModule] = await Promise.all([
      import("emoji-mart"),
      import("@emoji-mart/data"),
    ]);
    const emojiMart = (
      "default" in emojiMartModule && emojiMartModule.default
        ? emojiMartModule.default
        : emojiMartModule
    ) as EmojiMartApi;
    const emojiData = (
      "default" in emojiDataModule
        ? (emojiDataModule as { default: EmojiMartData }).default
        : emojiDataModule
    ) as EmojiMartData;
    await emojiMart.init({ data: emojiData });
    return { emojiMart, emojiData };
  })();

  return emojiLoadingPromise;
}

export function MdLiveEmojiPicker({
  onSelect,
  loadingLabel,
  errorLabel,
}: {
  onSelect: (native: string) => void;
  loadingLabel: string;
  errorLabel: string;
}) {
  const hostRef = useRef<HTMLDivElement>(null);
  const onSelectRef = useRef(onSelect);
  onSelectRef.current = onSelect;
  const [status, setStatus] = useState<"loading" | "ready" | "error">("loading");

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const { emojiMart, emojiData } = await loadEmojiMart();
        if (cancelled || !hostRef.current) return;
        const theme = document.documentElement.classList.contains("dark") ? "dark" : "light";
        const locale = document.documentElement.lang.toLowerCase().startsWith("zh") ? "zh" : "en";
        new emojiMart.Picker({
          data: emojiData,
          theme,
          locale,
          previewPosition: "none",
          skinTonePosition: "search",
          navPosition: "top",
          dynamicWidth: true,
          perLine: 8,
          emojiButtonSize: 32,
          emojiSize: 20,
          emojiButtonRadius: "8px",
          autoFocus: true,
          maxFrequentRows: 1,
          onEmojiSelect: (emoji: { native?: string }) => {
            if (emoji.native) onSelectRef.current(emoji.native);
          },
          ref: hostRef,
        });
        if (!cancelled) setStatus("ready");
      } catch {
        emojiLoadingPromise = undefined;
        if (!cancelled) setStatus("error");
      }
    })();
    return () => {
      cancelled = true;
      hostRef.current?.replaceChildren();
    };
  }, []);

  return (
    <div
      className="md-live-emoji-picker"
      onMouseDown={(event) => {
        const hitsInput = event.nativeEvent
          .composedPath()
          .some((node) => node instanceof HTMLInputElement);
        if (!hitsInput) event.preventDefault();
      }}
    >
      {status === "loading" ? (
        <div className="px-2 py-6 text-center text-[13px] text-muted-foreground">{loadingLabel}</div>
      ) : null}
      {status === "error" ? (
        <div className="px-2 py-6 text-center text-[13px] text-muted-foreground">{errorLabel}</div>
      ) : null}
      <div ref={hostRef} />
    </div>
  );
}
