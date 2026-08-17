/** Atmos planet-ring mark (matches `app/icon.svg` and `@workspace/ui` LogoSvg). */
export function AtmosBrandIcon({ size = 56 }: { size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 32 32"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
    >
      <g fill="currentColor">
        <path d="M0 16Q16 14.6 32 16Q16 17.4 0 16Z" />
        <g transform="rotate(51 15.069 15.767)">
          <path
            fillRule="evenodd"
            d="M11.096 15.767a3.973 19.587 0 1 0 7.946 0a3.973 19.587 0 1 0-7.946 0zM11.582 15.767a3.487 17.193 0 1 0 6.974 0a3.487 17.193 0 1 0-6.974 0z"
          />
        </g>
        <circle cx="16" cy="16" r="7.215" />
      </g>
    </svg>
  );
}
