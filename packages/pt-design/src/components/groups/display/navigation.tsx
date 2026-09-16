import { ChevronDown, ChevronLeft, ChevronRight } from "lucide-react";
import type { CSSProperties, ReactElement } from "react";
import type { PtNode, PtOption } from "../../../protocol";
import type { PtComponentModule, PtRendererProps } from "./contract";
import { COPY_FIELDS, FILL, FONT, LABEL_FIELD, T, TITLE_FIELDS, ptNode } from "./node";
import { ControlRoot, emit, ghostBtn, propText, renderFlowChildren } from "./runtime";

const accordionBBox = { width: 280, height: 160 };
const collapsibleBBox = { width: 280, height: 140 };
const breadcrumbBBox = { width: 280, height: 28 };
const paginationBBox = { width: 220, height: 36 };
const sidebarBBox = { width: 220, height: 280 };
const tabsBBox = { width: 280, height: 160 };
const carouselBBox = { width: 300, height: 140 };

function pairOptions(): PtOption[] {
  return [
    { value: "a", label: "Account" },
    { value: "b", label: "Password" },
  ];
}

function sectionItems(id: string, first: { title: string; body: string }, second: { title: string; body: string }): PtNode[] {
  return [
    ptNode(`${id}-a`, "item", { width: 280, height: 56 }, {
      props: { title: first.title, label: first.title, description: first.body },
    }),
    ptNode(`${id}-b`, "item", { width: 280, height: 56 }, {
      y: 56,
      props: { title: second.title, label: second.title, description: second.body },
    }),
  ];
}

function sectionsOf(node: PtNode): PtNode[] {
  if ((node.children ?? []).length >= 2) return node.children ?? [];
  const options = node.options && node.options.length >= 2 ? node.options : pairOptions();
  return options.map((option, index) =>
    ptNode(`${node.id}-${option.value}`, "item", { width: node.width, height: 48 }, {
      y: index * 48,
      props: { title: option.label, label: option.label, description: propText(node, "description", "Details") },
    }),
  );
}

function AccordionLike({
  node,
  mode,
  onCommit,
  onAction,
  allowCollapse,
}: PtRendererProps & { allowCollapse: boolean }): ReactElement {
  const sections = sectionsOf(node);
  const openId = node.value || (node.checked === false ? "" : sections[0]?.id);
  return (
    <ControlRoot node={node} mode={mode}>
      <div style={{ ...FILL, display: "flex", flexDirection: "column", border: `1px solid ${T.border}`, borderRadius: T.radius, overflow: "hidden" }}>
        {sections.map((section) => {
          const open = section.id === openId;
          const title = propText(section, "title", propText(section, "label", "Section"));
          const body = propText(section, "description", "Details");
          return (
            <div key={section.id} data-pt-child={section.id} style={{ borderTop: `1px solid ${T.border}` }}>
              <button
                type="button"
                aria-expanded={open}
                onClick={() => {
                  const next = open && allowCollapse ? "" : section.id;
                  emit(node, { value: next, checked: next !== "" }, onCommit, onAction);
                }}
                style={{
                  ...ghostBtn,
                  width: "100%",
                  border: "none",
                  borderRadius: 0,
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "center",
                  padding: "10px 12px",
                  fontWeight: 500,
                }}
              >
                <span>{title}</span>
                <ChevronDown
                  size={14}
                  data-pt-chevron=""
                  style={{
                    transform: open ? "rotate(180deg)" : "rotate(0deg)",
                    transition: "transform 200ms ease",
                    flexShrink: 0,
                  }}
                />
              </button>
              {open ? (
                <div style={{ padding: "0 12px 12px", fontSize: 13, color: T.muted, lineHeight: 1.45 }}>{body}</div>
              ) : null}
            </div>
          );
        })}
      </div>
    </ControlRoot>
  );
}

