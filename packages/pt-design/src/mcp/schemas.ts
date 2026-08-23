import { z } from "zod";
import type { ToolName } from "../agent/tool-defs";

export const responseFormatSchema = z
  .enum(["json", "markdown"])
  .default("json")
  .describe("json for agents; markdown for a compact human summary");

const coord = z.coerce.number().finite().describe("Scene coordinate or size in px");

export const pointSchema = z
  .object({
    x: coord.describe("X"),
    y: coord.describe("Y"),
  })
  .strict();

export const propsSchema = z
  .record(z.string(), z.union([z.string(), z.number(), z.boolean(), z.null()]))
  .describe("Component props (label, title, placeholder, checked, …)");

const pagination = {
  limit: z.number().int().min(1).max(200).default(100).describe("Page size (1–200)"),
  offset: z.number().int().min(0).default(0).describe("Items to skip"),
};

const instanceRef = z.union([
  z.string().min(1),
  z
    .object({
      instanceId: z.string().min(1),
      gap: z.coerce.number().finite().optional(),
    })
    .strict(),
]);

export const PT_TOOL_SCHEMAS = {
  pt_tools_list: z.object({ response_format: responseFormatSchema }).strict(),
  pt_catalog_list: z
    .object({
      ...pagination,
      kind: z.enum(["basic", "block"]).optional(),
      response_format: responseFormatSchema,
    })
    .strict(),
  pt_ir_get: z
    .object({
      frameId: z.string().optional().describe("Frame id or unique name"),
      frame: z.string().optional().describe("Alias of frameId"),
      instanceIds: z.array(z.string()).optional().describe("Limit IR to these instances"),
      response_format: responseFormatSchema,
    })
    .strict(),
  pt_scene_get: z.object({ response_format: responseFormatSchema }).strict(),
  pt_place: z
    .object({
      componentType: z.string().min(1).optional().describe("Catalog id, e.g. button"),
      type: z.string().min(1).optional().describe("Alias of componentType"),
      at: pointSchema.optional().describe("Origin. Relative to the frame when frameId is set"),
      x: coord.optional(),
      y: coord.optional(),
      below: instanceRef.optional().describe("Place under this instance"),
      rightOf: instanceRef.optional().describe("Place to the right of this instance"),
      props: propsSchema.optional(),
      variant: z.string().optional(),
      size: z.string().optional().describe("sm | default | lg | xl"),
      frameId: z.string().optional(),
      frame: z.string().optional().describe("Alias of frameId"),
      mode: z.enum(["single", "showcase"]).optional().describe("single (default) or dump every variant"),
    })
    .strict()
    .refine((value) => Boolean(value.componentType || value.type), {
      message: "componentType is required",
    }),
  pt_update: z
    .object({
      instanceId: z.string().min(1).describe("Instance id from pt_ir_get"),
      props: propsSchema.optional(),
      variant: z.string().optional(),
      size: z.string().optional(),
      bbox: z
        .object({
          x: coord.optional(),
          y: coord.optional(),
          w: coord.optional(),
          h: coord.optional(),
        })
        .strict()
        .optional()
        .describe("Scene coordinates from pt_ir_get"),
      frameId: z.string().optional().describe("Reparent onto this frame"),
      frame: z.string().optional(),
    })
    .strict(),
  pt_delete: z
    .object({
      instanceId: z.string().optional(),
      instanceIds: z.array(z.string()).optional(),
    })
    .strict()
    .refine((value) => Boolean(value.instanceId || value.instanceIds?.length), {
      message: "instanceId or instanceIds is required",
    }),
  pt_frame_create: z
    .object({
      name: z.string().optional(),
      x: coord.default(0),
      y: coord.default(0),
      w: coord.optional(),
      h: coord.optional(),
      preset: z.enum(["desktop", "tablet", "mobile"]).optional(),
    })
    .strict(),
  pt_frame_rename: z
    .object({
      frameId: z.string().optional(),
      frame: z.string().optional(),
      name: z.string().min(1),
    })
    .strict()
    .refine((value) => Boolean(value.frameId || value.frame), {
      message: "frameId is required",
    }),
  pt_frame_update: z
    .object({
      frameId: z.string().optional(),
      frame: z.string().optional(),
      name: z.string().optional(),
      x: coord.optional(),
      y: coord.optional(),
      w: coord.optional(),
      h: coord.optional(),
    })
    .strict()
    .refine((value) => Boolean(value.frameId || value.frame), {
      message: "frameId is required",
    }),
  pt_frame_delete: z
    .object({
      frameId: z.string().optional(),
      frame: z.string().optional(),
      orphan: z.boolean().optional(),
    })
    .strict()
    .refine((value) => Boolean(value.frameId || value.frame), {
      message: "frameId is required",
    }),
  pt_frames_list: z
    .object({
      ...pagination,
      response_format: responseFormatSchema,
    })
    .strict(),
  pt_layout_row: z
    .object({
      instanceIds: z.array(z.string()).optional(),
      instanceId: z.string().optional(),
      gap: coord.optional(),
      align: z.enum(["start", "center", "end"]).optional(),
    })
    .strict(),
  pt_layout_column: z
    .object({
      instanceIds: z.array(z.string()).optional(),
      instanceId: z.string().optional(),
      gap: coord.optional(),
      align: z.enum(["start", "center", "end"]).optional(),
    })
    .strict(),
  pt_layout_grid: z
    .object({
      instanceIds: z.array(z.string()).optional(),
      instanceId: z.string().optional(),
      columns: z.coerce.number().int().min(1),
      gap: coord.optional(),
      rowGap: coord.optional(),
    })
    .strict(),
  pt_lint: z
    .object({
      frameId: z.string().optional(),
      frame: z.string().optional(),
      response_format: responseFormatSchema,
    })
    .strict(),
  pt_screenshot: z
    .object({
      frameId: z.string().optional(),
      frame: z.string().optional(),
      instanceIds: z.array(z.string()).optional(),
      maxEdge: z.coerce.number().int().min(256).max(2048).optional(),
    })
    .strict(),
  pt_batch: z
    .object({
      atomic: z.boolean().optional(),
      ops: z
        .array(
          z
            .object({
              tool: z.string().min(1),
              args: z.record(z.string(), z.unknown()).optional(),
            })
            .strict(),
        )
        .min(1)
        .max(200),
    })
    .strict(),
  pt_apply_ir: z
    .object({
      ir: z
        .looseObject({
          version: z.string(),
          frames: z.array(z.unknown()),
          freeNodes: z.array(z.unknown()),
        })
        .describe("Full Design IR (pt-design-ir/1)"),
      mode: z.enum(["merge", "replace"]).default("merge"),
      dryRun: z.boolean().default(false),
    })
    .strict(),
  pt_export: z.object({ response_format: responseFormatSchema }).strict(),
  pt_handoff: z
    .object({
      scope: z.enum(["selection", "frame", "document"]).default("document"),
      frameId: z.string().optional(),
      frame: z.string().optional(),
      instanceIds: z.array(z.string()).optional(),
      prompt: z.string().optional(),
      includeImage: z.boolean().default(false),
      out: z.string().optional().describe("Optional path to write the JSON payload"),
      response_format: responseFormatSchema,
    })
    .strict(),
  pt_doc_init: z
    .object({
      file: z.string().optional().describe("Path to create, e.g. ./app.ptdesign.json"),
    })
    .strict(),
  pt_doc_open: z
    .object({
      file: z.string().optional(),
      create: z.boolean().default(false),
    })
    .strict(),
  pt_doc_save: z
    .object({
      file: z.string().optional(),
    })
    .strict(),
} satisfies Record<ToolName, z.ZodType>;

export type ToolArgs<K extends ToolName> = z.infer<(typeof PT_TOOL_SCHEMAS)[K]>;
