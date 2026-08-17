import { CATALOG_VERSION } from "./shadcn-list";
import { C, ellipse, groupElements, rect, textEl } from "./primitives";
import { createId } from "../core/ids";
import type { PtElement, PtProps, PtSize } from "../core/types";

export type TemplateBuild = {
  elements: PtElement[];
  rootId: string;
  width: number;
  height: number;
};

export type TemplateContext = {
  x: number;
  y: number;
  variant?: string;
  size?: PtSize;
  props: PtProps;
};

function str(props: PtProps, key: string, fallback: string): string {
  const value = props[key];
  if (value === null || value === undefined || value === "") return fallback;
  return String(value);
}

function bool(props: PtProps, key: string): boolean {
  return props[key] === true || props[key] === "true";
}

function sizeScale(size: PtSize | undefined): number {
  if (size === "sm") return 0.85;
  if (size === "lg") return 1.15;
  return 1;
}

function variantFill(variant: string | undefined): { bg: string; fg: string; stroke: string } {
  switch (variant) {
    case "secondary":
      return { bg: C.secondary, fg: C.text, stroke: C.secondary };
    case "outline":
    case "ghost":
      return { bg: C.fill, fg: C.text, stroke: C.outline };
    case "destructive":
      return { bg: C.destructive, fg: C.destructiveFg, stroke: C.destructive };
    case "link":
      return { bg: "transparent", fg: C.accent, stroke: "transparent" };
    default:
      return { bg: C.primary, fg: C.primaryFg, stroke: C.primary };
  }
}

function assemble(
  root: PtElement,
  children: PtElement[],
  width: number,
  height: number,
): TemplateBuild {
  const groupId = createId("g");
  const all = groupElements([root, ...children], groupId);
  return { elements: all, rootId: root.id, width, height };
}

function labeledBox(
  ctx: TemplateContext,
  opts: {
    w: number;
    h: number;
    title: string;
    subtitle?: string;
    bg?: string;
    fg?: string;
    stroke?: string;
    radius?: boolean;
  },
): TemplateBuild {
  const scale = sizeScale(ctx.size);
  const w = Math.round(opts.w * scale);
  const h = Math.round(opts.h * scale);
  const root = rect(ctx.x, ctx.y, w, h, {
    backgroundColor: opts.bg ?? C.fill,
    strokeColor: opts.stroke ?? C.stroke,
    roundness: opts.radius === false ? null : { type: 3 },
  });
  const title = textEl(ctx.x + 10, ctx.y + 8, w - 20, 18, opts.title, {
    fontSize: 13,
    strokeColor: opts.fg ?? C.text,
    verticalAlign: "top",
  });
  const kids = [title];
  if (opts.subtitle) {
    kids.push(
      textEl(ctx.x + 10, ctx.y + 28, w - 20, 16, opts.subtitle, {
        fontSize: 11,
        strokeColor: C.mutedText,
        verticalAlign: "top",
      }),
    );
  }
  return assemble(root, kids, w, h);
}

function triggerButton(ctx: TemplateContext, label: string): TemplateBuild {
  const w = Math.max(88, label.length * 8 + 28);
  const h = 32;
  const root = rect(ctx.x, ctx.y, w, h, {
    backgroundColor: C.primary,
    strokeColor: C.primary,
  });
  const text = textEl(ctx.x, ctx.y, w, h, label, {
    textAlign: "center",
    strokeColor: C.primaryFg,
  });
  return assemble(root, [text], w, h);
}

function closeChip(x: number, y: number): PtElement[] {
  return [
    ellipse(x, y, 18, 18, { backgroundColor: C.muted, strokeColor: C.outline }),
    textEl(x, y, 18, 18, "×", { textAlign: "center", fontSize: 12, strokeColor: C.mutedText }),
  ];
}

function chipRow(
  x: number,
  y: number,
  labels: string[],
  fill = C.muted,
): PtElement[] {
  const out: PtElement[] = [];
  let cx = x;
  for (const label of labels) {
    const w = Math.max(48, label.length * 7 + 16);
    out.push(rect(cx, y, w, 22, { backgroundColor: fill, strokeColor: C.outline }));
    out.push(textEl(cx + 8, y, w - 16, 22, label, { fontSize: 11, textAlign: "center" }));
    cx += w + 6;
  }
  return out;
}

