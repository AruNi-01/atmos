"use client";

import { wsRequest } from "@/api/ws/request";
import type {
  LocalServiceStopRequest,
  LocalServiceStopResponse,
  LocalServicesScanRequest,
  LocalServicesScanResponse,
} from "@atmos/api-types/ws/dto/local-services";

export type {
  LocalService,
  LocalServiceKind,
  LocalServiceOwner,
  LocalServiceProcessNode,
  LocalServiceStatus,
  LocalServiceStopEscalationReason,
  LocalServiceStopMode,
  LocalServiceStopRequest,
  LocalServiceStopResponse,
  LocalServicesScanRequest,
  LocalServicesScanResponse,
  LocalServicesScope,
  LocalServicesUnavailable,
} from "@atmos/api-types/ws/dto/local-services";

export const localServicesApi = {
  scan: async (request: LocalServicesScanRequest): Promise<LocalServicesScanResponse> => {
    return wsRequest("local_services_scan", request, 10_000);
  },
  stop: async (request: LocalServiceStopRequest): Promise<LocalServiceStopResponse> => {
    // Tree stop may wait for TERM + KILL verification (~3s+).
    const timeout = request.mode === "tree" ? 20_000 : 12_000;
    return wsRequest("local_services_stop", request, timeout);
  },
};
