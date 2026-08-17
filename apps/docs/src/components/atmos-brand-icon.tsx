import LogoSvg from '@workspace/ui/components/logo-svg';
import type { ComponentProps } from 'react';

/** Atmos planet-ring mark — same raster as the app icon. */
export function AtmosBrandIcon({ size = 56 }: { size?: number }) {
  return <LogoSvg height={size} className="w-auto" />;
}
