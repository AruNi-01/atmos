/**
 * Fence-header icons for the enriched-markdown patch.
 *
 * Web `MarkdownCodeBlock` draws a 16px glyph before the language:
 * FileDiff for `diff`, Lucide Code when the fence has no language, and
 * `@react-symbols/icons` FileIcon otherwise (`code-block.tsx`).
 *
 * This script turns those SVGs into cubic drawing ops in a 16×16 box and
 * prints an Objective-C player the iOS fence header can call.
 */
import { dirname, resolve } from "node:path";
import { pathToFileURL, fileURLToPath } from "node:url";

const webModules = resolve(dirname(fileURLToPath(import.meta.url)), "../../apps/web/node_modules");
const [{ createElement }, { renderToStaticMarkup }, { FileIcon }, lucide] = await Promise.all([
  import(pathToFileURL(resolve(webModules, "react/index.js")).href),
  import(pathToFileURL(resolve(webModules, "react-dom/server.js")).href),
  import(pathToFileURL(resolve(webModules, "@react-symbols/icons/build/utils/index.mjs")).href),
  import(pathToFileURL(resolve(webModules, "lucide-react/dist/esm/lucide-react.mjs")).href),
]);
const { Code, FileDiff } = lucide;

const LANG_TO_EXT = {
  javascript: "js",
  typescript: "ts",
  tsx: "tsx",
  jsx: "jsx",
  python: "py",
  rust: "rs",
  bash: "sh",
  shellscript: "sh",
  markdown: "md",
  yaml: "yml",
  toml: "toml",
  json: "json",
  html: "html",
  css: "css",
  go: "go",
  java: "java",
  sql: "sql",
  dockerfile: "dockerfile",
  c: "c",
  cpp: "cpp",
};

const ALIASES = {
  shell: "bash",
  zsh: "bash",
  js: "javascript",
  ts: "typescript",
  py: "python",
  rs: "rust",
  yml: "yaml",
  "c++": "cpp",
  md: "markdown",
};

const BOX = 16;

function normalizeLang(lang) {
  const lower = lang.toLowerCase();
  return ALIASES[lower] ?? lower;
}

/** Same key the native header uses. */
export function fenceIconKey(language) {
  if (!language) return "code";
  const normalized = normalizeLang(language);
  if (normalized === "diff") return "file-diff";
  return LANG_TO_EXT[normalized] || normalized;
}

function iconSvg(key) {
  if (key === "code") {
    return renderToStaticMarkup(createElement(Code, { size: BOX, color: "#000000" }));
  }
  if (key === "file-diff") {
    return renderToStaticMarkup(createElement(FileDiff, { size: BOX, color: "#000000" }));
  }
  const fileName = key === "file" ? ".zzz" : `.${key}`;
  return renderToStaticMarkup(
    createElement(FileIcon, { fileName, autoAssign: true, width: BOX, height: BOX }),
  );
}

function skipSep(d, i) {
  while (i < d.length && /[\s,]/.test(d[i])) i++;
  return i;
}

function readNumber(d, i) {
  i = skipSep(d, i);
  const match = /^[+-]?(?:\d+\.?\d*|\.\d+)(?:[eE][+-]?\d+)?/.exec(d.slice(i));
  if (!match) throw new Error(`Expected number at ${i} in ${d.slice(i, i + 24)}`);
  return { value: Number(match[0]), i: i + match[0].length };
}

function readFlag(d, i) {
  i = skipSep(d, i);
  const flag = d[i];
  if (flag !== "0" && flag !== "1")
    throw new Error(`Expected arc flag at ${i} in ${d.slice(i, i + 24)}`);
  return { value: flag === "1", i: i + 1 };
}

function reflect(px, py, cx, cy) {
  return [2 * px - cx, 2 * py - cy];
}

