export type AgentBridgeAddress = {
  server_id?: string;
  provider_id: string;
  chat_id?: string | null;
  workspace_id?: string | null;
};

export type AgentBridgeBusyPolicy = "wait" | "queue" | "fail_fast";

export type AgentBridgeOccupancy = "idle" | "running" | "permission_request" | "unknown";

export type AgentBridgeCatalogKind = "native" | "registry" | "custom" | "terminal" | "chat";

export type AgentBridgeCatalogEntry = {
  kind: AgentBridgeCatalogKind;
  provider_id: string;
  display_name: string;
  server_id: string;
  chat_id?: string | null;
  workspace_id?: string | null;
  occupancy: AgentBridgeOccupancy;
  enabled?: boolean | null;
};

export type AgentBridgeContextBagSlices = {
  goals?: string[];
  paths?: string[];
  refs?: string[];
  artifacts?: string[];
  danger?: string[];
};

export type AgentBridgeContextBag = AgentBridgeContextBagSlices & {
  id: string;
  server_id: string;
};

export type AgentBridgeListRequest = {
  workspace_id?: string | null;
};

export type AgentBridgeListResponse = {
  server_id: string;
  entries: AgentBridgeCatalogEntry[];
};

export type AgentBridgeSendRequest = {
  to: AgentBridgeAddress | AgentBridgeAddress[];
  from?: AgentBridgeAddress | null;
  body: string;
  busy?: AgentBridgeBusyPolicy | null;
  ttl_ms?: number | null;
  correlation_id?: string | null;
  bag?: AgentBridgeContextBagSlices | null;
};

export type AgentBridgeReplyRequest = {
  to: AgentBridgeAddress;
  from?: AgentBridgeAddress | null;
  body: string;
  correlation_id: string;
  busy?: AgentBridgeBusyPolicy | null;
  ttl_ms?: number | null;
};

export type AgentBridgeStatusRequest = {
  message_id?: string | null;
  context_ref?: string | null;
  to?: AgentBridgeAddress | null;
  workspace_id?: string | null;
};

export type AgentBridgeDeliveryStatus =
  | "accepted"
  | "queued_busy"
  | "offline"
  | "timeout"
  | "rejected"
  | "delivered";

export type AgentBridgeDeliveryAck = {
  message_id: string;
  to: AgentBridgeAddress;
  status: AgentBridgeDeliveryStatus;
  error_code?: string | null;
  detail?: string | null;
};

export type AgentBridgeMessage = {
  id: string;
  kind: "send" | "request" | "reply" | "ack";
  from: AgentBridgeAddress;
  to: AgentBridgeAddress;
  body: string;
  correlation_id?: string | null;
  context_ref?: string | null;
  busy: AgentBridgeBusyPolicy;
  ttl_ms: number;
};

export type AgentBridgeStatusResponse = {
  server_id: string;
  bag?: AgentBridgeContextBag | null;
  message?: AgentBridgeMessage | null;
  entries: AgentBridgeCatalogEntry[];
  drained: AgentBridgeDeliveryAck[];
};
