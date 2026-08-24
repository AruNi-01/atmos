import type {
  LocalServicesScanRequest,
  LocalServicesScanResponse,
  LocalServiceStopRequest,
  LocalServiceStopResponse,
} from "../dto/local-services";

export type LocalServicesContract = {
  local_services_scan: {
    input: LocalServicesScanRequest;
    output: LocalServicesScanResponse;
  };
  local_services_stop: {
    input: LocalServiceStopRequest;
    output: LocalServiceStopResponse;
  };
};
