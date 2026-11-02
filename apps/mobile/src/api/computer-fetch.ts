import { createGatewayFetch, type ClientSessionResponse } from "@atmos/relay-client";

/** Gateway `fetch` that seals HTTP bodies when the client session advertised E2EE. */
export function computerFetch(
  session: Pick<ClientSessionResponse, "e2ee"> | null | undefined,
  input: RequestInfo | URL,
  init?: RequestInit,
): Promise<Response> {
  if (session?.e2ee?.enabled && session.e2ee.static_pk) {
    return createGatewayFetch({ staticPk: session.e2ee.static_pk })(input, init);
  }
  return fetch(input, init);
}
