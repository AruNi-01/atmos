/** Keep the source pane's shape, just shrink it to a mid-size card. */
const PREVIEW_SCALE = 0.42;
const PREVIEW_MAX_WIDTH = 420;
const PREVIEW_MAX_HEIGHT = 280;
const PREVIEW_MIN_WIDTH = 200;

export function scaleTerminalDragPreview(
  width = 0,
  height = 0,
): { width: number; height: number; scale: number } {
  const safeW = Math.max(1, width);
  const safeH = Math.max(1, height);
  let scale = Math.min(PREVIEW_SCALE, PREVIEW_MAX_WIDTH / safeW, PREVIEW_MAX_HEIGHT / safeH);
  if (safeW * scale < PREVIEW_MIN_WIDTH) {
    const bumped = Math.min(PREVIEW_MIN_WIDTH / safeW, 0.72);
    if (safeW * bumped <= PREVIEW_MAX_WIDTH && safeH * bumped <= PREVIEW_MAX_HEIGHT) {
      scale = bumped;
    }
  }
  return {
    width: Math.max(1, Math.round(safeW * scale)),
    height: Math.max(1, Math.round(safeH * scale)),
    scale,
  };
}

/** Pointer sits on the top-center so the card hangs below the cursor. */
export function dragPreviewGrabOffset(width: number): { x: number; y: number } {
  return { x: Math.round(Math.max(1, width) / 2), y: 0 };
}

export function capturePanePreview(el: HTMLElement): {
  width: number;
  height: number;
  title: string;
  toolbarHtml: string;
  snapshotUrl: string | null;
  left: number;
  top: number;
} {
  const rect = el.getBoundingClientRect();
  const title =
    el.querySelector(".terminal-title-primary")?.textContent?.trim() ||
    el.querySelector(".terminal-pane-title")?.textContent?.trim() ||
    "";
  const toolbar =
    el.querySelector<HTMLElement>(".terminal-pane-toolbar-left") ??
    el.querySelector<HTMLElement>(".terminal-title-row");
  return {
    width: rect.width,
    height: rect.height,
    title,
    toolbarHtml: toolbar?.innerHTML ?? "",
    snapshotUrl: captureTerminalSnapshot(el),
    left: rect.left,
    top: rect.top,
  };
}

function captureTerminalSnapshot(root: HTMLElement): string | null {
  const host =
    root.querySelector<HTMLElement>(".atmos-terminal") ??
    root.querySelector<HTMLElement>(".xterm-screen") ??
    root.querySelector<HTMLElement>(".xterm") ??
    root;
  const canvases = Array.from(host.querySelectorAll("canvas")).filter((src) => {
    return src.width >= 16 && src.height >= 16;
  });
  if (canvases.length === 0) return paintTerminalRowsSnapshot(host);

  const hostRect = host.getBoundingClientRect();
  const width = Math.max(1, Math.round(hostRect.width));
  const height = Math.max(1, Math.round(hostRect.height));
  const scale = Math.min(2, window.devicePixelRatio || 1);
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(width * scale);
  canvas.height = Math.round(height * scale);
  const ctx = canvas.getContext("2d");
  if (!ctx) return paintTerminalRowsSnapshot(host);
  ctx.scale(scale, scale);
  ctx.fillStyle = "#09090b";
  ctx.fillRect(0, 0, width, height);

  let painted = false;
  for (const src of canvases) {
    try {
      const srcRect = src.getBoundingClientRect();
      ctx.drawImage(
        src,
        srcRect.left - hostRect.left,
        srcRect.top - hostRect.top,
        Math.max(1, srcRect.width),
        Math.max(1, srcRect.height),
      );
      painted = true;
    } catch {
      // WebGL/tainted canvas — try the next layer.
    }
  }

  if (!painted || isMostlyBlankCanvas(ctx, canvas.width, canvas.height)) {
    return paintTerminalRowsSnapshot(host);
  }
  try {
    return canvas.toDataURL("image/jpeg", 0.84);
  } catch {
    return paintTerminalRowsSnapshot(host);
  }
}

function isMostlyBlankCanvas(
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
): boolean {
  if (width <= 0 || height <= 0) return true;
  const samples: Array<[number, number]> = [
    [2, 2],
    [Math.floor(width / 2), Math.floor(height / 2)],
    [Math.max(0, width - 3), 2],
    [2, Math.max(0, height - 3)],
    [Math.floor(width / 4), Math.floor(height / 3)],
  ];
  try {
    for (const [x, y] of samples) {
      const pixel = ctx.getImageData(x, y, 1, 1).data;
      if ((pixel[0] ?? 0) > 20 || (pixel[1] ?? 0) > 20 || (pixel[2] ?? 0) > 20) {
        return false;
      }
    }
    const stripW = Math.min(width, 72);
    const strip = ctx.getImageData(0, Math.floor(height / 3), stripW, 1).data;
    for (let i = 0; i < strip.length; i += 4) {
      if ((strip[i] ?? 0) > 20 || (strip[i + 1] ?? 0) > 20 || (strip[i + 2] ?? 0) > 20) {
        return false;
      }
    }
  } catch {
    return false;
  }
  return true;
}

function paintTerminalRowsSnapshot(host: HTMLElement): string | null {
  const rows = host.querySelectorAll(".xterm-rows > div");
  if (rows.length === 0) return null;
  const width = 440;
  const lineHeight = 16;
  const height = Math.min(320, Math.max(lineHeight * 8, rows.length * lineHeight));
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d");
  if (!ctx) return null;
  ctx.fillStyle = "#09090b";
  ctx.fillRect(0, 0, width, height);
  ctx.font = "12px ui-monospace, SFMono-Regular, Menlo, monospace";
  ctx.fillStyle = "#d4d4d8";
  let y = 14;
  rows.forEach((row) => {
    if (y > height) return;
    const text = row.textContent ?? "";
    if (text.trim().length === 0) {
      y += lineHeight;
      return;
    }
    ctx.fillText(text.slice(0, 80), 8, y, width - 16);
    y += lineHeight;
  });
  try {
    return canvas.toDataURL("image/jpeg", 0.84);
  } catch {
    return null;
  }
}
