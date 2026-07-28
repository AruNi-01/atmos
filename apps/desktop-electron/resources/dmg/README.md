# DMG installer backdrop

Ultra-minimal classic install window (no brand art / no Atmos title).

| File | Role |
|------|------|
| `background.png` | @1x 540×380 |
| `background@2x.png` | Retina 1080×760 |

Contents:

- Top: slogan only — `Atmosphere for Agentic Builders`
- Center: solid arrow (App + Applications from Finder)
- Bottom: `Drag **Atmos** to Applications to install`

```bash
python3 scripts/generate-dmg-background.py
```

Align `electron-builder.yml` `dmg.contents` with script `ICON_L` / `ICON_R` / `ICON_Y`.
