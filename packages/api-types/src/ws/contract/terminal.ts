import type {
  RunLogResolveLatestRequest,
  RunLogResolveLatestResponse,
  RunLogStartRequest,
  RunLogStartResponse,
  TerminalSideChatCloseRequest,
  TerminalSideChatCloseResponse,
  TerminalSideChatListRequest,
  TerminalSideChatListResponse,
  TerminalSideChatRecord,
  TerminalSideChatStatusRequest,
  TerminalSideChatUpsertRequest,
  TerminalSideContextCaptureRequest,
  TerminalSideContextCaptureResponse,
  TerminalWorkspaceCandidatesRequest,
  TerminalWorkspaceCandidatesResponse,
} from "../dto/terminal";

export type TerminalContract = {
  terminal_workspace_candidates: {
    input: TerminalWorkspaceCandidatesRequest;
    output: TerminalWorkspaceCandidatesResponse;
  };
  run_log_start: { input: RunLogStartRequest; output: RunLogStartResponse };
  run_log_resolve_latest: {
    input: RunLogResolveLatestRequest;
    output: RunLogResolveLatestResponse;
  };
  terminal_side_context_capture: {
    input: TerminalSideContextCaptureRequest;
    output: TerminalSideContextCaptureResponse;
  };
  terminal_side_chat_list: {
    input: TerminalSideChatListRequest;
    output: TerminalSideChatListResponse;
  };
  terminal_side_chat_upsert: {
    input: TerminalSideChatUpsertRequest;
    output: TerminalSideChatRecord;
  };
  terminal_side_chat_status_update: {
    input: TerminalSideChatStatusRequest;
    output: TerminalSideChatRecord;
  };
  terminal_side_chat_close: {
    input: TerminalSideChatCloseRequest;
    output: TerminalSideChatCloseResponse;
  };
};
