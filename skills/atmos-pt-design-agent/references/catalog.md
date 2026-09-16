# Catalog (on-demand)

Which PTX tags exist. Always call `pt_catalog_list` for `xmlExample` / `agentDescription` / `defaultBBox` — this file is a reading aid, not a substitute.

Copy the `xmlExample` from the catalog. Do not invent Excalidraw JSON.

Palette and catalog `xmlExample` buttons have **no** click handler. Interact clicks are local UI (press, toggle, type). Only add `<on event="click"><action type="agent" name="…"/></on>` when the prototype should notify the host — for example a dedicated Run control, not Sign in Continue.

---

## XML, not place

Agents edit `document.ptx`. Nested catalog tags become `children` inside a parent overlay (for example a `<card>` containing `<input>` and `<button>`). Spatial attrs `x` `y` `width` `height` are required. `rotation` is optional degrees.

Dotted catalog ids use a hyphen in XML: `block.auth-form` → `<block-auth-form>`, `chart.area-default` → `<chart-area-default>`.

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

---

## Charts

The Charts catalog is first-class. `pt_catalog_list` returns **70** gallery types (`chart.area-*`, `chart.bar-*`, `chart.line-*`, `chart.pie-*`, `chart.radar-*`, `chart.radial-*`, `chart.tooltip-*`) plus a leftover generic `chart` stub. For dashboards and metrics, copy a gallery `xmlExample` — do not draw axes as rectangles, and do not invent recharts/JSON.

Families (pick a variant from `pt_catalog_list`):

| Family | Catalog prefix | XML tag prefix |
|--------|----------------|----------------|
| Area | `chart.area-` | `<chart-area-…>` |
| Bar | `chart.bar-` | `<chart-bar-…>` |
| Line | `chart.line-` | `<chart-line-…>` |
| Pie | `chart.pie-` | `<chart-pie-…>` |
| Radar | `chart.radar-` | `<chart-radar-…>` |
| Radial | `chart.radial-` | `<chart-radial-…>` |
| Tooltip demos | `chart.tooltip-` | `<chart-tooltip-…>` |

Sketch charts, not live data. Nested `<option>` rows are the series: label is the category; `value` is a number, or comma-separated numbers for multiple series. `title`, `description`, and `footer` are optional text.

```xml
<page id="metrics">
  <chart-area-default id="visitors" title="Area Chart" description="Showing total visitors for the last 6 months" x="40" y="40" width="360" height="300">
    <option value="186">Jan</option>
    <option value="305">Feb</option>
    <option value="237">Mar</option>
  </chart-area-default>
  <chart-bar-multiple id="channels" title="Bar Chart - Multiple" x="420" y="40" width="360" height="300">
    <option value="186,80">Jan</option>
    <option value="305,200">Feb</option>
  </chart-bar-multiple>
</page>
```

Generic `<chart>` is a small bar/line stub. Prefer a `chart.*` gallery type when the prototype needs a real chart.
