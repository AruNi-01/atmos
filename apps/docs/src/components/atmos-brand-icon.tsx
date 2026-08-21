import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

const ICON_CANDIDATES = [
  join(process.cwd(), 'src/app/icon.png'),
  join(process.cwd(), 'apps/docs/src/app/icon.png'),
];

function iconDataUrl(): string {
  for (const path of ICON_CANDIDATES) {
    if (existsSync(path)) {
      return `data:image/png;base64,${readFileSync(path).toString('base64')}`;
    }
  }
  throw new Error('Atmos docs icon.png is missing');
}

/**
 * App icon plate for Open Graph cards.
 * next/og (Satori) cannot paint the CSS-mask LogoSvg, so this is a PNG.
 */
export function AtmosBrandIcon({ size = 56 }: { size?: number }) {
  return (
    // ImageResponse has no next/image.
    // eslint-disable-next-line @next/next/no-img-element
    <img src={iconDataUrl()} width={size} height={size} alt="" />
  );
}