function arcToCubics(x1, y1, rx, ry, phiDeg, large, sweep, x2, y2) {
  if (x1 === x2 && y1 === y2) return [];
  rx = Math.abs(rx);
  ry = Math.abs(ry);
  if (rx === 0 || ry === 0) return [[x1, y1, x2, y2, x2, y2]];

  const phi = (phiDeg * Math.PI) / 180;
  const sinPhi = Math.sin(phi);
  const cosPhi = Math.cos(phi);
  const dx = (x1 - x2) / 2;
  const dy = (y1 - y2) / 2;
  const x1p = cosPhi * dx + sinPhi * dy;
  const y1p = -sinPhi * dx + cosPhi * dy;

  let rxsq = rx * rx;
  let rysq = ry * ry;
  const lambda = (x1p * x1p) / rxsq + (y1p * y1p) / rysq;
  if (lambda > 1) {
    const scale = Math.sqrt(lambda);
    rx *= scale;
    ry *= scale;
    rxsq = rx * rx;
    rysq = ry * ry;
  }

  const sign = large === sweep ? -1 : 1;
  let coefNum = rxsq * rysq - rxsq * y1p * y1p - rysq * x1p * x1p;
  const coefDen = rxsq * y1p * y1p + rysq * x1p * x1p;
  coefNum = coefNum < 0 ? 0 : coefNum;
  const coef = sign * Math.sqrt(coefNum / coefDen);
  const cxp = coef * ((rx * y1p) / ry);
  const cyp = coef * (-(ry * x1p) / rx);
  const cx = cosPhi * cxp - sinPhi * cyp + (x1 + x2) / 2;
  const cy = sinPhi * cxp + cosPhi * cyp + (y1 + y2) / 2;

  function angle(ux, uy, vx, vy) {
    const dot = ux * vx + uy * vy;
    const len = Math.hypot(ux, uy) * Math.hypot(vx, vy);
    let ang = Math.acos(Math.min(1, Math.max(-1, dot / (len || 1))));
    if (ux * vy - uy * vx < 0) ang = -ang;
    return ang;
  }

  const theta1 = angle(1, 0, (x1p - cxp) / rx, (y1p - cyp) / ry);
  let dTheta = angle((x1p - cxp) / rx, (y1p - cyp) / ry, (-x1p - cxp) / rx, (-y1p - cyp) / ry);
  if (!sweep && dTheta > 0) dTheta -= Math.PI * 2;
  if (sweep && dTheta < 0) dTheta += Math.PI * 2;

  const segments = Math.max(1, Math.ceil(Math.abs(dTheta) / (Math.PI / 2)));
  const delta = dTheta / segments;
  const cubics = [];
  for (let i = 0; i < segments; i++) {
    const t1 = theta1 + i * delta;
    const t2 = t1 + delta;
    const k = (4 / 3) * Math.tan(delta / 4);
    const point = (t) => {
      const cos = Math.cos(t);
      const sin = Math.sin(t);
      return [
        cx + rx * cosPhi * cos - ry * sinPhi * sin,
        cy + rx * sinPhi * cos + ry * cosPhi * sin,
      ];
    };
    const deriv = (t) => {
      const cos = Math.cos(t);
      const sin = Math.sin(t);
      return [-rx * cosPhi * sin - ry * sinPhi * cos, -rx * sinPhi * sin + ry * cosPhi * cos];
    };
    const [p1x, p1y] = point(t1);
    const [p2x, p2y] = point(t2);
    const [d1x, d1y] = deriv(t1);
    const [d2x, d2y] = deriv(t2);
    cubics.push([p1x + k * d1x, p1y + k * d1y, p2x - k * d2x, p2y - k * d2y, p2x, p2y]);
  }
  return cubics;
}

