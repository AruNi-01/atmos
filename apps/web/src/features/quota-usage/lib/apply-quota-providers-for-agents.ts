import { quotaUsageApi } from "@/api/ws/quota-usage-api";
import { useLayoutSettingsStore } from "@/features/settings/store/layout-settings-store";
import { usageProviderIdsForAgents } from "@/features/quota-usage/lib/agent-quota-provider-map";

/**
 * Sync AI Quota Usage provider switches + footer carousel picks to match
 * the agents the user enabled (e.g. during first-run onboarding).
 *
 * - Mapped providers for selected agents → switch on + footer carousel on
 * - All other known providers → switch off + footer carousel off
 * - Footer layout "AI Quota Usage carousel" master switch → on
 */
export async function applyQuotaProvidersForAgents(
  selectedAgentIds: Iterable<string>,
): Promise<void> {
  const enabledProviderIds = usageProviderIdsForAgents(selectedAgentIds);

  const providers = Array.from(enabledProviderIds, (provider_id) => ({
    provider_id,
    switch_enabled: true,
    footer_carousel_show: true,
  }));

  // Backend turns unspecified known providers off for both flags.
  await quotaUsageApi.applyProviderVisibility(providers);
  await useLayoutSettingsStore.getState().setFooterShowUsageCarousel(true);
}
