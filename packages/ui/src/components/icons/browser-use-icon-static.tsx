/**
 * Static Browser Use glyph (no animation) for slash menus / dense UI.
 * App-window chrome (title bar) with top-right notch + pointer ↗ —
 * pairs with DesktopUseIconStatic (monitor + pointer).
 */
export function BrowserUseIconStatic({
  className,
  size = 16,
}: {
  className?: string;
  size?: number | string;
}) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden
    >
      {/* Window frame open at top-right (notch for the control cursor). */}
      <path d="M13 4H4a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2V10" />
      {/* Title-bar chrome (only under the closed portion of the top edge). */}
      <path d="M2 8h11" />
      <path d="M6 4v4" />
      <path d="M10 4v4" />
      {/* Click pointer on the top-right notch, tip pointing ↗. */}
      <g transform="translate(22.6 0.2) scale(-0.48 0.48)">
        <path d="M14 4.1 12 6" opacity={0.9} />
        <path d="m5.1 8-2.9-.8" opacity={0.9} />
        <path d="m6 12-1.9 2" opacity={0.9} />
        <path d="M7.2 2.2 8 5.1" opacity={0.9} />
        <path d="M9.037 9.69a.498.498 0 0 1 .653-.653l11 4.5a.5.5 0 0 1-.074.949l-4.349 1.041a1 1 0 0 0-.74.739l-1.04 4.35a.5.5 0 0 1-.95.074z" />
      </g>
    </svg>
  );
}

export default BrowserUseIconStatic;
