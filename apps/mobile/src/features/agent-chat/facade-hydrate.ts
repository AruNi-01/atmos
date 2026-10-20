import type { AgentChatEventPump, AgentChatHydrateGeneration } from "@atmos/api-client/agent-chat";
import { shouldAbandonAgentChatHydrate } from "./hydrate-recovery";

export type FacadeHydrateSession = {
  fetchSnapshot<T>(getSnapshot: () => Promise<T>): Promise<T>;
  takeGeneration(): AgentChatHydrateGeneration;
};

/**
 * One overflow `agent_chat_resync` call owns one hydrate generation.
 * A later session's `startHydrate` must not be abandoned by an earlier
 * fetch's catch.
 */
export function createFacadeHydrateSession(
  pump: Pick<AgentChatEventPump, "startHydrate">,
  onFetchError: (generation: AgentChatHydrateGeneration) => void,
): FacadeHydrateSession {
  let generation: AgentChatHydrateGeneration | undefined;
  return {
    async fetchSnapshot(getSnapshot) {
      const token = pump.startHydrate();
      generation = token;
      try {
        return await getSnapshot();
      } catch (err) {
        generation = undefined;
        if (shouldAbandonAgentChatHydrate("error")) onFetchError(token);
        throw err;
      }
    },
    takeGeneration() {
      const token = generation ?? pump.startHydrate();
      generation = undefined;
      return token;
    },
  };
}
