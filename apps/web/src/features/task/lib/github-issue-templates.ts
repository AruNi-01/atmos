/**
 * Parse GitHub issue templates (YAML issue forms + Markdown templates).
 * Spec: https://docs.github.com/en/communities/using-templates-to-encourage-useful-issues-and-pull-requests/syntax-for-issue-forms
 */

import { parse as parseYaml } from "yaml";
import type { GithubIssueTemplateFilePayload } from "@/api/ws/github-api";

export type IssueFormFieldType =
  | "markdown"
  | "input"
  | "textarea"
  | "dropdown"
  | "checkboxes";

export type IssueFormField = {
  type: IssueFormFieldType;
  id: string;
  label?: string;
  description?: string;
  placeholder?: string;
  value?: string; // markdown static content
  required: boolean;
  options?: string[]; // dropdown
  checkboxOptions?: Array<{ label: string; required?: boolean }>;
  multiple?: boolean; // dropdown
};

export type ParsedIssueTemplate = {
  id: string; // filename or "blank"
  filename: string;
  name: string;
  description: string;
  /** Prefilled issue title when template provides one. */
  title: string;
  labels: string[];
  assignees: string[];
  kind: "blank" | "form" | "markdown";
  /** Markdown template body (kind=markdown). */
  bodyMarkdown?: string;
  /** YAML issue form fields (kind=form). */
  formFields?: IssueFormField[];
};

export type ParsedIssueTemplateConfig = {
  blankIssuesEnabled: boolean;
  contactLinks: Array<{ name: string; url: string; about?: string }>;
};

export type ParsedIssueTemplatesResult = {
  config: ParsedIssueTemplateConfig;
  templates: ParsedIssueTemplate[];
};

const BLANK_TEMPLATE: ParsedIssueTemplate = {
  id: "blank",
  filename: "",
  name: "Blank issue",
  description: "Create a new issue from scratch",
  title: "",
  labels: [],
  assignees: [],
  kind: "blank",
};

function asStringArray(value: unknown): string[] {
  if (Array.isArray(value)) {
    return value.map((v) => String(v).trim()).filter(Boolean);
  }
  if (typeof value === "string" && value.trim()) {
    return value
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean);
  }
  return [];
}

function parseFrontmatterMarkdown(content: string): {
  meta: Record<string, unknown>;
  body: string;
} {
  const trimmed = content.replace(/^\uFEFF/, "");
  if (!trimmed.startsWith("---")) {
    return { meta: {}, body: trimmed };
  }
  const end = trimmed.indexOf("\n---", 3);
  if (end === -1) {
    return { meta: {}, body: trimmed };
  }
  const rawMeta = trimmed.slice(3, end).trim();
  const body = trimmed.slice(end + 4).replace(/^\n/, "");
  try {
    const meta = parseYaml(rawMeta) as Record<string, unknown>;
    return { meta: meta && typeof meta === "object" ? meta : {}, body };
  } catch {
    return { meta: {}, body: trimmed };
  }
}