function pathToSubpaths(d) {
  const subpaths = [];
  let current = [];
  let i = 0;
  let cmd = "";
  let x = 0;
  let y = 0;
  let sx = 0;
  let sy = 0;
  let prevCx = 0;
  let prevCy = 0;
  let prevQx = 0;
  let prevQy = 0;
  let lastOp = "";

  const read = () => {
    const next = readNumber(d, i);
    i = next.i;
    return next.value;
  };
  const start = () => {
    if (current.length > 0) subpaths.push(current);
    current = [];
  };

  while (i < d.length) {
    i = skipSep(d, i);
    if (i >= d.length) break;
    if (/[a-zA-Z]/.test(d[i])) cmd = d[i++];
    const rel = cmd === cmd.toLowerCase();
    const op = cmd.toUpperCase();
    if (op === "M") {
      const nx = (rel ? x : 0) + read();
      const ny = (rel ? y : 0) + read();
      start();
      current.push({ t: "M", x: nx, y: ny });
      x = sx = nx;
      y = sy = ny;
      lastOp = "M";
      cmd = rel ? "l" : "L";
      continue;
    }
    if (op === "Z") {
      current.push({ t: "Z" });
      x = sx;
      y = sy;
      lastOp = "Z";
      continue;
    }
    if (op === "L") {
      const nx = (rel ? x : 0) + read();
      const ny = (rel ? y : 0) + read();
      current.push({ t: "L", x: nx, y: ny });
      x = nx;
      y = ny;
    } else if (op === "H") {
      const nx = (rel ? x : 0) + read();
      current.push({ t: "L", x: nx, y });
      x = nx;
    } else if (op === "V") {
      const ny = (rel ? y : 0) + read();
      current.push({ t: "L", x, y: ny });
      y = ny;
    } else if (op === "C") {
      const c1x = (rel ? x : 0) + read();
      const c1y = (rel ? y : 0) + read();
      const c2x = (rel ? x : 0) + read();
      const c2y = (rel ? y : 0) + read();
      const nx = (rel ? x : 0) + read();
      const ny = (rel ? y : 0) + read();
      current.push({ t: "C", x1: c1x, y1: c1y, x2: c2x, y2: c2y, x: nx, y: ny });
      prevCx = c2x;
      prevCy = c2y;
      x = nx;
      y = ny;
    } else if (op === "S") {
      const c2x = (rel ? x : 0) + read();
      const c2y = (rel ? y : 0) + read();
      const nx = (rel ? x : 0) + read();
      const ny = (rel ? y : 0) + read();
      const [c1x, c1y] = lastOp === "C" || lastOp === "S" ? reflect(x, y, prevCx, prevCy) : [x, y];
      current.push({ t: "C", x1: c1x, y1: c1y, x2: c2x, y2: c2y, x: nx, y: ny });
      prevCx = c2x;
      prevCy = c2y;
      x = nx;
      y = ny;
    } else if (op === "Q") {
      const qx = (rel ? x : 0) + read();
      const qy = (rel ? y : 0) + read();
      const nx = (rel ? x : 0) + read();
      const ny = (rel ? y : 0) + read();
      current.push({
        t: "C",
        x1: x + (2 / 3) * (qx - x),
        y1: y + (2 / 3) * (qy - y),
        x2: nx + (2 / 3) * (qx - nx),
        y2: ny + (2 / 3) * (qy - ny),
        x: nx,
        y: ny,
      });
      prevQx = qx;
      prevQy = qy;
      x = nx;
      y = ny;
    } else if (op === "T") {
      const nx = (rel ? x : 0) + read();
      const ny = (rel ? y : 0) + read();
      const [qx, qy] = lastOp === "Q" || lastOp === "T" ? reflect(x, y, prevQx, prevQy) : [x, y];
      current.push({
        t: "C",
        x1: x + (2 / 3) * (qx - x),
        y1: y + (2 / 3) * (qy - y),
        x2: nx + (2 / 3) * (qx - nx),
        y2: ny + (2 / 3) * (qy - ny),
        x: nx,
        y: ny,
      });
      prevQx = qx;
      prevQy = qy;
      x = nx;
      y = ny;
    } else if (op === "A") {
      const rx = read();
      const ry = read();
      const rot = read();
      const large = readFlag(d, i);
      i = large.i;
      const sweep = readFlag(d, i);
      i = sweep.i;
      const nx = (rel ? x : 0) + read();
      const ny = (rel ? y : 0) + read();
      for (const cubic of arcToCubics(x, y, rx, ry, rot, large.value, sweep.value, nx, ny)) {
        current.push({
          t: "C",
          x1: cubic[0],
          y1: cubic[1],
          x2: cubic[2],
          y2: cubic[3],
          x: cubic[4],
          y: cubic[5],
        });
      }
      x = nx;
      y = ny;
    } else {
      throw new Error(`Unknown path command ${cmd} at ${i}`);
    }
    lastOp = op;
  }
  if (current.length > 0) subpaths.push(current);
  return subpaths;
}

function roundedRectPath(x, y, w, h, rx, ry) {
  rx = Math.min(rx, w / 2);
  ry = Math.min(ry, h / 2);
  if (rx <= 0 || ry <= 0) {
    return pathToSubpaths(`M${x} ${y}H${x + w}V${y + h}H${x}Z`);
  }
  const k = 0.5522847498;
  const cx = rx * k;
  const cy = ry * k;
  const r = x + w;
  const b = y + h;
  return [
    [
      { t: "M", x: x + rx, y },
      { t: "L", x: r - rx, y },
      { t: "C", x1: r - rx + cx, y1: y, x2: r, y2: y + ry - cy, x: r, y: y + ry },
      { t: "L", x: r, y: b - ry },
      { t: "C", x1: r, y1: b - ry + cy, x2: r - rx + cx, y2: b, x: r - rx, y: b },
      { t: "L", x: x + rx, y: b },
      { t: "C", x1: x + rx - cx, y1: b, x2: x, y2: b - ry + cy, x: x, y: b - ry },
      { t: "L", x, y: y + ry },
      { t: "C", x1: x, y1: y + ry - cy, x2: x + rx - cx, y2: y, x: x + rx, y },
      { t: "Z" },
    ],
  ];
}

function circlePath(cx, cy, r) {
  return pathToSubpaths(
    `M ${cx - r} ${cy} A ${r} ${r} 0 1 0 ${cx + r} ${cy} A ${r} ${r} 0 1 0 ${cx - r} ${cy}`,
  );
}

