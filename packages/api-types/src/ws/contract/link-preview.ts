import type { LinkPreviewPayload, LinkPreviewRequest } from "../dto/link-preview";

export type LinkPreviewContract = {
  link_preview: {
    input: LinkPreviewRequest;
    output: LinkPreviewPayload;
  };
};
