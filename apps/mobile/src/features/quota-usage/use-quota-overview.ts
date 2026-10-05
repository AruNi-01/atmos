import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { QuotaOverviewResponse } from "@atmos/api-types/ws/dto/quota";
import { wsActions } from "@/api/ws-actions";
import {
  adoptSavedAutoRefresh,
  noteSavedAutoRefresh,
  savedAutoRefreshMinutes,
  seedSavedAutoRefresh,
  type SavedAutoRefresh,
} from "@/features/quota-usage/auto-refresh-interval";
import { mergeQuotaSwitchSnapshot } from "@/features/quota-usage/quota-switch-snapshot";
import { useMobileWs } from "@/providers/MobileWsProvider";
import { useSessionStore } from "@/stores/session-store";

// The quota page stays mounted under the settings sheet, and both call this hook.
// Generations have to be shared or a refresh on the page can overwrite a switch
// flipped in the sheet.
const switchGeneration = new Map<string, number>();
let nextSwitchGeneration = 0;
let autoRefreshGeneration = 0;
let autoRefreshInFlight = 0;
let savedAutoRefresh: SavedAutoRefresh | null = null;

function actionMessage(error: unknown): string {
  const message = error instanceof Error ? error.message : "Failed to update";
  if (message.startsWith("WebSocket request timeout")) return "Request timed out";
  return message;
}