function parseFormField(raw: unknown, index: number): IssueFormField | null {
  if (!raw || typeof raw !== "object") return null;
  const obj = raw as Record<string, unknown>;
  const type = String(obj.type ?? "").toLowerCase() as IssueFormFieldType;
  if (!["markdown", "input", "textarea", "dropdown", "checkboxes"].includes(type)) {
    return null;
  }
  const attributes =
    obj.attributes && typeof obj.attributes === "object"
      ? (obj.attributes as Record<string, unknown>)
      : {};
  const validations =
    obj.validations && typeof obj.validations === "object"
      ? (obj.validations as Record<string, unknown>)
      : {};
  const id =
    typeof obj.id === "string" && obj.id.trim()
      ? obj.id.trim()
      : `field_${index}`;
  const required = Boolean(validations.required);

  if (type === "markdown") {
    return {
      type,
      id: `md_${index}`,
      value: String(attributes.value ?? ""),
      required: false,
    };
  }

  if (type === "dropdown") {
    const options = Array.isArray(attributes.options)
      ? attributes.options.map((o) => String(o))
      : [];
    return {
      type,
      id,
      label: attributes.label != null ? String(attributes.label) : id,
      description:
        attributes.description != null ? String(attributes.description) : undefined,
      required,
      options,
      multiple: Boolean(attributes.multiple),
    };
  }

  if (type === "checkboxes") {
    const opts = Array.isArray(attributes.options) ? attributes.options : [];
    const checkboxOptions = opts
      .map((o) => {
        if (!o || typeof o !== "object") return null;
        const row = o as Record<string, unknown>;
        const label = row.label != null ? String(row.label) : "";
        if (!label) return null;
        return {
          label,
          required: Boolean(row.required),
        };
      })
      .filter(Boolean) as Array<{ label: string; required?: boolean }>;
    return {
      type,
      id,
      label: attributes.label != null ? String(attributes.label) : id,
      description:
        attributes.description != null ? String(attributes.description) : undefined,
      required,
      checkboxOptions,
    };
  }

  // input | textarea
  return {
    type,
    id,
    label: attributes.label != null ? String(attributes.label) : id,
    description:
      attributes.description != null ? String(attributes.description) : undefined,
    placeholder:
      attributes.placeholder != null ? String(attributes.placeholder) : undefined,
    value: attributes.value != null ? String(attributes.value) : undefined,
    required,
  };
}

function parseYamlForm(
  filename: string,
  content: string,
): ParsedIssueTemplate | null {
  let doc: Record<string, unknown>;
  try {
    doc = parseYaml(content) as Record<string, unknown>;
  } catch {
    return null;
  }
  if (!doc || typeof doc !== "object") return null;
  // config.yml has blank_issues_enabled / contact_links — not a form.
  if ("blank_issues_enabled" in doc || "contact_links" in doc) {
    return null;
  }
  if (!("body" in doc) && !("name" in doc)) {
    return null;
  }
  const name = String(doc.name ?? filename);
  const description = String(doc.description ?? "");
  const title = doc.title != null ? String(doc.title) : "";
  const labels = asStringArray(doc.labels);
  const assignees = asStringArray(doc.assignees);
  const bodyRaw = Array.isArray(doc.body) ? doc.body : [];
  const formFields = bodyRaw
    .map((field, i) => parseFormField(field, i))
    .filter(Boolean) as IssueFormField[];

  return {
    id: filename,
    filename,
    name,
    description,
    title,
    labels,
    assignees,
    kind: "form",
    formFields,
  };
}

function parseMarkdownTemplate(
  filename: string,
  content: string,
): ParsedIssueTemplate {
  const { meta, body } = parseFrontmatterMarkdown(content);
  const name =
    (meta.name != null ? String(meta.name) : null) ||
    (meta.about != null ? String(meta.about) : null) ||
    filename.replace(/\.(md|markdown)$/i, "");
  return {
    id: filename,
    filename,
    name,
    description: meta.about != null ? String(meta.about) : meta.description != null ? String(meta.description) : "",
    title: meta.title != null ? String(meta.title) : "",
    labels: asStringArray(meta.labels),
    assignees: asStringArray(meta.assignees),
    kind: "markdown",
    bodyMarkdown: body,
  };
}

function parseConfig(content: string): ParsedIssueTemplateConfig {
  try {
    const doc = parseYaml(content) as Record<string, unknown>;
    const contactLinks = Array.isArray(doc?.contact_links)
      ? doc.contact_links
          .map((link) => {
            if (!link || typeof link !== "object") return null;
            const row = link as Record<string, unknown>;
            const name = row.name != null ? String(row.name) : "";
            const url = row.url != null ? String(row.url) : "";
            if (!name || !url) return null;
            return {
              name,
              url,
              about: row.about != null ? String(row.about) : undefined,
            };
          })
          .filter(Boolean) as Array<{ name: string; url: string; about?: string }>
      : [];
    return {
      // Default true when config missing; explicit false when disabled.
      blankIssuesEnabled: doc?.blank_issues_enabled !== false,
      contactLinks,
    };
  } catch {
    return { blankIssuesEnabled: true, contactLinks: [] };
  }
}

