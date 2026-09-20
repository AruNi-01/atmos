export type LinkPreviewRequest = {
  url: string;
};

export type LinkPreviewPayload = {
  url: string;
  title?: string | null;
  description?: string | null;
  image_url?: string | null;
  favicon_url?: string | null;
  site_name?: string | null;
};