export const accordionModule: PtComponentModule = {
  type: "accordion",
  defaultBBox: accordionBBox,
  defaultNode: (id) =>
    ptNode(id, "accordion", accordionBBox, {
      props: { title: "Accordion" },
      value: `${id}-a`,
      checked: true,
      children: sectionItems(
        id,
        { title: "Is it accessible?", body: "Yes. It uses semantic markup." },
        { title: "Is it styled?", body: "Yes. It uses real DOM, not a wireframe." },
      ),
    }),
  Renderer: (props) => <AccordionLike {...props} allowCollapse={false} />,
  agentDescription: "Expandable sections. children are item nodes; value is the open item id.",
  xmlExample: `<accordion id="faq" value="faq-a" x="0" y="0" width="280" height="160">
  <item id="faq-a" title="Is it accessible?" description="Yes. It uses semantic markup." x="0" y="0" width="280" height="56"/>
  <item id="faq-b" title="Is it styled?" description="Yes. It uses real DOM." x="0" y="56" width="280" height="56"/>
</accordion>`,
  inspectorFields: TITLE_FIELDS,
};

export const collapsibleModule: PtComponentModule = {
  type: "collapsible",
  defaultBBox: collapsibleBBox,
  defaultNode: (id) =>
    ptNode(id, "collapsible", collapsibleBBox, {
      props: { title: "Collapsible" },
      value: `${id}-a`,
      checked: true,
      children: sectionItems(
        id,
        { title: "Can I toggle this?", body: "Yes. Interact commits checked and value." },
        { title: "Second section", body: "A second collapsible item." },
      ),
    }),
  Renderer: (props) => <AccordionLike {...props} allowCollapse />,
  agentDescription: "Two collapsible items. Interact toggles value and checked.",
  xmlExample: `<collapsible id="more" value="more-a" checked="true" x="0" y="0" width="280" height="140">
  <item id="more-a" title="Can I toggle this?" description="Yes." x="0" y="0" width="280" height="56"/>
  <item id="more-b" title="Second section" description="Another item." x="0" y="56" width="280" height="56"/>
</collapsible>`,
  inspectorFields: TITLE_FIELDS,
};

function BreadcrumbRenderer({ node, mode, onCommit, onAction }: PtRendererProps): ReactElement {
  const crumbs =
    node.options && node.options.length >= 2
      ? node.options
      : [
          { value: "home", label: "Home" },
          { value: "library", label: "Library" },
        ];
  return (
    <ControlRoot node={node} mode={mode}>
      <nav aria-label={propText(node, "title", "Breadcrumb")} style={{ ...FILL, display: "flex", alignItems: "center", gap: 6, fontSize: 13 }}>
        {crumbs.map((crumb, index) => (
          <span key={crumb.value} style={{ display: "flex", alignItems: "center", gap: 6 }}>
            {index > 0 ? <span style={{ color: T.muted }}>/</span> : null}
            <button
              type="button"
              onClick={() => emit(node, { value: crumb.value }, onCommit, onAction)}
              style={{
                ...ghostBtn,
                border: "none",
                background: "transparent",
                padding: 0,
                color: index === crumbs.length - 1 ? T.fg : T.muted,
                fontWeight: index === crumbs.length - 1 ? 500 : 400,
              }}
            >
              {crumb.label}
            </button>
          </span>
        ))}
      </nav>
    </ControlRoot>
  );
}

export const breadcrumbModule: PtComponentModule = {
  type: "breadcrumb",
  defaultBBox: breadcrumbBBox,
  defaultNode: (id) =>
    ptNode(id, "breadcrumb", breadcrumbBBox, {
      props: { title: "Breadcrumb" },
      value: "library",
      options: [
        { value: "home", label: "Home" },
        { value: "library", label: "Library" },
      ],
    }),
  Renderer: BreadcrumbRenderer,
  agentDescription: "Trail of at least two segments. options are crumbs; click commits value.",
  xmlExample: `<breadcrumb id="trail" title="Breadcrumb" value="library" x="0" y="0" width="280" height="28">
  <option value="home">Home</option>
  <option value="library">Library</option>
</breadcrumb>`,
  inspectorFields: [{ key: "title", kind: "text" }],
};

