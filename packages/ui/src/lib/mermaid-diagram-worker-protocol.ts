export type MermaidWorkerRequest = {
  id: number;
  code: string;
  theme: "light" | "dark";
};

export type MermaidWorkerResponse = {
  id: number;
  svg?: string;
  error?: string;
};