function parseTags(svg) {
  const tags = [];
  const re = /<\/?([a-zA-Z]+)([^>]*)\/?>/g;
  const stack = [{ children: tags }];
  for (const match of svg.matchAll(re)) {
    const name = match[1];
    const raw = match[0];
    const closing = raw.startsWith("</");
    if (closing) {
      stack.pop();
      continue;
    }
    const attrs = {};
    for (const attr of raw.matchAll(/([:@a-zA-Z-]+)="([^"]*)"/g)) attrs[attr[1]] = attr[2];
    const node = { name, attrs, children: [] };
    stack[stack.length - 1].children.push(node);
    const selfClosing = raw.endsWith("/>");
    if (!selfClosing) stack.push(node);
  }
  return tags;
}

function num(value, fallback = 0) {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

function parseTranslate(transform) {
  if (!transform) return [0, 0];
  const match = /translate\(\s*([+-]?\d*\.?\d+)(?:[\s,]+([+-]?\d*\.?\d+))?\s*\)/.exec(transform);
  if (!match) return [0, 0];
  return [num(match[1]), num(match[2])];
}

function shiftSubpaths(subpaths, dx, dy) {
  if (dx === 0 && dy === 0) return subpaths;
  return subpaths.map((sub) =>
    sub.map((cmd) => {
      if (cmd.t === "Z") return cmd;
      if (cmd.t === "L" || cmd.t === "M") return { ...cmd, x: cmd.x + dx, y: cmd.y + dy };
      return {
        ...cmd,
        x: cmd.x + dx,
        y: cmd.y + dy,
        x1: cmd.x1 + dx,
        y1: cmd.y1 + dy,
        x2: cmd.x2 + dx,
        y2: cmd.y2 + dy,
      };
    }),
  );
}

function presentation(node, parent) {
  const attrs = node.attrs;
  const fill = attrs.fill ?? parent.fill;
  const stroke = attrs.stroke ?? parent.stroke;
  return {
    fill: fill === "none" ? null : fill,
    stroke: stroke === "none" || stroke == null ? null : stroke,
    width: attrs["stroke-width"] != null ? num(attrs["stroke-width"], 1) : parent.width,
    cap: attrs["stroke-linecap"] ?? parent.cap,
    join: attrs["stroke-linejoin"] ?? parent.join,
    evenodd: (attrs["fill-rule"] ?? parent.fillRule) === "evenodd",
    clipEvenodd: (attrs["clip-rule"] ?? parent.clipRule) === "evenodd",
    fillRule: attrs["fill-rule"] ?? parent.fillRule,
    clipRule: attrs["clip-rule"] ?? parent.clipRule,
  };
}

function elementSubpaths(node, dx, dy) {
  if (node.name === "path" && node.attrs.d) {
    return shiftSubpaths(pathToSubpaths(node.attrs.d), dx, dy);
  }
  if (node.name === "rect") {
    const x = num(node.attrs.x);
    const y = num(node.attrs.y);
    const w = num(node.attrs.width);
    const h = num(node.attrs.height);
    const rx = num(node.attrs.rx);
    const ry = node.attrs.ry != null ? num(node.attrs.ry) : rx;
    return shiftSubpaths(roundedRectPath(x, y, w, h, rx, ry), dx, dy);
  }
  if (node.name === "circle") {
    return shiftSubpaths(
      circlePath(num(node.attrs.cx), num(node.attrs.cy), num(node.attrs.r)),
      dx,
      dy,
    );
  }
  return [];
}

function indexDefs(nodes, into = new Map()) {
  for (const node of nodes) {
    if ((node.name === "clipPath" || node.name === "mask") && node.attrs.id)
      into.set(node.attrs.id, node);
    indexDefs(node.children, into);
  }
  return into;
}

function urlId(value) {
  const match = /url\(#([^)]+)\)/.exec(value ?? "");
  return match ? match[1] : null;
}

const EMPTY_STYLE = {
  fill: null,
  stroke: null,
  width: 1,
  cap: "butt",
  join: "miter",
  evenodd: false,
  clipEvenodd: false,
  fillRule: "nonzero",
  clipRule: "nonzero",
};

function collectShapes(nodes, style, defs, dx, dy, out) {
  for (const node of nodes) {
    if (node.name === "defs") continue;
    const [tx, ty] = parseTranslate(node.attrs.transform);
    const nextDx = dx + tx;
    const nextDy = dy + ty;
    const next = node.name === "g" || node.name === "svg" ? presentation(node, style) : style;
    const clipId = urlId(node.attrs["clip-path"]);
    const maskId = urlId(node.attrs.mask);
    const clipNode = clipId ? defs.get(clipId) : maskId ? defs.get(maskId) : null;
    if (clipNode) {
      const clipPaths = [];
      collectShapes(
        clipNode.children,
        { ...EMPTY_STYLE, fill: "#fff" },
        defs,
        nextDx,
        nextDy,
        clipPaths,
      );
      out.push({ t: "save" });
      for (const shape of clipPaths) {
        if (shape.t !== "paint") continue;
        out.push({
          t: "clip",
          subpaths: shape.subpaths,
          evenodd: shape.evenodd,
          stroke: shape.stroke,
          width: shape.width,
          cap: shape.cap,
          join: shape.join,
        });
      }
    }
    if (node.name === "g" || node.name === "svg") {
      collectShapes(node.children, next, defs, nextDx, nextDy, out);
    } else if (node.name === "path" || node.name === "rect" || node.name === "circle") {
      const paint = presentation(node, style);
      const subpaths = elementSubpaths(node, nextDx, nextDy);
      if (subpaths.length > 0 && (paint.fill || paint.stroke)) {
        out.push({ t: "paint", ...paint, subpaths });
      }
    }
    if (clipNode) out.push({ t: "restore" });
  }
}

function viewBoxOf(svg) {
  const match = /viewBox="([^"]+)"/.exec(svg);
  const [minX, minY, width, height] = (match?.[1] ?? "0 0 24 24").split(/[\s,]+/).map(Number);
  return { minX, minY, width, height };
}

