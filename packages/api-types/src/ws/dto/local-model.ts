export type LocalModelStatus =
  | { status: "not_installed" }
  | {
      status: "downloading_runtime";
      progress: number;
      eta_seconds?: number | null;
    }
  | {
      status: "downloading_model";
      model_id: string;
      progress: number;
      eta_seconds?: number | null;
    }
  | { status: "installed_not_running"; model_id: string }
  | { status: "starting"; model_id: string; stage?: string | null }
  | { status: "running"; endpoint: string; model_id: string }
  | { status: "failed"; error: string };

export type LocalModelRuntimeInfo = {
  installed: boolean;
};

export type LocalModelEntry = {
  id: string;
  display_name: string;
  description: string;
  size_bytes: number;
  ram_footprint_mb: number;
  license: string;
  license_url: string;
  sha256: string;
  tags: string[];
  recommended: boolean;
  installed: boolean;
  custom?: boolean;
  source_url?: string | null;
};

export type LocalModelListResponse = {
  runtime: LocalModelRuntimeInfo;
  models: LocalModelEntry[];
  state: LocalModelStatus;
};

export type LocalModelDownloadRequest = {
  model_id: string;
};

export type LocalModelStartRequest = {
  model_id: string;
};

export type LocalModelDeleteRequest = {
  model_id: string;
};

export type LocalModelResolveHfUrlRequest = {
  url: string;
};

export type LocalModelHfChoice = {
  repo_id: string;
  filename: string;
  url: string;
  size_bytes?: number | null;
  ram_footprint_mb?: number | null;
  discovered?: boolean;
};

export type LocalModelHfResolveResponse =
  | { kind: "model"; model: LocalModelEntry }
  | { kind: "choices"; choices: LocalModelHfChoice[] };

export type LocalModelCustomAddRequest = {
  url: string;
  display_name?: string | null;
  ram_footprint_mb?: number | null;
};

export type LocalModelCustomAddResponse = {
  ok: boolean;
  model: LocalModelEntry;
};

export type LocalModelOk = {
  ok: boolean;
};
