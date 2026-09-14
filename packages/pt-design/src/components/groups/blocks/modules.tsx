import type { PtComponentModule } from "./contract";
import { clickRun, ptNode } from "./node";
import { BlockPanel } from "./runtime";

const authBBox = { width: 360, height: 228 };
const settingsBBox = { width: 380, height: 176 };
const emptyBBox = { width: 320, height: 180 };
const navBBox = { width: 440, height: 248 };

export const authFormModule: PtComponentModule = {
  type: "block.auth-form",
  defaultBBox: authBBox,
  defaultNode: (id) =>
    ptNode(id, "block.auth-form", authBBox, {
      props: { title: "Sign in" },
      children: [
        ptNode(`${id}-email`, "input", { width: 328, height: 40 }, {
          x: 16,
          y: 52,
          props: { label: "Email", placeholder: "you@example.com" },
          value: "",
        }),
        ptNode(`${id}-password`, "input", { width: 328, height: 40 }, {
          x: 16,
          y: 100,
          props: { label: "Password", placeholder: "••••••••" },
          value: "",
        }),
        ptNode(`${id}-submit`, "button", { width: 328, height: 40 }, {
          x: 16,
          y: 156,
          props: { label: "Continue" },
          events: clickRun,
        }),
      ],
    }),
  Renderer: BlockPanel,
  agentDescription: "Sign-in card. Title is props.title. Nest email/password inputs and a submit button.",
  xmlExample: `<block-auth-form id="login" title="Sign in" x="0" y="0" width="360" height="228">
  <input id="login-email" label="Email" x="16" y="52" width="328" height="40"/>
  <input id="login-password" label="Password" x="16" y="100" width="328" height="40"/>
  <button id="login-submit" label="Continue" x="16" y="156" width="328" height="40"/>
</block-auth-form>`,
  inspectorFields: [{ key: "title", kind: "text" }],
};

export const settingsShellModule: PtComponentModule = {
  type: "block.settings-shell",
  defaultBBox: settingsBBox,
  defaultNode: (id) =>
    ptNode(id, "block.settings-shell", settingsBBox, {
      props: { title: "Settings" },
      children: [
        ptNode(`${id}-email-label`, "label", { width: 80, height: 24 }, {
          x: 16,
          y: 52,
          props: { label: "Email" },
        }),
        ptNode(`${id}-email`, "input", { width: 260, height: 32 }, {
          x: 104,
          y: 48,
          props: { label: "Email", placeholder: "you@example.com" },
          value: "",
        }),
        ptNode(`${id}-notify`, "switch", { width: 140, height: 32 }, {
          x: 16,
          y: 96,
          props: { label: "Notifications" },
          checked: true,
        }),
      ],
    }),
  Renderer: BlockPanel,
  agentDescription: "Settings card. Title is props.title. Nest labeled fields plus a switch or checkbox.",
  xmlExample: `<block-settings-shell id="prefs" title="Settings" x="0" y="0" width="380" height="176">
  <label id="prefs-email-label" label="Email" x="16" y="52" width="80" height="24"/>
  <input id="prefs-email" label="Email" x="104" y="48" width="260" height="32"/>
  <switch id="prefs-notify" label="Notifications" checked="true" x="16" y="96" width="140" height="32"/>
</block-settings-shell>`,
  inspectorFields: [{ key: "title", kind: "text" }],
};

export const emptyStateModule: PtComponentModule = {
  type: "block.empty-state",
  defaultBBox: emptyBBox,
  defaultNode: (id) =>
    ptNode(id, "block.empty-state", emptyBBox, {
      props: { title: "Nothing here", description: "Get started by creating an item." },
      children: [
        ptNode(`${id}-action`, "button", { width: 120, height: 40 }, {
          x: 100,
          y: 124,
          props: { label: "Create" },
          events: clickRun,
        }),
      ],
    }),
  Renderer: BlockPanel,
  agentDescription: "Empty-state card. Title and description in props. Nest one action button.",
  xmlExample: `<block-empty-state id="empty" title="Nothing here" description="Get started by creating an item." x="0" y="0" width="320" height="180">
  <button id="empty-action" label="Create" x="100" y="124" width="120" height="40"/>
</block-empty-state>`,
  inspectorFields: [
    { key: "title", kind: "text" },
    { key: "description", kind: "text" },
  ],
};

export const navContentModule: PtComponentModule = {
  type: "block.nav-content",
  defaultBBox: navBBox,
  defaultNode: (id) =>
    ptNode(id, "block.nav-content", navBBox, {
      props: { title: "Workspace" },
      children: [
        ptNode(`${id}-home`, "button", { width: 112, height: 36 }, {
          x: 16,
          y: 52,
          props: { label: "Home", variant: "ghost" },
          events: clickRun,
        }),
        ptNode(`${id}-settings`, "button", { width: 112, height: 36 }, {
          x: 16,
          y: 96,
          props: { label: "Settings", variant: "ghost" },
          events: clickRun,
        }),
        ptNode(`${id}-content`, "textarea", { width: 284, height: 180 }, {
          x: 140,
          y: 52,
          props: { label: "Content", placeholder: "Write here" },
          value: "",
        }),
      ],
    }),
  Renderer: BlockPanel,
  agentDescription: "Nav-plus-content card. Title is props.title. Nest nav buttons and a content field.",
  xmlExample: `<block-nav-content id="shell" title="Workspace" x="0" y="0" width="440" height="248">
  <button id="shell-home" label="Home" x="16" y="52" width="112" height="36"/>
  <button id="shell-settings" label="Settings" x="16" y="96" width="112" height="36"/>
  <textarea id="shell-content" label="Content" x="140" y="52" width="284" height="180"/>
</block-nav-content>`,
  inspectorFields: [{ key: "title", kind: "text" }],
};