function meet(viewBox) {
  const scale = Math.min(BOX / viewBox.width, BOX / viewBox.height);
  const ox = (BOX - viewBox.width * scale) / 2 - viewBox.minX * scale;
  const oy = (BOX - viewBox.height * scale) / 2 - viewBox.minY * scale;
  return { scale, ox, oy };
}

function mapPoint(p, fit) {
  return [p[0] * fit.scale + fit.ox, p[1] * fit.scale + fit.oy];
}

function mapSubpaths(subpaths, fit) {
  return subpaths.map((sub) =>
    sub.map((cmd) => {
      if (cmd.t === "Z") return cmd;
      const [x, y] = mapPoint([cmd.x, cmd.y], fit);
      if (cmd.t !== "C") return { ...cmd, x, y };
      const [x1, y1] = mapPoint([cmd.x1, cmd.y1], fit);
      const [x2, y2] = mapPoint([cmd.x2, cmd.y2], fit);
      return { ...cmd, x, y, x1, y1, x2, y2 };
    }),
  );
}

function parseColor(color) {
  if (color == null) return null;
  if (color === "currentColor" || color === "#000000") return [-1, -1, -1, 1];
  const hex = /^#([0-9a-fA-F]{6})$/.exec(color);
  if (!hex) throw new Error(`Unsupported color ${color}`);
  const n = Number.parseInt(hex[1], 16);
  return [((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255, 1];
}

const CAP = { butt: 0, round: 1, square: 2 };
const JOIN = { miter: 0, round: 1, bevel: 2 };

function round(n) {
  return Math.round(n * 1000) / 1000;
}

/** Drawing ops in a 16×16 box. currentColor is r = -1. */
export function svgToOps(svg) {
  const root = parseTags(svg).find((node) => node.name === "svg");
  if (!root) throw new Error("SVG root missing");
  const defs = indexDefs(root.children);
  const style = presentation(root, EMPTY_STYLE);
  const shapes = [];
  collectShapes(root.children, style, defs, 0, 0, shapes);
  const fit = meet(viewBoxOf(svg));
  const ops = [];
  const pushSub = (subpaths) => {
    for (const sub of mapSubpaths(subpaths, fit)) {
      for (const cmd of sub) {
        if (cmd.t === "M") ops.push(1, round(cmd.x), round(cmd.y));
        else if (cmd.t === "L") ops.push(2, round(cmd.x), round(cmd.y));
        else if (cmd.t === "C") {
          ops.push(
            3,
            round(cmd.x1),
            round(cmd.y1),
            round(cmd.x2),
            round(cmd.y2),
            round(cmd.x),
            round(cmd.y),
          );
        } else if (cmd.t === "Z") ops.push(4);
      }
    }
  };
  for (const shape of shapes) {
    if (shape.t === "save") {
      ops.push(13);
      continue;
    }
    if (shape.t === "restore") {
      ops.push(14);
      continue;
    }
    if (shape.t === "clip") {
      pushSub(shape.subpaths);
      if (shape.stroke && shape.width > 0) {
        ops.push(
          15,
          shape.evenodd ? 1 : 0,
          round(shape.width * fit.scale),
          CAP[shape.cap] ?? 0,
          JOIN[shape.join] ?? 0,
        );
      } else {
        ops.push(12, shape.evenodd ? 1 : 0);
      }
      continue;
    }
    if (shape.fill) {
      pushSub(shape.subpaths);
      const [r, g, b, a] = parseColor(shape.fill);
      ops.push(10, round(r), round(g), round(b), a, shape.evenodd ? 1 : 0);
    }
    if (shape.stroke) {
      pushSub(shape.subpaths);
      const [r, g, b, a] = parseColor(shape.stroke);
      const cap = CAP[shape.cap] ?? 0;
      const join = JOIN[shape.join] ?? 0;
      ops.push(11, round(r), round(g), round(b), a, round(shape.width * fit.scale), cap, join);
    }
  }
  return ops;
}

function fmt(n) {
  if (n === -1) return "-1";
  const text = String(n);
  return text;
}

function cArray(name, ops) {
  const body = [];
  for (let i = 0; i < ops.length; i += 12) {
    body.push(
      `    ${ops
        .slice(i, i + 12)
        .map(fmt)
        .join(", ")}`,
    );
  }
  return `static const float ${name}[] = {\n${body.join(",\n")}\n};`;
}

const ICON_KEYS = [
  "code",
  "file-diff",
  "file",
  "js",
  "jsx",
  "ts",
  "tsx",
  "py",
  "rs",
  "sh",
  "md",
  "yml",
  "toml",
  "json",
  "html",
  "css",
  "go",
  "java",
  "sql",
  "dockerfile",
  "c",
  "cpp",
  "txt",
];

export function fenceIconCatalog() {
  return ICON_KEYS.map((key) => ({ key, svg: iconSvg(key), ops: svgToOps(iconSvg(key)) }));
}

function ident(key) {
  return key.replace(/[^a-z0-9]+/gi, "_");
}

export function emitFenceIconSource() {
  const catalog = fenceIconCatalog();
  const arrays = catalog.map((icon) => cArray(`kENRMFence_${ident(icon.key)}`, icon.ops));
  const rows = catalog
    .map(
      (icon) =>
        `    {@"${icon.key}", kENRMFence_${ident(icon.key)}, (int)(sizeof(kENRMFence_${ident(icon.key)}) / sizeof(float))},`,
    )
    .join("\n");
  return `// Generated by scripts/agent-chat-parity/fence-icons.mjs.
// Web MarkdownCodeBlock header glyphs: Lucide Code, Lucide FileDiff, and
// @react-symbols/icons FileIcon. Coordinates are a 16×16 box.
#import "ENRMFenceIcons.h"
#import <CoreGraphics/CoreGraphics.h>

${arrays.join("\n\n")}

typedef struct {
  __unsafe_unretained NSString *key;
  const float *ops;
  int count;
} ENRMFenceIconRow;

static const ENRMFenceIconRow kENRMFenceIcons[] = {
${rows}
};

static NSString *ENRMFenceIconKey(NSString *language)
{
  if (language.length == 0) {
    return @"code";
  }
  NSString *lang = language.lowercaseString;
  if ([lang isEqualToString:@"shell"] || [lang isEqualToString:@"zsh"]) lang = @"bash";
  else if ([lang isEqualToString:@"js"]) lang = @"javascript";
  else if ([lang isEqualToString:@"ts"]) lang = @"typescript";
  else if ([lang isEqualToString:@"py"]) lang = @"python";
  else if ([lang isEqualToString:@"rs"]) lang = @"rust";
  else if ([lang isEqualToString:@"yml"]) lang = @"yaml";
  else if ([lang isEqualToString:@"c++"]) lang = @"cpp";
  else if ([lang isEqualToString:@"md"]) lang = @"markdown";
  if ([lang isEqualToString:@"diff"]) {
    return @"file-diff";
  }
  if ([lang isEqualToString:@"javascript"]) return @"js";
  if ([lang isEqualToString:@"typescript"]) return @"ts";
  if ([lang isEqualToString:@"python"]) return @"py";
  if ([lang isEqualToString:@"rust"]) return @"rs";
  if ([lang isEqualToString:@"bash"] || [lang isEqualToString:@"shellscript"]) return @"sh";
  if ([lang isEqualToString:@"markdown"]) return @"md";
  if ([lang isEqualToString:@"yaml"]) return @"yml";
  static NSSet<NSString *> *direct;
  static dispatch_once_t once;
  dispatch_once(&once, ^{
    direct = [NSSet setWithArray:@[
      @"tsx", @"jsx", @"toml", @"json", @"html", @"css", @"go", @"java", @"sql",
      @"dockerfile", @"c", @"cpp", @"txt"
    ]];
  });
  if ([direct containsObject:lang]) {
    return lang;
  }
  return @"file";
}

static const ENRMFenceIconRow *ENRMFenceIconRowForKey(NSString *key)
{
  const ENRMFenceIconRow *fallback = &kENRMFenceIcons[0];
  for (size_t i = 0; i < sizeof(kENRMFenceIcons) / sizeof(kENRMFenceIcons[0]); i++) {
    if ([kENRMFenceIcons[i].key isEqualToString:@"file"]) {
      fallback = &kENRMFenceIcons[i];
    }
    if ([key isEqualToString:kENRMFenceIcons[i].key]) {
      return &kENRMFenceIcons[i];
    }
  }
  return fallback;
}

static void ENRMFenceInk(BOOL dark, CGFloat *r, CGFloat *g, CGFloat *b)
{
  CGFloat ink = dark ? (0xA3 / 255.0) : (0x52 / 255.0);
  *r = ink;
  *g = ink;
  *b = ink;
}

void ENRMDrawFenceIcon(CGContextRef ctx, NSString *_Nullable language, CGRect box, BOOL darkInk)
{
  if (!ctx || box.size.width <= 0 || box.size.height <= 0) {
    return;
  }
  const ENRMFenceIconRow *row = ENRMFenceIconRowForKey(ENRMFenceIconKey(language));
  const float *ops = row->ops;
  int count = row->count;
  CGContextSaveGState(ctx);
  CGContextTranslateCTM(ctx, box.origin.x, box.origin.y);
  CGContextScaleCTM(ctx, box.size.width / 16.0, box.size.height / 16.0);
  CGMutablePathRef path = CGPathCreateMutable();
  int i = 0;
  while (i < count) {
    int op = (int)ops[i++];
    if (op == 1 && i + 1 < count) {
      CGPathMoveToPoint(path, NULL, ops[i], ops[i + 1]);
      i += 2;
    } else if (op == 2 && i + 1 < count) {
      CGPathAddLineToPoint(path, NULL, ops[i], ops[i + 1]);
      i += 2;
    } else if (op == 3 && i + 5 < count) {
      CGPathAddCurveToPoint(path, NULL, ops[i], ops[i + 1], ops[i + 2], ops[i + 3], ops[i + 4], ops[i + 5]);
      i += 6;
    } else if (op == 4) {
      CGPathCloseSubpath(path);
    } else if (op == 10 && i + 4 < count) {
      CGFloat r = ops[i++], g = ops[i++], b = ops[i++], a = ops[i++];
      int even = (int)ops[i++];
      if (r < 0) ENRMFenceInk(darkInk, &r, &g, &b);
      CGContextAddPath(ctx, path);
      CGPathRelease(path);
      path = CGPathCreateMutable();
      CGContextSetRGBFillColor(ctx, r, g, b, a);
      if (even) CGContextEOFillPath(ctx);
      else CGContextFillPath(ctx);
    } else if (op == 11 && i + 6 < count) {
      CGFloat r = ops[i++], g = ops[i++], b = ops[i++], a = ops[i++], width = ops[i++];
      CGLineCap cap = (CGLineCap)(int)ops[i++];
      CGLineJoin join = (CGLineJoin)(int)ops[i++];
      if (r < 0) ENRMFenceInk(darkInk, &r, &g, &b);
      CGContextAddPath(ctx, path);
      CGPathRelease(path);
      path = CGPathCreateMutable();
      CGContextSetRGBStrokeColor(ctx, r, g, b, a);
      CGContextSetLineWidth(ctx, width);
      CGContextSetLineCap(ctx, cap);
      CGContextSetLineJoin(ctx, join);
      CGContextStrokePath(ctx);
    } else if ((op == 12 || op == 15) && i < count) {
      int even = (int)ops[i++];
      CGPathRef clipPath = path;
      CGPathRef stroked = NULL;
      if (op == 15 && i + 2 < count) {
        CGFloat width = ops[i++];
        CGLineCap cap = (CGLineCap)(int)ops[i++];
        CGLineJoin join = (CGLineJoin)(int)ops[i++];
        stroked = CGPathCreateCopyByStrokingPath(path, NULL, width, cap, join, 10);
      }
      CGContextAddPath(ctx, clipPath);
      if (stroked) CGContextAddPath(ctx, stroked);
      CGPathRelease(path);
      if (stroked) CGPathRelease(stroked);
      path = CGPathCreateMutable();
      if (even) CGContextEOClip(ctx);
      else CGContextClip(ctx);
    } else if (op == 13) {
      CGContextSaveGState(ctx);
    } else if (op == 14) {
      CGContextRestoreGState(ctx);
    } else {
      break;
    }
  }
  CGPathRelease(path);
  CGContextRestoreGState(ctx);
}
`;
}

function channel(n) {
  return Math.max(0, Math.min(255, Math.round(n * 255)))
    .toString(16)
    .padStart(2, "0");
}

function cssColor(r, g, b) {
  if (r < 0) return "#000000";
  return `#${channel(r)}${channel(g)}${channel(b)}`;
}

export function opsToSvg(ops) {
  const parts = [];
  let d = "";
  const flush = (paint) => {
    if (!d) return;
    parts.push(`<path d="${d.trim()}" ${paint}/>`);
    d = "";
  };
  let i = 0;
  const clipStack = [];
  while (i < ops.length) {
    const op = ops[i++];
    if (op === 1) d += `M${ops[i++]} ${ops[i++]}`;
    else if (op === 2) d += `L${ops[i++]} ${ops[i++]}`;
    else if (op === 3) {
      d += `C${ops[i++]} ${ops[i++]} ${ops[i++]} ${ops[i++]} ${ops[i++]} ${ops[i++]}`;
    } else if (op === 4) d += "Z";
    else if (op === 10) {
      const r = ops[i++];
      const g = ops[i++];
      const b = ops[i++];
      const _alpha = ops[i++];
      const even = ops[i++];
      const fill = cssColor(r, g, b);
      flush(`fill="${fill}" fill-rule="${even ? "evenodd" : "nonzero"}" stroke="none"`);
    } else if (op === 11) {
      const r = ops[i++];
      const g = ops[i++];
      const b = ops[i++];
      const _alpha = ops[i++];
      const width = ops[i++];
      const cap = ["butt", "round", "square"][ops[i++]] ?? "butt";
      const join = ["miter", "round", "bevel"][ops[i++]] ?? "miter";
      const stroke = cssColor(r, g, b);
      flush(
        `fill="none" stroke="${stroke}" stroke-width="${width}" stroke-linecap="${cap}" stroke-linejoin="${join}"`,
      );
    } else if (op === 12 || op === 15) {
      const even = ops[i++];
      const id = `c${clipStack.length}`;
      if (op === 15) {
        const width = ops[i++];
        const cap = ["butt", "round", "square"][ops[i++]] ?? "butt";
        const join = ["miter", "round", "bevel"][ops[i++]] ?? "miter";
        parts.push(
          `<mask id="${id}"><path d="${d.trim()}" fill="#fff" stroke="#fff" stroke-width="${width}" stroke-linecap="${cap}" stroke-linejoin="${join}"/></mask>`,
        );
        parts.push(`<g mask="url(#${id})">`);
      } else {
        parts.push(
          `<clipPath id="${id}"><path d="${d.trim()}" clip-rule="${even ? "evenodd" : "nonzero"}"/></clipPath>`,
        );
        parts.push(`<g clip-path="url(#${id})">`);
      }
      clipStack.push(id);
      d = "";
    } else if (op === 13) {
      // save is paired with the clip that follows
    } else if (op === 14) {
      parts.push(`</g>`);
      clipStack.pop();
    }
  }
  return `<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 16 16">${parts.join("")}</svg>`;
}

export async function compareFenceIcons(Resvg) {
  const rows = [];
  for (const icon of fenceIconCatalog()) {
    const original = new Resvg(icon.svg, { fitTo: { mode: "width", value: 64 } }).render();
    const rebuilt = opsToSvg(icon.ops);
    const next = new Resvg(rebuilt, { fitTo: { mode: "width", value: 64 } }).render();
    const a = original.pixels;
    const b = next.pixels;
    const width = Math.min(original.width, next.width);
    const height = Math.min(original.height, next.height);
    let diff = 0;
    let seen = 0;
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        const ia = (y * original.width + x) * 4;
        const ib = (y * next.width + x) * 4;
        const delta =
          Math.abs(a[ia] - b[ib]) +
          Math.abs(a[ia + 1] - b[ib + 1]) +
          Math.abs(a[ia + 2] - b[ib + 2]) +
          Math.abs(a[ia + 3] - b[ib + 3]);
        if (a[ia + 3] > 8 || b[ib + 3] > 8) seen++;
        if (delta > 40) diff++;
      }
    }
    rows.push({ key: icon.key, diff, seen, ratio: seen ? diff / seen : 0, ops: icon.ops.length });
  }
  return rows;
}

const isMain = process.argv[1] && process.argv[1].endsWith("fence-icons.mjs");
if (isMain && process.argv.includes("--compare")) {
  const { Resvg } = await import("/tmp/resvg-tool/node_modules/@resvg/resvg-js/index.js");
  const rows = await compareFenceIcons(Resvg);
  for (const row of rows) {
    console.log(
      `${row.key}\tdiff=${row.diff}\tseen=${row.seen}\tratio=${row.ratio.toFixed(4)}\tops=${row.ops}`,
    );
  }
  const worst = rows.reduce((a, b) => (a.ratio > b.ratio ? a : b));
  // Java's steam is a masked circle. The cubic arc plus the mask stroke leaves a
  // subpixel fringe at 64px (about 9% of that icon's ink). The other glyphs match.
  if (worst.ratio > 0.12) {
    console.error(`worst ${worst.key} ratio ${worst.ratio}`);
    process.exit(1);
  }
} else if (isMain) {
  process.stdout.write(emitFenceIconSource());
}
