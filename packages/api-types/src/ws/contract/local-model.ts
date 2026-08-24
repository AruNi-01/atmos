import type { WsEmpty } from "../dto/common";
import type {
  LocalModelCustomAddRequest,
  LocalModelCustomAddResponse,
  LocalModelDeleteRequest,
  LocalModelDownloadRequest,
  LocalModelHfResolveResponse,
  LocalModelListResponse,
  LocalModelOk,
  LocalModelResolveHfUrlRequest,
  LocalModelStartRequest,
  LocalModelStatus,
} from "../dto/local-model";

export type LocalModelContract = {
  local_model_list: { input: WsEmpty; output: LocalModelListResponse };
  local_model_refresh: { input: WsEmpty; output: LocalModelListResponse };
  local_model_runtime_download: { input: WsEmpty; output: LocalModelOk };
  local_model_download: {
    input: LocalModelDownloadRequest;
    output: LocalModelOk;
  };
  local_model_start: { input: LocalModelStartRequest; output: LocalModelOk };
  local_model_stop: { input: WsEmpty; output: LocalModelOk };
  local_model_delete: { input: LocalModelDeleteRequest; output: LocalModelOk };
  local_model_delete_runtime: { input: WsEmpty; output: LocalModelOk };
  local_model_status: { input: WsEmpty; output: LocalModelStatus };
  local_model_resolve_hf_url: {
    input: LocalModelResolveHfUrlRequest;
    output: LocalModelHfResolveResponse;
  };
  local_model_custom_add: {
    input: LocalModelCustomAddRequest;
    output: LocalModelCustomAddResponse;
  };
  local_model_custom_delete: {
    input: LocalModelDeleteRequest;
    output: LocalModelOk;
  };
};
