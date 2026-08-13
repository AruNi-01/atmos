export const SIMULATOR_OP = {
  touch: 3,
  button: 4,
  pinch: 5,
  key: 6,
  orientation: 7,
  memoryWarning: 9,
  scroll: 11,
  softwareKeyboard: 12,
} as const;

export type SimulatorInput =
  | {
      op: "touch";
      type: "begin" | "move" | "end";
      x: number;
      y: number;
      edge?: string;
    }
  | {
      op: "button";
      button?: string;
      page?: number;
      usage?: number;
      phase?: string;
    }
  | {
      op: "pinch";
      type: string;
      x1: number;
      y1: number;
      x2: number;
      y2: number;
    }
  | { op: "key"; type: string; usage: number }
  | { op: "orientation"; orientation: string }
  | { op: "memory_warning" }
  | { op: "scroll"; dx: number; dy: number; x: number; y: number }
  | { op: "software_keyboard" };

export type SimulatorInputOp = SimulatorInput;

export class CoordOutOfRangeError extends Error {
  readonly code = "coord_out_of_range";

  constructor(message = "Coordinates must be in 0–1") {
    super(message);
    this.name = "CoordOutOfRangeError";
  }
}

function assertNormalizedCoord(x: number, y: number): void {
  if (
    typeof x !== "number" ||
    typeof y !== "number" ||
    !Number.isFinite(x) ||
    !Number.isFinite(y) ||
    x < 0 ||
    x > 1 ||
    y < 0 ||
    y > 1
  ) {
    throw new CoordOutOfRangeError();
  }
}

function opcodeFor(op: SimulatorInput["op"]): number {
  switch (op) {
    case "touch":
      return SIMULATOR_OP.touch;
    case "button":
      return SIMULATOR_OP.button;
    case "pinch":
      return SIMULATOR_OP.pinch;
    case "key":
      return SIMULATOR_OP.key;
    case "orientation":
      return SIMULATOR_OP.orientation;
    case "memory_warning":
      return SIMULATOR_OP.memoryWarning;
    case "scroll":
      return SIMULATOR_OP.scroll;
    case "software_keyboard":
      return SIMULATOR_OP.softwareKeyboard;
    default: {
      const neverOp: never = op;
      throw new Error(`unsupported input op: ${String(neverOp)}`);
    }
  }
}

function jsonBody(input: SimulatorInput): unknown {
  switch (input.op) {
    case "touch": {
      const body: Record<string, unknown> = {
        type: input.type,
        x: input.x,
        y: input.y,
      };
      if (input.edge) body.edge = input.edge;
      return body;
    }
    case "button":
      return input.button
        ? { button: input.button }
        : { page: input.page, usage: input.usage, phase: input.phase };
    case "pinch":
      return {
        type: input.type,
        x1: input.x1,
        y1: input.y1,
        x2: input.x2,
        y2: input.y2,
      };
    case "key":
      return { type: input.type, usage: input.usage };
    case "orientation":
      return { orientation: input.orientation };
    case "memory_warning":
    case "software_keyboard":
      return null;
    case "scroll":
      return { dx: input.dx, dy: input.dy, x: input.x, y: input.y };
    default: {
      const neverInput: never = input;
      return neverInput;
    }
  }
}

export function encodeSimulatorInput(input: SimulatorInput): Uint8Array {
  if (input.op === "touch") assertNormalizedCoord(input.x, input.y);
  if (input.op === "pinch") {
    assertNormalizedCoord(input.x1, input.y1);
    assertNormalizedCoord(input.x2, input.y2);
  }
  if (input.op === "scroll") assertNormalizedCoord(input.x, input.y);

  const body = jsonBody(input);
  const payload =
    body === null ? new Uint8Array(0) : new TextEncoder().encode(JSON.stringify(body));
  const output = new Uint8Array(payload.length + 1);
  output[0] = opcodeFor(input.op);
  output.set(payload, 1);
  return output;
}

export function streamMjpegUrl(streamBaseUrl: string): string {
  return `${streamBaseUrl}/stream.mjpeg`;
}

export function streamAvccUrl(streamBaseUrl: string): string {
  return `${streamBaseUrl}/stream.avcc`;
}

export function streamWsUrl(streamBaseUrl: string): string {
  const protocolUrl = streamBaseUrl.replace(/^http:/, "ws:").replace(/^https:/, "wss:");
  return `${protocolUrl.replace(/\/$/, "")}/ws`;
}

export function normalizePointer(
  clientX: number,
  clientY: number,
  rect: DOMRect,
): { x: number; y: number } {
  const x = (clientX - rect.left) / rect.width;
  const y = (clientY - rect.top) / rect.height;
  assertNormalizedCoord(x, y);
  return { x, y };
}

export function resolveTouchEndPoint(
  current: { x: number; y: number } | null,
  last: { x: number; y: number } | null,
): { x: number; y: number } | null {
  return current ?? last;
}

export function parseConfigFrame(
  data: unknown,
): { width?: number; height?: number; orientation?: string } | null {
  let value = data;
  if (typeof value === "string") {
    try {
      value = JSON.parse(value) as unknown;
    } catch {
      return null;
    }
  }
  if (!value || typeof value !== "object") return null;

  const source =
    "config" in value && value.config && typeof value.config === "object"
      ? value.config
      : value;
  if (!source || typeof source !== "object") return null;

  const row = source as Record<string, unknown>;
  const result: { width?: number; height?: number; orientation?: string } = {};
  if (typeof row.width === "number" && Number.isFinite(row.width)) {
    result.width = row.width;
  }
  if (typeof row.height === "number" && Number.isFinite(row.height)) {
    result.height = row.height;
  }
  if (typeof row.orientation === "string") result.orientation = row.orientation;
  return Object.keys(result).length > 0 ? result : null;
}
