export type DesktopInvokeArgs = Record<string, unknown>;

export type DesktopCommandHandler = (
  args: DesktopInvokeArgs,
) => Promise<unknown> | unknown;

export type PreviewBounds = {
  x: number;
  y: number;
  width: number;
  height: number;
  zoom?: number;
};

export type ApiConfig = {
  host: string;
  port: number;
  token?: string;
};
