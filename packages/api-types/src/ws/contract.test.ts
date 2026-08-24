import { describe, expect, test } from "bun:test";
import { WS_ACTIONS, type WsAction } from "./actions";
import type { WsContract } from "./contract";
import { WS_EVENTS, type WsEvent } from "./events";
import type { WsEventContract } from "./event-contract";

type MissingFromContract = Exclude<WsAction, keyof WsContract>;
type ExtraInContract = Exclude<keyof WsContract, WsAction>;
type MissingEvents = Exclude<WsEvent, keyof WsEventContract>;
type ExtraEvents = Exclude<keyof WsEventContract, WsEvent>;
type AssertNever<T extends never> = T;
type _NoMissing = AssertNever<MissingFromContract>;
type _NoExtra = AssertNever<ExtraInContract>;
type _NoMissingEvents = AssertNever<MissingEvents>;
type _NoExtraEvents = AssertNever<ExtraEvents>;

describe("@atmos/api-types WsContract", () => {
  test("every catalog action has a contract entry", () => {
    expect(WS_ACTIONS.length).toBeGreaterThan(200);
    expect(WS_EVENTS.length).toBe(30);
  });
});
