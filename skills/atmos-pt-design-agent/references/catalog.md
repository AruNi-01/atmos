# Catalog (on-demand)

Which PTX tags exist. Always call `pt_catalog_list` for `xmlExample` / `agentDescription` / `defaultBBox` — this file is a reading aid, not a substitute.

Copy the `xmlExample` from the catalog. Do not invent Excalidraw JSON.

---

## XML, not place

Agents edit `document.ptx`. Nested catalog tags become `children` inside a parent overlay (for example a `<card>` containing `<input>` and `<button>`). Spatial attrs `x` `y` `width` `height` are required. `rotation` is optional degrees.

Dotted block ids use a hyphen in XML: `block.auth-form` → `<block-auth-form>`.

---

## Copy a snippet

```xml
<page id="model-config">
  <select id="model" label="Model" value="claude" x="300" y="200" width="240" height="40">
    <option value="gpt-5.6">GPT-5.6</option>
    <option value="claude">Claude</option>
  </select>
  <button id="run" label="Run" x="300" y="260" width="100" height="40">
    <on event="click">
      <action type="agent" name="run"/>
    </on>
  </button>
</page>
```

Option-bearing nodes need `value` + label text. Missing `value` is `invalid_option`.
