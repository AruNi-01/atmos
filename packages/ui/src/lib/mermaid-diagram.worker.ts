import "./mermaid-worker-dom";
import mermaid from "mermaid";
import type { MermaidWorkerRequest, MermaidWorkerResponse } from "./mermaid-diagram-worker-protocol";

let lastTheme: "light" | "dark" | null = null;
let renderSeq = 0;

function configure(theme: "light" | "dark") {
  if (lastTheme === theme) return;
  mermaid.initialize({
    startOnLoad: false,
    securityLevel: "strict",
    suppressErrorRendering: true,
    theme: theme === "dark" ? "dark" : "default",
    htmlLabels: false,
    flowchart: { htmlLabels: false, useMaxWidth: true },
  });
  lastTheme = theme;
}

self.addEventListener("message", (event: MessageEvent<MermaidWorkerRequest>) => {
  const data = event.data;
  if (!data || typeof data.id !== "number" || typeof data.code !== "string") return;
  void (async () => {
    try {
      configure(data.theme);
      renderSeq += 1;
      const { svg } = await mermaid.render(`atmos-mermaid-w-${data.id}-${renderSeq}`, data.code);
      if (!svg || /syntax error/i.test(svg)) {
        throw new Error("Failed to render mermaid diagram");
      }
      const response: MermaidWorkerResponse = { id: data.id, svg };
      self.postMessage(response);
    } catch (error) {
      const response: MermaidWorkerResponse = {
        id: data.id,
        error: error instanceof Error ? error.message : "Failed to render mermaid diagram",
      };
      self.postMessage(response);
    }
  })();
});
