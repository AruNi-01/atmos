export type ChatTitleLookup = {
  gaveUp: ReadonlySet<string>;
  stalled: boolean;
  stalledIds: ReadonlySet<string>;
  fetchedKey: string;
};

export function freshChatTitleLookup(): ChatTitleLookup {
  return {
    gaveUp: new Set(),
    stalled: false,
    stalledIds: new Set(),
    fetchedKey: "",
  };
}

export function missingChatTitleKey(
  chatIds: readonly string[],
  titles: Readonly<Record<string, string>> | undefined,
  titlesReady: boolean,
  gaveUp: ReadonlySet<string>,
): string {
  if (!titlesReady || !titles) return "";
  const missing: string[] = [];
  for (const id of chatIds) {
    if (id && !(id in titles) && !gaveUp.has(id)) missing.push(id);
  }
  missing.sort();
  return missing.join("\n");
}

export function planChatTitleLookup(
  state: ChatTitleLookup,
  missingKey: string,
  liveIds: readonly string[],
): { state: ChatTitleLookup; requested: string[] | null } {
  const stalled = state.stalled && liveIds.every((id) => !id || state.stalledIds.has(id));
  const next = stalled === state.stalled ? state : { ...state, stalled };
  if (!missingKey || next.stalled || next.fetchedKey === missingKey) {
    return { state: next, requested: null };
  }
  return {
    state: { ...next, fetchedKey: missingKey },
    requested: missingKey.split("\n"),
  };
}

export function settleChatTitleLookup(
  state: ChatTitleLookup,
  requested: readonly string[],
  titles: Readonly<Record<string, string>>,
  liveIdsAtRequest: readonly string[],
): ChatTitleLookup {
  const gaveUp = new Set(state.gaveUp);
  let found = 0;
  for (const id of requested) {
    if (id in titles) found += 1;
    else gaveUp.add(id);
  }
  if (found > 0) {
    return { ...state, gaveUp, stalled: false };
  }
  return {
    ...state,
    gaveUp,
    stalled: true,
    stalledIds: new Set(liveIdsAtRequest.filter((id) => id.length > 0)),
  };
}