function PaginationRenderer({ node, mode, onCommit, onAction }: PtRendererProps): ReactElement {
  const pages =
    node.options && node.options.length > 0
      ? node.options
      : [
          { value: "1", label: "1" },
          { value: "2", label: "2" },
          { value: "3", label: "3" },
        ];
  const current = node.value ?? pages[0]?.value ?? "1";
  const index = Math.max(0, pages.findIndex((page) => page.value === current));
  const go = (next: string) => emit(node, { value: next }, onCommit, onAction, "change");
  const pageBtn = (active: boolean): CSSProperties => ({
    ...ghostBtn,
    minWidth: 28,
    padding: "6px 8px",
    background: active ? T.primary : T.bg,
    color: active ? T.primaryFg : T.fg,
    border: `1px solid ${active ? T.primary : T.border}`,
  });
  return (
    <ControlRoot node={node} mode={mode}>
      <nav aria-label="Pagination" style={{ ...FILL, display: "flex", alignItems: "center", gap: 6 }}>
        <button
          type="button"
          disabled={index <= 0}
          onClick={() => {
            const prev = pages[index - 1];
            if (prev) go(prev.value);
          }}
          style={ghostBtn}
        >
          Prev
        </button>
        {pages.map((page) => (
          <button
            key={page.value}
            type="button"
            aria-current={page.value === current ? "page" : undefined}
            onClick={() => go(page.value)}
            style={pageBtn(page.value === current)}
          >
            {page.label}
          </button>
        ))}
        <button
          type="button"
          disabled={index >= pages.length - 1}
          onClick={() => {
            const next = pages[index + 1];
            if (next) go(next.value);
          }}
          style={ghostBtn}
        >
          Next
        </button>
      </nav>
    </ControlRoot>
  );
}

export const paginationModule: PtComponentModule = {
  type: "pagination",
  defaultBBox: paginationBBox,
  defaultNode: (id) =>
    ptNode(id, "pagination", paginationBBox, {
      value: "1",
      options: [
        { value: "1", label: "1" },
        { value: "2", label: "2" },
        { value: "3", label: "3" },
      ],
    }),
  Renderer: PaginationRenderer,
  agentDescription: "Page buttons. Clicking a page commits value.",
  xmlExample: `<pagination id="pages" value="1" x="0" y="0" width="220" height="36">
  <option value="1">1</option>
  <option value="2">2</option>
</pagination>`,
  inspectorFields: LABEL_FIELD,
};

function SidebarRenderer({ node, mode, onCommit, onAction }: PtRendererProps): ReactElement {
  const title = propText(node, "title", "Workspace");
  const items = (node.children ?? []).length > 0
    ? node.children ?? []
    : [
        ptNode(`${node.id}-home`, "item", { width: 188, height: 40 }, { props: { title: "Home", label: "Home" } }),
        ptNode(`${node.id}-inbox`, "item", { width: 188, height: 40 }, { props: { title: "Inbox", label: "Inbox" } }),
      ];
  return (
    <ControlRoot node={node} mode={mode}>
      <aside
        style={{
          ...FILL,
          background: T.mutedBg,
          border: `1px solid ${T.border}`,
          borderRadius: T.radius,
          padding: 12,
          display: "flex",
          flexDirection: "column",
          gap: 8,
          overflow: "auto",
        }}
      >
        <div style={{ fontSize: 14, fontWeight: 600, padding: "4px 4px 8px" }}>{title}</div>
        {node.children && node.children.length > 0
          ? renderFlowChildren(node, mode, onCommit, onAction)
          : items.map((item) => (
              <div key={item.id} data-pt-child={item.id} style={{ height: 40 }}>
                <button
                  type="button"
                  onClick={() => emit(node, { value: item.id }, onCommit, onAction)}
                  style={{ ...ghostBtn, width: "100%", textAlign: "left" }}
                >
                  {propText(item, "title", propText(item, "label", "Item"))}
                </button>
              </div>
            ))}
      </aside>
    </ControlRoot>
  );
}

