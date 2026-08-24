import type { WsOk } from "../dto/common";
import type {
  DiskAnalyzerCancelScanRequest,
  DiskAnalyzerDeleteRequest,
  DiskAnalyzerDeleteResponse,
  DiskAnalyzerDiskInfoRequest,
  DiskAnalyzerGetSuggestionsRequest,
  DiskAnalyzerGetTreeRequest,
  DiskAnalyzerStartScanRequest,
  DiskAnalyzerStartScanResponse,
  DiskSuggestionsResponse,
  DiskTreeResponse,
  DiskVolumeInfo,
} from "../dto/disk-analyzer";

export type DiskAnalyzerContract = {
  disk_analyzer_start_scan: {
    input: DiskAnalyzerStartScanRequest;
    output: DiskAnalyzerStartScanResponse;
  };
  disk_analyzer_cancel_scan: {
    input: DiskAnalyzerCancelScanRequest;
    output: WsOk;
  };
  disk_analyzer_get_tree: {
    input: DiskAnalyzerGetTreeRequest;
    output: DiskTreeResponse;
  };
  disk_analyzer_get_suggestions: {
    input: DiskAnalyzerGetSuggestionsRequest;
    output: DiskSuggestionsResponse;
  };
  disk_analyzer_delete: {
    input: DiskAnalyzerDeleteRequest;
    output: DiskAnalyzerDeleteResponse;
  };
  disk_analyzer_disk_info: {
    input: DiskAnalyzerDiskInfoRequest;
    output: DiskVolumeInfo;
  };
};
