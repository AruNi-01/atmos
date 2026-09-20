import { wsRequest } from "@/api/ws/request";
import type {
  HostSessionGetResponse,
  HostSessionListItem,
  HostSessionListRequest,
  HostSessionListResponse,
  HostSessionResumeChatResponse,
  HostSessionResumeSupport,
  HostSessionResumeTuiResponse,
  HostSessionSearchHit,
  HostSessionSearchProgress,
  HostSessionSearchStatus,
  HostSessionTag,
} from "@atmos/api-types/ws/dto/host-session";

export type {
  HostSessionGetResponse,
  HostSessionListItem,
  HostSessionListRequest,
  HostSessionListResponse,
  HostSessionResumeChatResponse,
  HostSessionResumeSupport,
  HostSessionResumeTuiResponse,
  HostSessionSearchHit,
  HostSessionSearchProgress,
  HostSessionSearchStatus,
  HostSessionTag,
};

export const hostSessionApi = {
  list: (input: HostSessionListRequest = {}) =>
    wsRequest("host_session_list", {
      provider_id: input.provider_id ?? null,
      project: input.project ?? null,
      query: input.query ?? null,
      sort_field: input.sort_field ?? null,
      sort_order: input.sort_order ?? null,
      updated_after: input.updated_after ?? null,
      updated_before: input.updated_before ?? null,
      limit: input.limit ?? null,
      offset: input.offset ?? null,
      sync: input.sync ?? false,
    }),
  get: (key: string) => wsRequest("host_session_get", { key }),
  resumeChat: (key: string) => wsRequest("host_session_resume_chat", { key }),
  resumeTui: (key: string) => wsRequest("host_session_resume_tui", { key }),
};
