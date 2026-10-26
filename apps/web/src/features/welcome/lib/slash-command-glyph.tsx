"use client";

import React from "react";
import {
  SLASH_COMMAND_GLYPH_NODES,
  slashCommandChipToneClass,
  slashCommandListToneClass,
  slashCommandVisual,
  type SlashCommandGlyph,
  type SlashCommandVisual,
  type SlashGlyphNode,
} from "@/features/welcome/lib/slash-command-visual";

function SlashGlyphSvgNodes({ nodes }: { nodes: SlashGlyphNode[] }) {
  return nodes.map((node, index) => {
    if (node.type === "path") {
      return <path key={index} d={node.d} opacity={node.opacity} />;
    }
    if (node.type === "rect") {
      return (
        <rect
          key={index}
          width={node.width}
          height={node.height}
          x={node.x}
          y={node.y}
          rx={node.rx}
          ry={node.ry}
        />
      );
    }
    return (
      <g key={index} transform={node.transform}>
        <SlashGlyphSvgNodes nodes={node.children} />
      </g>
    );
  });
}

export function SlashCommandGlyphIcon({
  glyph,
  className,
  size = 16,
}: {
  glyph: SlashCommandGlyph;
  className?: string;
  size?: number;
}) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden
    >
      <SlashGlyphSvgNodes nodes={SLASH_COMMAND_GLYPH_NODES[glyph]} />
    </svg>
  );
}

export function SlashCommandGlyph({ commandId }: { commandId: string }) {
  const visual = slashCommandVisual(commandId);
  const toneClass = slashCommandListToneClass(visual.tone);
  const className = ["size-4", toneClass].filter(Boolean).join(" ");
  return <SlashCommandGlyphIcon glyph={visual.glyph} className={className} />;
}

function appendSlashGlyphNodes(parent: SVGElement, nodes: SlashGlyphNode[]) {
  const ns = "http://www.w3.org/2000/svg";
  for (const node of nodes) {
    if (node.type === "path") {
      const path = document.createElementNS(ns, "path");
      path.setAttribute("d", node.d);
      if (node.opacity != null) path.setAttribute("opacity", String(node.opacity));
      parent.appendChild(path);
      continue;
    }
    if (node.type === "rect") {
      const rect = document.createElementNS(ns, "rect");
      rect.setAttribute("width", String(node.width));
      rect.setAttribute("height", String(node.height));
      rect.setAttribute("x", String(node.x));
      rect.setAttribute("y", String(node.y));
      if (node.rx != null) rect.setAttribute("rx", String(node.rx));
      if (node.ry != null) rect.setAttribute("ry", String(node.ry));
      parent.appendChild(rect);
      continue;
    }
    const group = document.createElementNS(ns, "g");
    group.setAttribute("transform", node.transform);
    appendSlashGlyphNodes(group, node.children);
    parent.appendChild(group);
  }
}

export function buildSlashCommandChipIcon(glyph: SlashCommandGlyph): SVGSVGElement {
  const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  svg.setAttribute("aria-hidden", "true");
  svg.setAttribute("viewBox", "0 0 24 24");
  svg.setAttribute("width", "12");
  svg.setAttribute("height", "12");
  svg.setAttribute("fill", "none");
  svg.setAttribute("stroke", "currentColor");
  svg.setAttribute("stroke-width", "2");
  svg.setAttribute("stroke-linecap", "round");
  svg.setAttribute("stroke-linejoin", "round");
  svg.style.display = "block";
  svg.style.flexShrink = "0";
  appendSlashGlyphNodes(svg, SLASH_COMMAND_GLYPH_NODES[glyph]);
  return svg;
}

export function applySlashCommandChipLook(span: HTMLSpanElement, visual: SlashCommandVisual) {
  span.dataset.slashGlyph = visual.glyph;
  span.className = [span.className, slashCommandChipToneClass(visual.tone)]
    .filter(Boolean)
    .join(" ");
  span.appendChild(buildSlashCommandChipIcon(visual.glyph));
}
