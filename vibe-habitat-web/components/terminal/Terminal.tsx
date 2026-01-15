"use client";

import React, { useEffect, useRef } from 'react';

// Using 'any' for ghostty-web as types might vary or be missing in the early version
// We'll assume the basic API: new Ghostty.Terminal(element)
declare global {
  interface Window {
    Ghostty: any;
  }
}

interface TerminalProps {
  id: string;
}

export function Terminal({ id }: TerminalProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const terminalRef = useRef<any>(null);

  useEffect(() => {
    if (!containerRef.current) return;

    let cleanup = () => {};

    // Dynamic import to avoid SSR issues
    import('ghostty-web').then(async (Ghostty: any) => {
      if (terminalRef.current) return;

      await Ghostty.init();

      const term = new Ghostty.Terminal({
        // Remove element from config if we open manually, or keep it if library supports both.
        // Based on error "Call terminal.open(parent) first", we should probably do:
        fontSize: 14,
        fontFamily: "JetBrains Mono, monospace",
        theme: "dark",
      });

      // Explicitly open the terminal in the container
      term.open(containerRef.current);

      // Mock output
      term.write(`\r\n\x1b[1;34m➜\x1b[0m \x1b[1;36mvibe-habitat\x1b[0m on \x1b[1;35mmaster\x1b[0m [!] \r\n$ Welcome to VibeHabitat Terminal ${id}\r\n`);
      
      terminalRef.current = term;

      cleanup = () => {
         term.dispose(); // Check API docs if dispose exists
      };

    }).catch(err => {
      console.error("Failed to load Ghostty:", err);
      if (containerRef.current) {
        containerRef.current.innerHTML = `<div class="p-4 text-red-500">Failed to load terminal: ${err.message}. Fallback to basic view.</div>`;
      }
    });

    return cleanup;
  }, [id]);

  return (
    <div className="h-full w-full bg-[#0c0c0c] overflow-hidden" ref={containerRef} />
  );
}