export function buildTemplate(
  componentType: string,
  ctx: TemplateContext,
): TemplateBuild {
  const variant = ctx.variant ?? "default";
  const label = str(ctx.props, "label", titleCase(componentType));
  const placeholder = str(ctx.props, "placeholder", "Placeholder");
  const title = str(ctx.props, "title", titleCase(componentType));
  const description = str(ctx.props, "description", "Description");

  switch (componentType) {
    case "button": {
      const colors = variantFill(variant);
      const w = Math.max(72, label.length * 8 + 28);
      const h = ctx.size === "sm" ? 28 : ctx.size === "lg" ? 40 : 32;
      const root = rect(ctx.x, ctx.y, w, h, {
        backgroundColor: colors.bg,
        strokeColor: colors.stroke,
      });
      const text = textEl(ctx.x, ctx.y, w, h, label, {
        textAlign: "center",
        strokeColor: colors.fg,
        fontSize: 13,
      });
      return assemble(root, [text], w, h);
    }
    case "badge": {
      const colors = variantFill(variant === "default" ? "secondary" : variant);
      const w = Math.max(44, label.length * 7 + 16);
      const root = rect(ctx.x, ctx.y, w, 20, {
        backgroundColor: colors.bg,
        strokeColor: colors.stroke,
      });
      const text = textEl(ctx.x, ctx.y, w, 20, label, {
        textAlign: "center",
        fontSize: 11,
        strokeColor: colors.fg,
      });
      return assemble(root, [text], w, 20);
    }
    case "input": {
      const w = 240;
      const h = 36;
      const root = rect(ctx.x, ctx.y, w, h, { backgroundColor: C.fill });
      const text = textEl(ctx.x + 10, ctx.y, w - 20, h, placeholder, {
        strokeColor: C.mutedText,
      });
      return assemble(root, [text], w, h);
    }
    case "textarea": {
      const w = 260;
      const h = 88;
      const root = rect(ctx.x, ctx.y, w, h);
      const text = textEl(ctx.x + 10, ctx.y + 8, w - 20, 20, placeholder, {
        strokeColor: C.mutedText,
        verticalAlign: "top",
      });
      return assemble(root, [text], w, h);
    }
    case "label":
      return labeledBox(ctx, { w: 120, h: 22, title: label, bg: "transparent", stroke: "transparent" });
    case "checkbox": {
      const checked = bool(ctx.props, "checked");
      const w = 162;
      const h = 20;
      const root = rect(ctx.x, ctx.y, w, h, {
        backgroundColor: "transparent",
        strokeColor: "transparent",
      });
      const box = rect(ctx.x, ctx.y, 16, 16, {
        backgroundColor: checked ? C.primary : C.fill,
      });
      const text = textEl(ctx.x + 22, ctx.y, 140, 16, label, { fontSize: 13 });
      return assemble(root, [box, text], w, h);
    }
    case "switch": {
      const on = bool(ctx.props, "checked");
      const w = 124;
      const h = 20;
      const root = rect(ctx.x, ctx.y, w, h, {
        backgroundColor: "transparent",
        strokeColor: "transparent",
      });
      const track = rect(ctx.x, ctx.y, 36, 20, {
        backgroundColor: on ? C.primary : C.secondary,
      });
      const knob = ellipse(ctx.x + (on ? 18 : 2), ctx.y + 2, 16, 16, {
        backgroundColor: C.fill,
        strokeColor: C.outline,
      });
      const text = textEl(ctx.x + 44, ctx.y, 80, 20, label, { fontSize: 13 });
      return assemble(root, [track, knob, text], w, h);
    }
    case "radio-group": {
      const items = ["Option A", "Option B", "Option C"];
      const root = rect(ctx.x, ctx.y, 180, 88, { backgroundColor: C.fill });
      const kids: PtElement[] = [];
      items.forEach((item, i) => {
        kids.push(
          ellipse(ctx.x + 10, ctx.y + 12 + i * 24, 14, 14, {
            backgroundColor: i === 0 ? C.primary : C.fill,
          }),
        );
        kids.push(textEl(ctx.x + 32, ctx.y + 10 + i * 24, 130, 18, item, { fontSize: 12 }));
      });
      return assemble(root, kids, 180, 88);
    }
    case "slider": {
      const root = rect(ctx.x, ctx.y, 200, 24, {
        backgroundColor: "transparent",
        strokeColor: "transparent",
      });
      const track = rect(ctx.x, ctx.y + 10, 200, 4, { backgroundColor: C.secondary, strokeColor: C.secondary });
      const fill = rect(ctx.x, ctx.y + 10, 80, 4, { backgroundColor: C.primary, strokeColor: C.primary });
      const knob = ellipse(ctx.x + 72, ctx.y + 4, 16, 16, { backgroundColor: C.fill });
      return assemble(root, [track, fill, knob], 200, 24);
    }
    case "progress": {
      const root = rect(ctx.x, ctx.y, 220, 10, { backgroundColor: C.secondary, strokeColor: C.secondary });
      const fill = rect(ctx.x, ctx.y, 120, 10, { backgroundColor: C.primary, strokeColor: C.primary });
      return assemble(root, [fill], 220, 10);
    }
    case "avatar": {
      const root = ellipse(ctx.x, ctx.y, 40, 40, { backgroundColor: C.secondary });
      const text = textEl(ctx.x, ctx.y, 40, 40, str(ctx.props, "fallback", "AL"), {
        textAlign: "center",
        fontSize: 12,
      });
      return assemble(root, [text], 40, 40);
    }
    case "card": {
      const w = 280;
      const h = 168;
      const root = rect(ctx.x, ctx.y, w, h);
      const kids = [
        textEl(ctx.x + 16, ctx.y + 14, w - 32, 20, title, { fontSize: 15 }),
        textEl(ctx.x + 16, ctx.y + 38, w - 32, 36, description, {
          fontSize: 12,
          strokeColor: C.mutedText,
          verticalAlign: "top",
        }),
        rect(ctx.x + 16, ctx.y + 120, 88, 28, { backgroundColor: C.primary, strokeColor: C.primary }),
        textEl(ctx.x + 16, ctx.y + 120, 88, 28, str(ctx.props, "action", "Action"), {
          textAlign: "center",
          strokeColor: C.primaryFg,
        }),
      ];
      return assemble(root, kids, w, h);
    }
    case "alert": {
      const destructive = variant === "destructive";
      return labeledBox(ctx, {
        w: 320,
        h: 72,
        title,
        subtitle: description,
        bg: destructive ? "#fef2f2" : C.muted,
        fg: destructive ? C.destructive : C.text,
        stroke: destructive ? C.destructive : C.outline,
      });
    }
    case "separator": {
      const root = rect(ctx.x, ctx.y, 240, 1, {
        backgroundColor: C.outline,
        strokeColor: C.outline,
        roundness: null,
      });
      return assemble(root, [], 240, 1);
    }
    case "skeleton": {
      const root = rect(ctx.x, ctx.y, 200, 16, {
        backgroundColor: C.secondary,
        strokeColor: C.secondary,
      });
      return assemble(root, [], 200, 16);
    }
    case "spinner": {
      const root = ellipse(ctx.x, ctx.y, 24, 24, {
        backgroundColor: "transparent",
        strokeColor: C.mutedStroke,
        strokeWidth: 2,
      });
      return assemble(root, [], 24, 24);
    }
    case "kbd": {
      const w = Math.max(28, label.length * 8 + 12);
      const root = rect(ctx.x, ctx.y, w, 22, { backgroundColor: C.muted });
      const text = textEl(ctx.x, ctx.y, w, 22, label, { textAlign: "center", fontSize: 11 });
      return assemble(root, [text], w, 22);
    }
    case "toggle": {
      const on = bool(ctx.props, "pressed") || variant === "outline";
      const root = rect(ctx.x, ctx.y, 36, 32, {
        backgroundColor: on ? C.secondary : C.fill,
      });
      const text = textEl(ctx.x, ctx.y, 36, 32, "B", { textAlign: "center" });
      return assemble(root, [text], 36, 32);
    }
    case "toggle-group": {
      const root = rect(ctx.x, ctx.y, 108, 32);
      const kids = ["L", "C", "R"].flatMap((ch, i) => [
        rect(ctx.x + i * 36, ctx.y, 36, 32, {
          backgroundColor: i === 0 ? C.secondary : C.fill,
        }),
        textEl(ctx.x + i * 36, ctx.y, 36, 32, ch, { textAlign: "center" }),
      ]);
      return assemble(root, kids, 108, 32);
    }
    case "button-group": {
      const root = rect(ctx.x, ctx.y, 168, 32, { strokeColor: "transparent", backgroundColor: "transparent" });
      const kids = ["One", "Two"].flatMap((ch, i) => [
        rect(ctx.x + i * 84, ctx.y, 80, 32, { backgroundColor: i === 0 ? C.primary : C.fill }),
        textEl(ctx.x + i * 84, ctx.y, 80, 32, ch, {
          textAlign: "center",
          strokeColor: i === 0 ? C.primaryFg : C.text,
        }),
      ]);
      return assemble(root, kids, 168, 32);
    }
    case "tabs": {
      const w = 280;
      const h = 140;
      const root = rect(ctx.x, ctx.y, w, h);
      const kids = [
        ...chipRow(ctx.x + 12, ctx.y + 10, ["Account", "Password"], C.muted),
        rect(ctx.x + 12, ctx.y + 44, w - 24, 84, { backgroundColor: C.muted, strokeColor: C.outline }),
        textEl(ctx.x + 24, ctx.y + 70, w - 48, 20, "Tab panel", { strokeColor: C.mutedText }),
      ];
      return assemble(root, kids, w, h);
    }
    case "accordion":
    case "collapsible": {
      const w = 280;
      if (variant === "collapsed") {
        const root = rect(ctx.x, ctx.y, w, 40);
        return assemble(
          root,
          [textEl(ctx.x + 12, ctx.y, w - 36, 40, "Is it accessible?"), textEl(ctx.x + w - 24, ctx.y, 16, 40, "▸")],
          w,
          40,
        );
      }
      const h = 120;
      const root = rect(ctx.x, ctx.y, w, h);
      const kids = [
        textEl(ctx.x + 12, ctx.y, w - 36, 36, "Is it accessible?"),
        textEl(ctx.x + w - 24, ctx.y, 16, 36, "▾"),
        textEl(ctx.x + 12, ctx.y + 36, w - 24, 36, "Yes. It uses semantic markup.", {
          fontSize: 12,
          strokeColor: C.mutedText,
          verticalAlign: "top",
        }),
        textEl(ctx.x + 12, ctx.y + 80, w - 24, 18, "Is it styled?", { strokeColor: C.mutedText }),
      ];
      return assemble(root, kids, w, h);
    }
    case "breadcrumb": {
      const root = rect(ctx.x, ctx.y, 260, 24, {
        backgroundColor: "transparent",
        strokeColor: "transparent",
      });
      const text = textEl(ctx.x, ctx.y, 260, 24, "Home / Components / Breadcrumb", {
        fontSize: 12,
        strokeColor: C.mutedText,
      });
      return assemble(root, [text], 260, 24);
    }
    case "pagination": {
      const root = rect(ctx.x, ctx.y, 220, 32, {
        backgroundColor: "transparent",
        strokeColor: "transparent",
      });
      return assemble(root, chipRow(ctx.x, ctx.y, ["Prev", "1", "2", "Next"]), 220, 32);
    }
    case "table":
    case "data-table": {
      const w = 360;
      const h = 160;
      const root = rect(ctx.x, ctx.y, w, h);
      const kids: PtElement[] = [
        rect(ctx.x, ctx.y, w, 32, { backgroundColor: C.muted, strokeColor: C.outline }),
        textEl(ctx.x + 12, ctx.y, w - 24, 32, "Name     Status     Role"),
      ];
      for (let i = 0; i < 3; i++) {
        kids.push(
          textEl(
            ctx.x + 12,
            ctx.y + 32 + i * 32,
            w - 24,
            32,
            `Row ${i + 1}    Active    Editor`,
            { fontSize: 12 },
          ),
        );
      }
      return assemble(root, kids, w, h);
    }
    case "dialog":
    case "alert-dialog": {
      if (variant === "trigger") {
        return triggerButton(
          ctx,
          str(ctx.props, "label", componentType === "alert-dialog" ? "Show alert" : "Open dialog"),
        );
      }
      const w = 320;
      const h = 180;
      const root = rect(ctx.x, ctx.y, w, h);
      const kids = [
        textEl(ctx.x + 20, ctx.y + 16, w - 40, 22, title, { fontSize: 16, verticalAlign: "top" }),
        textEl(ctx.x + 20, ctx.y + 46, w - 40, 40, description, {
          fontSize: 12,
          strokeColor: C.mutedText,
          verticalAlign: "top",
        }),
        rect(ctx.x + w - 188, ctx.y + h - 48, 80, 28, { backgroundColor: C.fill }),
        textEl(ctx.x + w - 188, ctx.y + h - 48, 80, 28, "Cancel", { textAlign: "center" }),
        rect(ctx.x + w - 96, ctx.y + h - 48, 76, 28, {
          backgroundColor: componentType === "alert-dialog" ? C.destructive : C.primary,
          strokeColor: componentType === "alert-dialog" ? C.destructive : C.primary,
        }),
        textEl(ctx.x + w - 96, ctx.y + h - 48, 76, 28, "Continue", {
          textAlign: "center",
          strokeColor: C.primaryFg,
        }),
      ];
      return assemble(root, kids, w, h);
    }
    case "sheet":
    case "drawer": {
      if (variant === "trigger") {
        return triggerButton(ctx, str(ctx.props, "label", componentType === "sheet" ? "Open sheet" : "Open drawer"));
      }
      const w = 280;
      const h = 360;
      const root = rect(ctx.x, ctx.y, w, h);
      const kids = [
        textEl(ctx.x + 16, ctx.y + 16, w - 32, 22, title, { fontSize: 16, verticalAlign: "top" }),
        textEl(ctx.x + 16, ctx.y + 48, w - 32, 40, description, {
          fontSize: 12,
          strokeColor: C.mutedText,
          verticalAlign: "top",
        }),
        rect(ctx.x + 16, ctx.y + h - 52, w - 32, 32, { backgroundColor: C.primary, strokeColor: C.primary }),
        textEl(ctx.x + 16, ctx.y + h - 52, w - 32, 32, "Save", {
          textAlign: "center",
          strokeColor: C.primaryFg,
        }),
      ];
      return assemble(root, kids, w, h);
    }
    case "select":
    case "native-select":
    case "combobox": {
      const w = 220;
      if (variant !== "open") {
        const root = rect(ctx.x, ctx.y, w, 36);
        const text = textEl(ctx.x + 10, ctx.y, w - 36, 36, placeholder);
        const chevron = textEl(ctx.x + w - 24, ctx.y, 16, 36, "▾", { fontSize: 12 });
        return assemble(root, [text, chevron], w, 36);
      }
      const h = 148;
      const root = rect(ctx.x, ctx.y, w, h);
      const items = ["Apple", "Banana", "Blueberry", "Grapes"];
      const kids = items.map((item, i) =>
        textEl(ctx.x + 12, ctx.y + 10 + i * 32, w - 24, 22, item, { fontSize: 13 }),
      );
      return assemble(root, kids, w, h);
    }
    case "dropdown-menu":
    case "context-menu":
    case "menubar":
    case "navigation-menu": {
      if (variant === "trigger" || variant === "bar") {
        if (componentType === "menubar" || variant === "bar") {
          const root = rect(ctx.x, ctx.y, 220, 36);
          return assemble(root, chipRow(ctx.x + 8, ctx.y + 6, ["File", "Edit", "View"]), 220, 36);
        }
        const triggerLabel =
          componentType === "context-menu"
            ? "Right-click"
            : componentType === "navigation-menu"
              ? "Open nav"
              : "Open menu";
        return triggerButton(ctx, str(ctx.props, "label", triggerLabel));
      }
      const w = 200;
      const h = 148;
      const root = rect(ctx.x, ctx.y, w, h);
      const items = ["Profile", "Billing", "Team", "Subscription"];
      const kids = items.map((item, i) =>
        textEl(ctx.x + 12, ctx.y + 10 + i * 32, w - 24, 22, item, { fontSize: 13 }),
      );
      return assemble(root, kids, w, h);
    }
    case "popover":
    case "hover-card":
    case "tooltip": {
      if (variant === "trigger") {
        return triggerButton(ctx, str(ctx.props, "label", componentType === "tooltip" ? "Hover" : "Open"));
      }
      const w = componentType === "tooltip" ? 140 : 220;
      const h = componentType === "tooltip" ? 36 : 88;
      return labeledBox(ctx, {
        w,
        h,
        title: componentType === "tooltip" ? label : title,
        subtitle: componentType === "tooltip" ? undefined : description,
        bg: C.primary,
        fg: C.primaryFg,
        stroke: C.primary,
      });
    }
    case "command": {
      if (variant === "trigger") {
        return triggerButton(ctx, str(ctx.props, "label", "Open command"));
      }
      const w = 320;
      const h = 200;
      const root = rect(ctx.x, ctx.y, w, h);
      const kids = [
        rect(ctx.x + 8, ctx.y + 8, w - 16, 32, { backgroundColor: C.muted }),
        textEl(ctx.x + 16, ctx.y + 8, w - 32, 32, "Search…", { strokeColor: C.mutedText }),
        textEl(ctx.x + 16, ctx.y + 56, w - 32, 20, "Calendar"),
        textEl(ctx.x + 16, ctx.y + 84, w - 32, 20, "Search emoji"),
        textEl(ctx.x + 16, ctx.y + 112, w - 32, 20, "Calculator"),
      ];
      return assemble(root, kids, w, h);
    }
    case "calendar": {
      const w = 260;
      const h = 240;
      const root = rect(ctx.x, ctx.y, w, h);
      const kids = [
        textEl(ctx.x + 12, ctx.y + 10, w - 24, 20, "August 2026", { textAlign: "center" }),
        textEl(ctx.x + 12, ctx.y + 40, w - 24, 180, "Su Mo Tu We Th Fr Sa\n               1\n 2  3  4  5  6  7  8", {
          fontSize: 12,
          verticalAlign: "top",
        }),
      ];
      return assemble(root, kids, w, h);
    }
    case "date-picker": {
      if (variant !== "open") {
        const w = 220;
        const root = rect(ctx.x, ctx.y, w, 36);
        return assemble(
          root,
          [
            textEl(ctx.x + 10, ctx.y, w - 36, 36, str(ctx.props, "placeholder", "Pick a date")),
            textEl(ctx.x + w - 24, ctx.y, 16, 36, "▾", { fontSize: 12 }),
          ],
          w,
          36,
        );
      }
      const w = 260;
      const h = 240;
      const root = rect(ctx.x, ctx.y, w, h);
      const kids = [
        textEl(ctx.x + 12, ctx.y + 10, w - 24, 20, "August 2026", { textAlign: "center" }),
        textEl(ctx.x + 12, ctx.y + 40, w - 24, 180, "Su Mo Tu We Th Fr Sa\n               1\n 2  3  4  5  6  7  8", {
          fontSize: 12,
          verticalAlign: "top",
        }),
      ];
      return assemble(root, kids, w, h);
    }
    case "chart": {
      const w = 320;
      const h = 180;
      const root = rect(ctx.x, ctx.y, w, h, { backgroundColor: C.fill });
      const bars = [40, 80, 55, 110, 70].map((bh, i) =>
        rect(ctx.x + 28 + i * 56, ctx.y + h - 24 - bh, 32, bh, {
          backgroundColor: C.accent,
          strokeColor: C.accent,
        }),
      );
      return assemble(root, bars, w, h);
    }
    case "carousel": {
      const w = 300;
      const h = 140;
      const root = rect(ctx.x, ctx.y, w, h);
      const kids = [
        textEl(ctx.x + 40, ctx.y + 56, w - 80, 24, "Slide 1", { textAlign: "center" }),
        textEl(ctx.x + 8, ctx.y + 56, 24, 24, "‹"),
        textEl(ctx.x + w - 28, ctx.y + 56, 24, 24, "›"),
      ];
      return assemble(root, kids, w, h);
    }
    case "sidebar": {
      const w = 220;
      const h = 320;
      const root = rect(ctx.x, ctx.y, w, h, { backgroundColor: C.muted });
      const kids = ["Home", "Inbox", "Settings", "Help"].map((item, i) =>
        textEl(ctx.x + 16, ctx.y + 20 + i * 36, w - 32, 22, item),
      );
      return assemble(root, kids, w, h);
    }
    case "form":
    case "field":
    case "input-group": {
      const w = 280;
      const h = 120;
      const root = rect(ctx.x, ctx.y, w, h);
      const kids = [
        textEl(ctx.x + 12, ctx.y + 10, w - 24, 16, str(ctx.props, "label", "Email"), {
          fontSize: 12,
        }),
        rect(ctx.x + 12, ctx.y + 32, w - 24, 36),
        textEl(ctx.x + 20, ctx.y + 32, w - 40, 36, placeholder, { strokeColor: C.mutedText }),
        textEl(ctx.x + 12, ctx.y + 76, w - 24, 16, "Helper text", {
          fontSize: 11,
          strokeColor: C.mutedText,
        }),
      ];
      return assemble(root, kids, w, h);
    }
    case "input-otp": {
      const root = rect(ctx.x, ctx.y, 196, 40, {
        backgroundColor: "transparent",
        strokeColor: "transparent",
      });
      const kids = [0, 1, 2, 3, 4, 5].map((i) =>
        rect(ctx.x + i * 32, ctx.y, 28, 40),
      );
      return assemble(root, kids, 196, 40);
    }
    case "item": {
      const w = 280;
      const h = 56;
      const root = rect(ctx.x, ctx.y, w, h);
      const kids = [
        ellipse(ctx.x + 10, ctx.y + 12, 32, 32, { backgroundColor: C.secondary }),
        textEl(ctx.x + 52, ctx.y + 8, w - 64, 18, title),
        textEl(ctx.x + 52, ctx.y + 28, w - 64, 16, description, {
          fontSize: 12,
          strokeColor: C.mutedText,
        }),
      ];
      return assemble(root, kids, w, h);
    }
    case "empty": {
      return labeledBox(ctx, {
        w: 280,
        h: 140,
        title: title || "No results",
        subtitle: description || "Try a different search.",
        bg: C.muted,
      });
    }
    case "toast":
    case "sonner": {
      return labeledBox(ctx, {
        w: 280,
        h: 64,
        title: title || "Scheduled",
        subtitle: description || "Friday, February 10, 2026",
      });
    }
    case "scroll-area": {
      const w = 200;
      const h = 160;
      const root = rect(ctx.x, ctx.y, w, h);
      const kids = [
        textEl(ctx.x + 10, ctx.y + 10, w - 28, 120, "Tag 1\nTag 2\nTag 3\nTag 4\nTag 5", {
          fontSize: 12,
          verticalAlign: "top",
        }),
        rect(ctx.x + w - 10, ctx.y + 8, 4, 48, {
          backgroundColor: C.mutedStroke,
          strokeColor: C.mutedStroke,
        }),
      ];
      return assemble(root, kids, w, h);
    }
    case "resizable": {
      const w = 320;
      const h = 160;
      const root = rect(ctx.x, ctx.y, w, h);
      const kids = [
        rect(ctx.x, ctx.y, 140, h, { backgroundColor: C.muted }),
        textEl(ctx.x + 16, ctx.y + 16, 108, 20, "Sidebar"),
        textEl(ctx.x + 160, ctx.y + 16, 140, 20, "Content"),
      ];
      return assemble(root, kids, w, h);
    }
    case "aspect-ratio": {
      const w = 240;
      const h = 135;
      const root = rect(ctx.x, ctx.y, w, h, { backgroundColor: C.muted });
      const text = textEl(ctx.x, ctx.y, w, h, "16:9", { textAlign: "center", strokeColor: C.mutedText });
      return assemble(root, [text], w, h);
    }
    case "typography": {
      const w = 280;
      const h = 100;
      const root = rect(ctx.x, ctx.y, w, h, {
        backgroundColor: "transparent",
        strokeColor: "transparent",
      });
      const kids = [
        textEl(ctx.x, ctx.y, w, 28, title || "Taxing Laughter", { fontSize: 20 }),
        textEl(ctx.x, ctx.y + 36, w, 48, description || "The joke tax is a terrible idea.", {
          fontSize: 13,
          strokeColor: C.mutedText,
          verticalAlign: "top",
        }),
      ];
      return assemble(root, kids, w, h);
    }
    case "direction": {
      return labeledBox(ctx, {
        w: 200,
        h: 48,
        title: "LTR / RTL",
        subtitle: "Text direction",
      });
    }
    case "attachment": {
      const name = str(ctx.props, "label", "workspace.png");
      const meta = str(ctx.props, "description", "PNG · 820 KB");
      if (variant === "uploading") {
        const w = 320;
        const h = 64;
        const root = rect(ctx.x, ctx.y, w, h);
        const kids = [
          ellipse(ctx.x + 12, ctx.y + 16, 32, 32, { backgroundColor: C.muted, strokeColor: C.outline }),
          textEl(ctx.x + 20, ctx.y + 20, 16, 24, "↻", { textAlign: "center", fontSize: 14, strokeColor: C.mutedText }),
          textEl(ctx.x + 56, ctx.y + 10, 220, 20, name),
          textEl(ctx.x + 56, ctx.y + 32, 220, 16, meta, { fontSize: 12, strokeColor: C.mutedText }),
          ...closeChip(ctx.x + w - 32, ctx.y + 23),
        ];
        return assemble(root, kids, w, h);
      }
      if (variant === "file") {
        const w = 320;
        const h = 64;
        const root = rect(ctx.x, ctx.y, w, h);
        const kids = [
          rect(ctx.x + 12, ctx.y + 14, 32, 36, { backgroundColor: C.muted }),
          textEl(ctx.x + 16, ctx.y + 22, 24, 20, "⌘", { textAlign: "center", fontSize: 12 }),
          textEl(ctx.x + 56, ctx.y + 10, 220, 20, name),
          textEl(ctx.x + 56, ctx.y + 32, 220, 16, meta, { fontSize: 12, strokeColor: C.mutedText }),
          ...closeChip(ctx.x + w - 32, ctx.y + 23),
        ];
        return assemble(root, kids, w, h);
      }
      const w = 148;
      const h = 176;
      const root = rect(ctx.x, ctx.y, w, h);
      const kids = [
        rect(ctx.x + 8, ctx.y + 8, w - 16, 96, { backgroundColor: C.secondary }),
        textEl(ctx.x + 12, ctx.y + 112, w - 24, 20, name, { fontSize: 13 }),
        textEl(ctx.x + 12, ctx.y + 134, w - 24, 16, meta, { fontSize: 11, strokeColor: C.mutedText }),
      ];
      return assemble(root, kids, w, h);
    }
    case "bubble": {
      const sent = variant === "sent";
      const w = 220;
      const h = 56;
      const root = rect(ctx.x, ctx.y, w, h, {
        backgroundColor: sent ? C.primary : C.muted,
        strokeColor: sent ? C.primary : C.outline,
      });
      const text = textEl(ctx.x + 12, ctx.y, w - 24, h, label || (sent ? "Sounds good." : "Can you review this?"), {
        strokeColor: sent ? C.primaryFg : C.text,
        fontSize: 13,
      });
      return assemble(root, [text], w, h);
    }
    case "message": {
      const assistant = variant === "assistant";
      const w = 280;
      const h = 72;
      const root = rect(ctx.x, ctx.y, w, h, {
        backgroundColor: "transparent",
        strokeColor: "transparent",
      });
      const kids = [
        ellipse(ctx.x, ctx.y + 8, 28, 28, { backgroundColor: assistant ? C.accent : C.secondary }),
        textEl(ctx.x + 36, ctx.y + 4, 160, 16, assistant ? "Assistant" : "You", { fontSize: 11, strokeColor: C.mutedText }),
        rect(ctx.x + 36, ctx.y + 24, 220, 40, {
          backgroundColor: assistant ? C.muted : C.primary,
          strokeColor: assistant ? C.outline : C.primary,
        }),
        textEl(ctx.x + 48, ctx.y + 24, 196, 40, description || (assistant ? "Here is a draft." : "Please summarize."), {
          fontSize: 12,
          strokeColor: assistant ? C.text : C.primaryFg,
        }),
      ];
      return assemble(root, kids, w, h);
    }
    case "message-scroller": {
      const w = 300;
      const h = 220;
      const root = rect(ctx.x, ctx.y, w, h, { backgroundColor: C.fill });
      const kids = [
        textEl(ctx.x + 12, ctx.y + 10, w - 24, 16, "Today", { textAlign: "center", fontSize: 11, strokeColor: C.mutedText }),
        rect(ctx.x + 12, ctx.y + 36, 200, 40, { backgroundColor: C.muted }),
        textEl(ctx.x + 20, ctx.y + 36, 184, 40, "Can you review this?", { fontSize: 12 }),
        rect(ctx.x + 88, ctx.y + 88, 200, 40, { backgroundColor: C.primary, strokeColor: C.primary }),
        textEl(ctx.x + 96, ctx.y + 88, 184, 40, "On it.", { fontSize: 12, strokeColor: C.primaryFg }),
        rect(ctx.x + 12, ctx.y + h - 40, w - 24, 28),
        textEl(ctx.x + 20, ctx.y + h - 40, w - 40, 28, "Message…", { fontSize: 12, strokeColor: C.mutedText }),
      ];
      return assemble(root, kids, w, h);
    }
    case "marker": {
      const w = 280;
      if (variant === "separator") {
        const root = rect(ctx.x, ctx.y, w, 20, { backgroundColor: "transparent", strokeColor: "transparent" });
        return assemble(
          root,
          [
            rect(ctx.x, ctx.y + 9, 110, 1, { backgroundColor: C.outline, strokeColor: C.outline }),
            textEl(ctx.x + 114, ctx.y, 52, 20, label || "Today", { textAlign: "center", fontSize: 11, strokeColor: C.mutedText }),
            rect(ctx.x + 170, ctx.y + 9, 110, 1, { backgroundColor: C.outline, strokeColor: C.outline }),
          ],
          w,
          20,
        );
      }
      const root = rect(ctx.x, ctx.y, w, 28, { backgroundColor: "transparent", strokeColor: "transparent" });
      return assemble(
        root,
        [textEl(ctx.x, ctx.y, w, 28, label || "Alex joined the thread", { textAlign: "center", fontSize: 12, strokeColor: C.mutedText })],
        w,
        28,
      );
    }
    case "questionnaire": {
      const w = 320;
      const h = 220;
      const root = rect(ctx.x, ctx.y, w, h);
      const kids = [
        textEl(ctx.x + 16, ctx.y + 14, w - 32, 16, "Question 1 of 3", { fontSize: 11, strokeColor: C.mutedText }),
        textEl(ctx.x + 16, ctx.y + 36, w - 32, 40, title || "What are you building?", {
          fontSize: 15,
          verticalAlign: "top",
        }),
        ...["Dashboard", "Chat app", "Marketing site"].flatMap((item, i) => [
          rect(ctx.x + 16, ctx.y + 88 + i * 28, w - 32, 24, {
            backgroundColor: i === 0 ? C.muted : C.fill,
          }),
          textEl(ctx.x + 24, ctx.y + 88 + i * 28, w - 48, 24, item, { fontSize: 12 }),
        ]),
      ];
      return assemble(root, kids, w, h);
    }
    case "block.auth-form": {
      const w = 320;
      const h = 280;
      const root = rect(ctx.x, ctx.y, w, h);
      const kids = [
        textEl(ctx.x + 20, ctx.y + 16, w - 40, 24, "Sign in", { fontSize: 18 }),
        textEl(ctx.x + 20, ctx.y + 56, 80, 16, "Email", { fontSize: 12 }),
        rect(ctx.x + 20, ctx.y + 76, w - 40, 36),
        textEl(ctx.x + 20, ctx.y + 124, 80, 16, "Password", { fontSize: 12 }),
        rect(ctx.x + 20, ctx.y + 144, w - 40, 36),
        rect(ctx.x + 20, ctx.y + 204, w - 40, 36, { backgroundColor: C.primary, strokeColor: C.primary }),
        textEl(ctx.x + 20, ctx.y + 204, w - 40, 36, "Continue", {
          textAlign: "center",
          strokeColor: C.primaryFg,
        }),
      ];
      return assemble(root, kids, w, h);
    }
    case "block.settings-shell": {
      const w = 480;
      const h = 280;
      const root = rect(ctx.x, ctx.y, w, h);
      const kids = [
        rect(ctx.x, ctx.y, 160, h, { backgroundColor: C.muted }),
        textEl(ctx.x + 16, ctx.y + 16, 128, 20, "Settings"),
        textEl(ctx.x + 16, ctx.y + 48, 128, 20, "Profile", { fontSize: 12 }),
        textEl(ctx.x + 16, ctx.y + 72, 128, 20, "Account", { fontSize: 12 }),
        textEl(ctx.x + 184, ctx.y + 16, 260, 24, "Profile", { fontSize: 16 }),
        textEl(ctx.x + 184, ctx.y + 52, 80, 16, "Name", { fontSize: 12 }),
        rect(ctx.x + 184, ctx.y + 72, 260, 36),
      ];
      return assemble(root, kids, w, h);
    }
    case "block.empty-state": {
      const w = 360;
      const h = 200;
      const root = rect(ctx.x, ctx.y, w, h, { backgroundColor: C.muted });
      const kids = [
        ellipse(ctx.x + 156, ctx.y + 24, 48, 48, { backgroundColor: C.secondary }),
        textEl(ctx.x + 20, ctx.y + 84, w - 40, 22, "Nothing here yet", { textAlign: "center" }),
        textEl(ctx.x + 20, ctx.y + 112, w - 40, 20, "Create your first item to get started.", {
          textAlign: "center",
          fontSize: 12,
          strokeColor: C.mutedText,
        }),
        rect(ctx.x + 130, ctx.y + 148, 100, 28, { backgroundColor: C.primary, strokeColor: C.primary }),
        textEl(ctx.x + 130, ctx.y + 148, 100, 28, "Create", {
          textAlign: "center",
          strokeColor: C.primaryFg,
        }),
      ];
      return assemble(root, kids, w, h);
    }
    case "block.nav-content": {
      const w = 520;
      const h = 280;
      const root = rect(ctx.x, ctx.y, w, h);
      const kids = [
        rect(ctx.x, ctx.y, w, 48, { backgroundColor: C.muted }),
        textEl(ctx.x + 16, ctx.y, 80, 48, "Product"),
        textEl(ctx.x + 120, ctx.y, 60, 48, "Docs", { fontSize: 13 }),
        textEl(ctx.x + 190, ctx.y, 80, 48, "Pricing", { fontSize: 13 }),
        textEl(ctx.x + 24, ctx.y + 80, 300, 28, "Build faster", { fontSize: 22, verticalAlign: "top" }),
        textEl(ctx.x + 24, ctx.y + 118, 360, 40, "A clean content column under a top nav.", {
          strokeColor: C.mutedText,
          verticalAlign: "top",
        }),
      ];
      return assemble(root, kids, w, h);
    }
    default:
      return labeledBox(ctx, {
        w: 220,
        h: 64,
        title: titleCase(componentType),
        subtitle: "Wireframe",
      });
  }
}

function titleCase(id: string): string {
  return id
    .split(/[-.]/)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

export function stampRootMeta(
  build: TemplateBuild,
  meta: {
    instanceId: string;
    componentType: string;
    variant?: string;
    size?: PtSize;
    props: PtProps;
  },
): TemplateBuild {
  const elements = build.elements.map((el) => {
    if (el.id !== build.rootId) {
      return {
        ...el,
        customData: { pt: { instanceId: meta.instanceId } },
      };
    }
    return {
      ...el,
      customData: {
        pt: {
          schemaVersion: 1 as const,
          instanceId: meta.instanceId,
          componentType: meta.componentType,
          catalogVersion: CATALOG_VERSION,
          variant: meta.variant,
          size: meta.size,
          props: meta.props,
        },
      },
    };
  });
  return { ...build, elements };
}
