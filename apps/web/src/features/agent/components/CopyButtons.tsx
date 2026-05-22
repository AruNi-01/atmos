"use client";

import React, { useState, useCallback } from "react";
import { motion, AnimatePresence } from "motion/react";
import { Copy, Check } from "lucide-react";

export function CommandCopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);
  const handleCopy = useCallback(() => {
    navigator.clipboard.writeText(text).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    }).catch(() => {});
  }, [text]);
  return (
    <button
      type="button"
      onClick={handleCopy}
      className="shrink-0 px-2 py-1 text-zinc-500 hover:text-zinc-300 transition-colors cursor-pointer"
      aria-label="Copy command"
    >
      {copied ? <Check className="size-3.5" /> : <Copy className="size-3.5" />}
    </button>
  );
}

export function MessageCopyButton({
  text,
  ariaLabel,
  title,
  className = "",
  children,
}: {
  text: string;
  ariaLabel: string;
  title: string;
  className?: string;
  children?: React.ReactNode;
}) {
  const [copied, setCopied] = useState(false);

  const handleCopy = useCallback(() => {
    const trimmed = text.trim();
    if (!trimmed) return;
    void navigator.clipboard.writeText(trimmed).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1200);
    }).catch(() => {});
  }, [text]);

  return (
    <button
      type="button"
      className={`cursor-pointer ${className}`}
      onClick={handleCopy}
      aria-label={ariaLabel}
      title={title}
    >
      <AnimatePresence mode="wait" initial={false}>
        {copied ? (
          <motion.span
            key="copied"
            initial={{ opacity: 0, scale: 0.85 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.9 }}
            transition={{ duration: 0.18, ease: "easeOut" }}
            className="inline-flex size-3.5 items-center justify-center"
          >
            <Check className="size-3.5 text-green-500" />
          </motion.span>
        ) : (
          <motion.span
            key="copy"
            initial={{ opacity: 0, scale: 0.85 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.9 }}
            transition={{ duration: 0.18, ease: "easeOut" }}
            className="inline-flex size-3.5 items-center justify-center"
          >
            <Copy className="size-3.5" />
          </motion.span>
        )}
      </AnimatePresence>
      {children}
    </button>
  );
}
