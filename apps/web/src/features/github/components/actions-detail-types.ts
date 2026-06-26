export interface ActionStep {
  name?: string;
  status?: string;
  conclusion?: string;
  number?: number;
  startedAt?: string;
  started_at?: string;
  completedAt?: string;
  completed_at?: string;
}

export interface ActionJob {
  databaseId?: number;
  id?: number;
  name?: string;
  status?: string;
  conclusion?: string;
  startedAt?: string;
  started_at?: string;
  completedAt?: string;
  completed_at?: string;
  url?: string;
  html_url?: string;
  steps?: ActionStep[];
}