export function useQuotaOverview(options?: { fetch?: boolean }) {
  const fetch = options?.fetch !== false;
  const queryClient = useQueryClient();
  const { client, state } = useMobileWs();
  const selectedServerId = useSessionStore((store) => store.selectedServerId);
  const wsUrl = useSessionStore((store) => store.activeClientSession?.ws_url ?? null);
  // The interval is stored on the Computer. A new session URL for the same Computer must keep it.
  const computerKey = selectedServerId ?? wsUrl;
  const connected = state === "open" && client != null;
  const queryKey = ["quota-overview", wsUrl] as const;
  const [actionError, setActionError] = useState<string | null>(null);

  const overviewQuery = useQuery({
    queryKey,
    // The settings sheet only reads the page cache. A second fetch on open would
    // skip the switch generation guard and replace an in-flight toggle.
    enabled: fetch && connected,
    queryFn: () => {
      if (!client) throw new Error("Atmos mobile WebSocket is not connected");
      return wsActions.quotaOverview(client, { refresh: false, provider_id: null });
    },
  });

  const write = (overview: QuotaOverviewResponse) => {
    setActionError(null);
    queryClient.setQueryData(queryKey, overview);
  };
  const bumpSwitches = (ids: readonly string[]) => {
    const generation = nextSwitchGeneration + 1;
    nextSwitchGeneration = generation;
    for (const id of ids) switchGeneration.set(id, generation);
    return generation;
  };
  const applyOverview = (
    overview: QuotaOverviewResponse,
    acceptIncoming: (providerId: string) => boolean,
    acceptAutoRefresh: boolean,
  ) => {
    const current = queryClient.getQueryData<QuotaOverviewResponse>(queryKey);
    write({
      ...overview,
      auto_refresh: !current || acceptAutoRefresh ? overview.auto_refresh : current.auto_refresh,
      providers: mergeQuotaSwitchSnapshot(current?.providers, overview.providers, acceptIncoming),
    });
  };
  const refreshStillCurrent = (started: ReadonlyMap<string, number>) => (providerId: string) =>
    switchGeneration.get(providerId) === started.get(providerId);
  const intervalStillCurrent = (seen: number | undefined) => seen === autoRefreshGeneration;

  const refresh = useMutation({
    mutationFn: () => wsActions.quotaOverview(client!, { refresh: true, provider_id: null }),
    onMutate: () => ({
      autoRefreshGeneration,
      started: new Map(switchGeneration),
    }),
    onSuccess: (overview, _value, context) =>
      applyOverview(
        overview,
        refreshStillCurrent(context?.started ?? new Map()),
        intervalStillCurrent(context?.autoRefreshGeneration),
      ),
  });
  const toggleOne = useMutation({
    mutationFn: (input: { enabled: boolean; providerId: string }) =>
      wsActions.quotaSetProviderSwitch(client!, input.providerId, input.enabled),
    onMutate: (input) => {
      const generation = bumpSwitches([input.providerId]);
      const previous = queryClient.getQueryData<QuotaOverviewResponse>(queryKey);
      const previousEnabled = previous?.providers.find((provider) => provider.id === input.providerId)?.switch_enabled;
      if (previous) {
        queryClient.setQueryData<QuotaOverviewResponse>(queryKey, {
          ...previous,
          providers: previous.providers.map((provider) =>
            provider.id === input.providerId ? { ...provider, switch_enabled: input.enabled } : provider,
          ),
        });
      }
      setActionError(null);
      return { autoRefreshGeneration, generation, previousEnabled };
    },
    onSuccess: (overview, input, context) =>
      applyOverview(
        overview,
        (providerId) => providerId === input.providerId && switchGeneration.get(providerId) === context?.generation,
        intervalStillCurrent(context?.autoRefreshGeneration),
      ),
    onError: (error: unknown, input, context) => {
      if (!context || switchGeneration.get(input.providerId) !== context.generation) return;
      if (context.previousEnabled !== undefined) {
        queryClient.setQueryData<QuotaOverviewResponse>(queryKey, (current) => {
          if (!current) return current;
          return {
            ...current,
            providers: current.providers.map((provider) =>
              provider.id === input.providerId
                ? { ...provider, switch_enabled: context.previousEnabled as boolean }
                : provider,
            ),
          };
        });
      }
      setActionError(actionMessage(error));
    },
  });
  const toggleAll = useMutation({
    mutationFn: (enabled: boolean) => wsActions.quotaSetAllProvidersSwitch(client!, enabled),
    onMutate: (enabled) => {
      const previous = queryClient.getQueryData<QuotaOverviewResponse>(queryKey);
      const ids = (previous?.providers ?? []).map((provider) => provider.id);
      const generation = bumpSwitches(ids);
      const previousEnabled = new Map((previous?.providers ?? []).map((provider) => [provider.id, provider.switch_enabled]));
      if (previous) {
        queryClient.setQueryData<QuotaOverviewResponse>(queryKey, {
          ...previous,
          providers: previous.providers.map((provider) => ({ ...provider, switch_enabled: enabled })),
        });
      }
      setActionError(null);
      return { autoRefreshGeneration, generation, ids, previousEnabled };
    },
    onSuccess: (overview, _enabled, context) => {
      const ids = new Set(context?.ids ?? []);
      applyOverview(
        overview,
        (providerId) => ids.has(providerId) && switchGeneration.get(providerId) === context?.generation,
        intervalStillCurrent(context?.autoRefreshGeneration),
      );
    },
    onError: (error: unknown, _enabled, context) => {
      if (!context) return;
      queryClient.setQueryData<QuotaOverviewResponse>(queryKey, (current) => {
        if (!current) return current;
        return {
          ...current,
          providers: current.providers.map((provider) => {
            if (switchGeneration.get(provider.id) !== context.generation) return provider;
            const enabled = context.previousEnabled.get(provider.id);
            return enabled === undefined ? provider : { ...provider, switch_enabled: enabled };
          }),
        };
      });
      setActionError(actionMessage(error));
    },
  });
  const autoRefresh = useMutation({
    mutationFn: (minutes: number | null) => wsActions.quotaSetAutoRefresh(client!, minutes),
    onMutate: (minutes) => {
      autoRefreshInFlight += 1;
      const generation = autoRefreshGeneration + 1;
      autoRefreshGeneration = generation;
      const requestComputerKey = computerKey;
      const requestWsUrl = wsUrl;
      const previous = queryClient.getQueryData<QuotaOverviewResponse>(queryKey);
      // Seed from this Computer's cache before the optimistic write, then keep that
      // saved value across a second selection. Another Computer's interval is not a
      // baseline here, and a missing overview is not Off.
      savedAutoRefresh = seedSavedAutoRefresh(
        savedAutoRefresh,
        requestComputerKey,
        previous ? { minutes: previous.auto_refresh.interval_minutes ?? null } : null,
      );
      if (previous) {
        queryClient.setQueryData<QuotaOverviewResponse>(queryKey, {
          ...previous,
          auto_refresh: { interval_minutes: minutes },
        });
      }
      setActionError(null);
      return {
        generation,
        computerKey: requestComputerKey,
        wsUrl: requestWsUrl,
        started: new Map(switchGeneration),
      };
    },
    onSuccess: (overview, _minutes, context) => {
      if (!context || context.computerKey !== computerKey || context.wsUrl !== wsUrl) return;
      const minutes = overview.auto_refresh.interval_minutes ?? null;
      const saved =
        savedAutoRefresh?.computerKey === computerKey
          ? savedAutoRefresh
          : { computerKey, minutes, appliedGeneration: 0 };
      savedAutoRefresh = noteSavedAutoRefresh(saved, context.generation, minutes);
      if (context.generation !== autoRefreshGeneration) return;
      applyOverview(overview, refreshStillCurrent(context.started), true);
    },
    onError: (error: unknown, _minutes, context) => {
      if (!context || context.generation !== autoRefreshGeneration) return;
      if (context.computerKey !== computerKey || context.wsUrl !== wsUrl) return;
      const rollbackMinutes = savedAutoRefreshMinutes(savedAutoRefresh, computerKey);
      if (rollbackMinutes !== undefined) {
        queryClient.setQueryData<QuotaOverviewResponse>(queryKey, (current) =>
          current ? { ...current, auto_refresh: { interval_minutes: rollbackMinutes } } : current,
        );
      }
      setActionError(actionMessage(error));
    },
    onSettled: () => {
      autoRefreshInFlight = Math.max(0, autoRefreshInFlight - 1);
    },
  });

  // Idle overview data is this Computer's stored interval. A change in flight keeps
  // the baseline already recorded for this Computer so the optimistic value is not saved.
  useEffect(() => {
    const overview = overviewQuery.data;
    savedAutoRefresh = adoptSavedAutoRefresh(
      savedAutoRefresh,
      computerKey,
      overviewQuery.isSuccess && overview != null,
      overview?.auto_refresh.interval_minutes ?? null,
      autoRefreshInFlight > 0,
    );
  }, [computerKey, overviewQuery.data, overviewQuery.isSuccess]);

  const overview = overviewQuery.data ?? null;
  const providers = [...(overview?.providers ?? [])].sort((left, right) => left.label.localeCompare(right.label));

  return {
    actionError,
    autoRefresh,
    connected,
    overview,
    overviewQuery,
    providers,
    refresh,
    toggleAll,
    toggleOne,
  };
}