export const sidebarModule: PtComponentModule = {
  type: "sidebar",
  defaultBBox: sidebarBBox,
  defaultNode: (id) =>
    ptNode(id, "sidebar", sidebarBBox, {
      props: { title: "Workspace" },
      children: [
        ptNode(`${id}-home`, "item", { width: 196, height: 48 }, {
          x: 12,
          y: 44,
          props: { title: "Home", label: "Home", description: "Overview" },
        }),
        ptNode(`${id}-inbox`, "item", { width: 196, height: 48 }, {
          x: 12,
          y: 100,
          props: { title: "Inbox", label: "Inbox", description: "Messages" },
        }),
        ptNode(`${id}-settings`, "item", { width: 196, height: 48 }, {
          x: 12,
          y: 156,
          props: { title: "Settings", label: "Settings", description: "Preferences" },
        }),
      ],
    }),
  Renderer: SidebarRenderer,
  agentDescription: "Side navigation with a title and item children.",
  xmlExample: `<sidebar id="nav" title="Workspace" x="0" y="0" width="220" height="280">
  <item id="nav-home" title="Home" x="12" y="44" width="196" height="48"/>
  <item id="nav-inbox" title="Inbox" x="12" y="100" width="196" height="48"/>
</sidebar>`,
  inspectorFields: [{ key: "title", kind: "text" }],
};

function TabsRenderer({ node, mode, onCommit, onAction }: PtRendererProps): ReactElement {
  const tabs =
    node.options && node.options.length >= 2
      ? node.options
      : pairOptions();
  const current = node.value ?? tabs[0]?.value ?? "a";
  const index = Math.max(0, tabs.findIndex((tab) => tab.value === current));
  const panels = node.children ?? [];
  const panel = panels[index];
  return (
    <ControlRoot node={node} mode={mode}>
      <div style={{ ...FILL, display: "flex", flexDirection: "column", gap: 8, padding: 8, boxSizing: "border-box" }}>
        <div
          role="tablist"
          data-pt-tabs-list=""
          style={{
            display: "flex",
            width: "fit-content",
            maxWidth: "100%",
            alignItems: "center",
            gap: 2,
            padding: 4,
            borderRadius: T.radius,
            background: T.mutedBg,
          }}
        >
          {tabs.map((tab) => {
            const selected = tab.value === current;
            return (
              <button
                key={tab.value}
                type="button"
                role="tab"
                aria-selected={selected}
                onClick={() => emit(node, { value: tab.value }, onCommit, onAction)}
                style={{
                  appearance: "none",
                  position: "relative",
                  border: "none",
                  background: "transparent",
                  color: selected ? T.fg : T.muted,
                  padding: "6px 12px",
                  fontSize: 13,
                  fontFamily: FONT,
                  fontWeight: selected ? 500 : 400,
                  cursor: "pointer",
                  lineHeight: 1.2,
                  borderRadius: T.radius,
                }}
              >
                {tab.label}
                {selected ? (
                  <span
                    data-pt-tabs-indicator=""
                    aria-hidden="true"
                    style={{
                      position: "absolute",
                      left: 8,
                      right: 8,
                      bottom: 0,
                      height: 2,
                      borderRadius: 1,
                      background: T.primary,
                    }}
                  />
                ) : null}
              </button>
            );
          })}
        </div>
        <div role="tabpanel" style={{ padding: "4px 2px", flex: 1, minHeight: 0, overflow: "auto", position: "relative" }}>
          {panel ? (
            <div data-pt-child={panel.id} style={{ minHeight: 48 }}>
              {propText(panel, "description", propText(panel, "title", tabs[index]?.label ?? "Panel"))}
            </div>
          ) : (
            <div>{propText(node, "description", tabs[index]?.label ?? "Panel")}</div>
          )}
        </div>
      </div>
    </ControlRoot>
  );
}

