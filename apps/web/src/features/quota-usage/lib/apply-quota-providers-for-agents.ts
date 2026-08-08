import { quotaUsageApi } from "@/api/ws/quota-usage-api";
import { useLayoutSettingsStore } from "@/features/settings/store/layout-settings-store";
import { usageProviderIdsForAgents } from "@/features/quota-usage/lib/agent-quota-provider-map";

/**
 * Persist AI Quota Usage switches from an explicit provider id set.
 *
 * - Listed providers → switch on + footer carousel on
 * - All other known providers → switch off + footer carousel off (backend)
 * - Footer master switch → on when at least one provider is enabled
 *
 * Prefer this after the dedicated Quota Usage onboarding step so browser
 * cookie / Keychain probes only run for providers the user opted into.
 */
export async function applyQuotaProviderVisibility(
  enabledProviderIds: Iterable<string>,
): Promise<void> {
  const enabled = new Set(
    Array.from(enabledProviderIds, (id) => id.trim()).filter(Boolean),
  );

  const providers = Array.from(enabled, (provider_id) => ({
    provider_id,
    switch_enabled: true,
    footer_carousel_show: true,
  }));

  // Backend turns unspecified known providers off for both flags.
  // When `providers` is empty, every known provider is forced off — no collect.
  await quotaUsageApi.applyProviderVisibility(providers);
  await useLayoutSettingsStore
    .getState()
    .setFooterShowUsageCarousel(enabled.size > 0);
}

/**
 * Sync AI Quota Usage provider switches to agents the user enabled.
 * Prefer {@link applyQuotaProviderVisibility} when the user picked providers
 * explicitly (onboarding Quota Usage step).
 */
export async function applyQuotaProvidersForAgents(
  selectedAgentIds: Iterable<string>,
): Promise<void> {
  await applyQuotaProviderVisibility(usageProviderIdsForAgents(selectedAgentIds));
}
