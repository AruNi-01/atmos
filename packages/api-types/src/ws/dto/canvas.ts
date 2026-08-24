export type AppOpenRequest = {
  app_name: string;
  path: string;
};

export type AppOpenResponse = {
  success: boolean;
  app_name: string;
  path: string;
};

export type CanvasBridgeRegisterRequest = {
  client_id: string;
  label?: string | null;
  accepts_commands?: boolean;
  capabilities?: string[];
  active_document_file_name?: string | null;
};

export type CanvasBridgeUnregisterRequest = {
  client_id: string;
};

export type CanvasAgentDispatchResultRequest = {
  request_id: string;
  success: boolean;
  error_code?: string | null;
  error_message?: string | null;
  recoverable?: boolean | null;
  data?: unknown;
};

export type CanvasBridgeRegisterResponse = {
  ok: boolean;
  client_id: string;
  conn_id: string;
};

export type CanvasBridgeUnregisterResponse = {
  ok: boolean;
  client_id: string;
};

export type CanvasAgentDispatchResultResponse = {
  ok: boolean;
  completed: boolean;
  request_id: string;
};
