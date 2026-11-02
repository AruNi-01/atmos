import { createGatewayFetch } from "@atmos/relay-client";
import { useAtmosComputerStore } from "@/features/connection/lib/atmos-computer-store";

function requestHref(input: RequestInfo | URL): string {
  if (typeof input === "string") {
    return input;
  }
  if (input instanceof URL) {
    return input.href;
  }
  return input.url;
}

/** Gateway `fetch` that seals HTTP bodies when the session advertised E2EE. */
export function computerFetch(input: RequestInfo | URL, init?: RequestInit): Promise<Response> {
  const computer = useAtmosComputerStore.getState();
  const gateway = computer.relayGatewayHttpBase?.replace(/\/$/, "") ?? "";
  const href = requestHref(input);
  if (
    computer.connectionMode === "relay" &&
    computer.relayE2ee?.enabled &&
    computer.relayE2ee.static_pk &&
    gateway.length > 0 &&
    href.startsWith(gateway)
  ) {
    return createGatewayFetch({ staticPk: computer.relayE2ee.static_pk })(input, init);
  }
  return fetch(input, init);
}