/** Parse template files from the API into chooser + form definitions. */
export function parseGithubIssueTemplates(
  files: GithubIssueTemplateFilePayload[],
): ParsedIssueTemplatesResult {
  let config: ParsedIssueTemplateConfig = {
    blankIssuesEnabled: true,
    contactLinks: [],
  };
  const templates: ParsedIssueTemplate[] = [];

  for (const file of files) {
    const lower = file.name.toLowerCase();
    if (lower === "config.yml" || lower === "config.yaml") {
      config = parseConfig(file.content);
      continue;
    }
    if (lower.endsWith(".yml") || lower.endsWith(".yaml")) {
      const form = parseYamlForm(file.name, file.content);
      if (form) templates.push(form);
      continue;
    }
    if (lower.endsWith(".md") || lower.endsWith(".markdown")) {
      templates.push(parseMarkdownTemplate(file.name, file.content));
    }
  }

  // Always offer blank (maintainers can create even when blank_issues_enabled is false).
  const blank: ParsedIssueTemplate = {
    ...BLANK_TEMPLATE,
    description: config.blankIssuesEnabled
      ? BLANK_TEMPLATE.description
      : "Create a new issue from scratch (maintainers)",
  };

  return {
    config,
    templates: [blank, ...templates],
  };
}

/**
 * Compose GitHub issue body from form field values (issue-forms style headings).
 * https://docs.github.com/en/communities/using-templates-to-encourage-useful-issues-and-pull-requests/syntax-for-issue-forms
 */
export function composeIssueBodyFromForm(
  fields: IssueFormField[],
  values: Record<string, string | string[] | boolean | undefined>,
): string {
  const parts: string[] = [];
  for (const field of fields) {
    if (field.type === "markdown") {
      if (field.value?.trim()) parts.push(field.value.trim());
      continue;
    }
    const label = field.label || field.id;
    const raw = values[field.id];
    let text = "";
    if (field.type === "checkboxes") {
      const selected = Array.isArray(raw)
        ? raw.map(String)
        : typeof raw === "string" && raw
          ? [raw]
          : [];
      const opts = field.checkboxOptions ?? [];
      text = opts
        .map((opt) => {
          const checked = selected.includes(opt.label);
          return `- [${checked ? "x" : " "}] ${opt.label}`;
        })
        .join("\n");
    } else if (Array.isArray(raw)) {
      text = raw.join(", ");
    } else if (raw != null && raw !== false) {
      text = String(raw);
    }
    parts.push(`### ${label}\n\n${text || "_No response_"}`);
  }
  return parts.join("\n\n");
}

/** Build default field values for a template (placeholders / defaults). */
export function defaultFieldValuesForTemplate(
  template: ParsedIssueTemplate,
): Record<string, string | string[] | boolean | undefined> {
  const out: Record<string, string | string[] | boolean | undefined> = {};
  if (template.kind === "blank") {
    out.description = "";
    return out;
  }
  if (template.kind === "markdown") {
    out.description = template.bodyMarkdown ?? "";
    return out;
  }
  for (const field of template.formFields ?? []) {
    if (field.type === "markdown") continue;
    if (field.type === "checkboxes") {
      out[field.id] = [] as string[];
    } else if (field.type === "dropdown" && field.multiple) {
      out[field.id] = [] as string[];
    } else {
      out[field.id] = field.value ?? "";
    }
  }
  return out;
}

export function isFieldValueEmpty(
  field: IssueFormField,
  value: string | string[] | boolean | undefined,
): boolean {
  if (field.type === "checkboxes") {
    const selected = Array.isArray(value) ? value : [];
    if (field.required && selected.length === 0) return true;
    // Per-option required
    for (const opt of field.checkboxOptions ?? []) {
      if (opt.required && !selected.includes(opt.label)) return true;
    }
    return false;
  }
  if (Array.isArray(value)) return value.length === 0;
  if (typeof value === "boolean") return !value;
  return !String(value ?? "").trim();
}
