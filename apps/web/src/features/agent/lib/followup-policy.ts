export type FollowupPolicy = "queue" | "steer";
export type BusyComposerAction = "queue" | "steer" | "stop";

export function resolveFollowupPolicy(value: string | null | undefined): FollowupPolicy {
  return value === "steer" ? "steer" : "queue";
}

export function busyEnterAction(policy: FollowupPolicy): Exclude<BusyComposerAction, "stop"> {
  return policy;
}

export function oneShotAction(policy: FollowupPolicy): Exclude<BusyComposerAction, "stop"> {
  return policy === "queue" ? "steer" : "queue";
}

export function routeBusySubmit(input: {
  policy: FollowupPolicy;
  oneShot?: Exclude<BusyComposerAction, "stop"> | null;
}): Exclude<BusyComposerAction, "stop"> {
  return input.oneShot ?? busyEnterAction(input.policy);
}
