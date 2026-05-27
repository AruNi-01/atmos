import type { Env } from "./index";

export interface GithubTriggerEnvelope {
  delivery_id: string;
  route_id: string;
  tenant_id: string;
  server_id: string;
  automation_guid: string;
  provider: "github";
  installation_id: number;
  repository_id?: number;
  repository_full_name: string;
  event_name: string;
  action?: string;
  sender_login?: string;
  source_url?: string;
  pull_request_number?: number;
  branch?: string;
  workflow_name?: string;
  conclusion?: string;
  untrusted_text_excerpt?: string;
  received_at: number;
}

export type ExternalDispatchResult =
  | { status: "dispatched"; dispatchedAt: number }
  | { status: "missed_offline"; errorCode: "server_offline" }
  | { status: "error"; errorCode: "dispatch_failed" };

export async function dispatchExternalEventToServer(
  env: Env,
  event: GithubTriggerEnvelope,
): Promise<ExternalDispatchResult> {
  const requestId = crypto.randomUUID();
  const envelope = {
    v: 1,
    stream: "system",
    kind: "external_event",
    from: "relay:github",
    to: "server",
    request_id: requestId,
    body: JSON.stringify(event),
  };

  const id = env.SERVER_HUB.idFromName(event.server_id);
  const stub = env.SERVER_HUB.get(id);
  const response = await stub.fetch(
    new Request("https://do.internal/external_event", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Relay-External-Event": "1",
      },
      body: JSON.stringify(envelope),
    }),
  );

  if (response.status === 503) {
    return { status: "missed_offline", errorCode: "server_offline" };
  }
  if (!response.ok) {
    return { status: "error", errorCode: "dispatch_failed" };
  }
  return { status: "dispatched", dispatchedAt: Math.floor(Date.now() / 1000) };
}
