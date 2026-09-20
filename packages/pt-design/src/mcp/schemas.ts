import { z } from "zod";
import type { ToolName } from "../agent/tool-defs";

export const responseFormatSchema = z
  .enum(["json", "markdown"])
  .default("json")
  .describe("json for agents; markdown for a compact human summary");

export const PT_TOOL_SCHEMAS = {
  pt_tools_list: z.object({ response_format: responseFormatSchema }).strict(),
  pt_catalog_list: z.object({ response_format: responseFormatSchema }).strict(),
  pt_ptx_get: z.object({ response_format: responseFormatSchema }).strict(),
  pt_ptx_apply: z
    .object({
      ptx: z.string().min(1).describe("Complete PTX source (a <page> document)"),
    })
    .strict(),
  pt_screenshot: z
    .object({
      nodeIds: z.array(z.string()).optional(),
      maxEdge: z.coerce.number().int().min(256).max(2048).optional(),
    })
    .strict(),
  pt_doc_init: z
    .object({
      path: z.string().min(1).describe("Path to a .ptd directory or document.ptx"),
    })
    .strict(),
  pt_doc_open: z
    .object({
      path: z.string().min(1).describe("Path to a .ptd directory or document.ptx"),
      create: z.boolean().default(false),
    })
    .strict(),
  pt_doc_save: z
    .object({
      path: z.string().optional().describe("Path to a .ptd directory or document.ptx"),
    })
    .strict(),
} satisfies Record<ToolName, z.ZodType>;

export type ToolArgs<K extends ToolName> = z.infer<(typeof PT_TOOL_SCHEMAS)[K]>;
