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

export type SimulatorInputOp =
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

export class CoordOutOfRangeError extends Error {
  readonly code = "coord_out_of_range";
  constructor(message = "Coordinates must be in 0–1") {
    super(message);
    this.name = "CoordOutOfRangeError";
  }
}

export function assertNormalizedCoord(x: number, y: number): void {
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

function opcodeFor(op: SimulatorInputOp["op"]): number {
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
      const _never: never = op;
      throw new Error(`unsupported input op: ${String(_never)}`);
    }
  }
}

function jsonBody(input: SimulatorInputOp): unknown {
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
    case "button": {
      if (input.button) return { button: input.button };
      return { page: input.page, usage: input.usage, phase: input.phase };
    }
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
      const _never: never = input;
      return _never;
    }
  }
}

export function encodeSimulatorInput(input: SimulatorInputOp): Uint8Array {
  if (input.op === "touch") assertNormalizedCoord(input.x, input.y);
  if (input.op === "pinch") {
    assertNormalizedCoord(input.x1, input.y1);
    assertNormalizedCoord(input.x2, input.y2);
  }
  if (input.op === "scroll") assertNormalizedCoord(input.x, input.y);

  const opcode = opcodeFor(input.op);
  const body = jsonBody(input);
  const payload =
    body === null ? new Uint8Array(0) : new TextEncoder().encode(JSON.stringify(body));
  const out = new Uint8Array(1 + payload.length);
  out[0] = opcode;
  out.set(payload, 1);
  return out;
}
