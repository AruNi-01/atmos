import type {
  HostSessionDeleteRequest,
  HostSessionDeleteResponse,
  HostSessionGetRequest,
  HostSessionGetResponse,
  HostSessionListRequest,
  HostSessionListResponse,
  HostSessionResumeChatRequest,
  HostSessionResumeChatResponse,
  HostSessionResumeTuiRequest,
  HostSessionResumeTuiResponse,
  HostSessionSetArchivedRequest,
  HostSessionSetArchivedResponse,
} from "../dto/host-session";

export type HostSessionContract = {
  host_session_list: {
    input: HostSessionListRequest;
    output: HostSessionListResponse;
  };
  host_session_get: {
    input: HostSessionGetRequest;
    output: HostSessionGetResponse;
  };
  host_session_resume_chat: {
    input: HostSessionResumeChatRequest;
    output: HostSessionResumeChatResponse;
  };
  host_session_resume_tui: {
    input: HostSessionResumeTuiRequest;
    output: HostSessionResumeTuiResponse;
  };
  host_session_set_archived: {
    input: HostSessionSetArchivedRequest;
    output: HostSessionSetArchivedResponse;
  };
  host_session_delete: {
    input: HostSessionDeleteRequest;
    output: HostSessionDeleteResponse;
  };
};
