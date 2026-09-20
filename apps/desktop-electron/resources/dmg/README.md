# DMG installer backdrop

Landscape plus sharp overlays. Finder still supplies **Atmos.app** and the icon-name labels.

| File | Role |
|------|------|
| `background.png` | @1x 642×406 |
| `background@2x.png` | Retina 1284×812 |
| `applications-folder.png` | Dmgly Applications glyph (composited + alias icon) |

Icon centers (`electron-builder.yml` `dmg.contents`):

- Atmos.app: (95, 72)
- Applications: (367, 213)
- `iconSize`: 128

```bash
python3 scripts/generate-dmg-background.py /path/to/landscape.png
```

After packaging, `scripts/stamp-dmg-applications-alias.ts` turns the `/Applications` symlink into a Finder alias using `applications-folder.png`, so macOS 26 does not leave an empty well.