export const tabsModule: PtComponentModule = {
  type: "tabs",
  defaultBBox: tabsBBox,
  defaultNode: (id) =>
    ptNode(id, "tabs", tabsBBox, {
      props: { title: "Tabs", description: "Account panel" },
      value: "account",
      options: [
        { value: "account", label: "Account" },
        { value: "password", label: "Password" },
      ],
      children: [
        ptNode(`${id}-account`, "typography", { width: 248, height: 72 }, {
          x: 16,
          y: 56,
          props: { title: "Account", description: "Manage your account details." },
        }),
        ptNode(`${id}-password`, "typography", { width: 248, height: 72 }, {
          x: 16,
          y: 56,
          props: { title: "Password", description: "Change your password." },
        }),
      ],
    }),
  Renderer: TabsRenderer,
  agentDescription: "Tab list. options are tabs; value is the selected tab; children are panels.",
  xmlExample: `<tabs id="settings" value="account" x="0" y="0" width="280" height="160">
  <option value="account">Account</option>
  <option value="password">Password</option>
  <typography id="settings-account" title="Account" description="Manage your account details." x="16" y="56" width="248" height="72"/>
</tabs>`,
  inspectorFields: TITLE_FIELDS,
};

function CarouselRenderer({ node, mode, onCommit, onAction }: PtRendererProps): ReactElement {
  const slides = (node.children ?? []).length >= 2
    ? node.children ?? []
    : [
        ptNode(`${node.id}-s1`, "item", { width: node.width, height: node.height }, { props: { title: "Slide 1", label: "Slide 1" } }),
        ptNode(`${node.id}-s2`, "item", { width: node.width, height: node.height }, { props: { title: "Slide 2", label: "Slide 2" } }),
      ];
  const current = node.value ?? slides[0]?.id ?? "";
  const index = Math.max(0, slides.findIndex((slide) => slide.id === current));
  const slide = slides[index]!;
  const go = (nextIndex: number) => {
    const next = slides[(nextIndex + slides.length) % slides.length];
    if (next) emit(node, { value: next.id }, onCommit, onAction);
  };
  return (
    <ControlRoot node={node} mode={mode}>
      <div style={{ ...FILL, display: "flex", alignItems: "center", gap: 8, border: `1px solid ${T.border}`, borderRadius: T.radius, padding: 8 }}>
        <button type="button" aria-label="Previous slide" onClick={() => go(index - 1)} style={ghostBtn}>
          <ChevronLeft size={16} />
        </button>
        <div data-pt-child={slide.id} style={{ flex: 1, textAlign: "center", fontWeight: 500 }}>
          {propText(slide, "title", propText(slide, "label", `Slide ${index + 1}`))}
        </div>
        <button type="button" aria-label="Next slide" onClick={() => go(index + 1)} style={ghostBtn}>
          <ChevronRight size={16} />
        </button>
      </div>
    </ControlRoot>
  );
}

export const carouselModule: PtComponentModule = {
  type: "carousel",
  defaultBBox: carouselBBox,
  defaultNode: (id) =>
    ptNode(id, "carousel", carouselBBox, {
      value: `${id}-s1`,
      children: [
        ptNode(`${id}-s1`, "item", { width: 268, height: 80 }, {
          x: 16,
          y: 30,
          props: { title: "Slide 1", label: "Slide 1", description: "First slide" },
        }),
        ptNode(`${id}-s2`, "item", { width: 268, height: 80 }, {
          x: 16,
          y: 30,
          props: { title: "Slide 2", label: "Slide 2", description: "Second slide" },
        }),
      ],
    }),
  Renderer: CarouselRenderer,
  agentDescription: "Slideshow. children are slides; value is the visible slide id.",
  xmlExample: `<carousel id="hero" value="hero-s1" x="0" y="0" width="300" height="140">
  <item id="hero-s1" title="Slide 1" x="16" y="30" width="268" height="80"/>
  <item id="hero-s2" title="Slide 2" x="16" y="30" width="268" height="80"/>
</carousel>`,
  inspectorFields: LABEL_FIELD,
};
