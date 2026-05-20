/** Atmos concentric-orbit mark (matches `app/icon.svg` and `@workspace/ui` LogoSvg). */
export function AtmosBrandIcon({ size = 56 }: { size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 32 32"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
    >
      <circle cx="16" cy="16" r="7" stroke="currentColor" strokeWidth="2.5" />
      <circle cx="16" cy="16" r="11" stroke="currentColor" strokeWidth="1.5" opacity="0.6" />
      <circle
        cx="16"
        cy="16"
        r="15"
        stroke="currentColor"
        strokeWidth="0.5"
        opacity="0.3"
        strokeDasharray="4 4"
      />
    </svg>
  );
}
