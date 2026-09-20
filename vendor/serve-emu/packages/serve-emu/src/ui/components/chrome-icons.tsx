import type { ReactNode } from "react";

type IconProps = {
  size?: number;
};

function Svg({ size = 18, children }: IconProps & { children: ReactNode }) {
  return (
    <svg
      aria-hidden="true"
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      {children}
    </svg>
  );
}

export function PowerIcon({ size }: IconProps) {
  return (
    <Svg size={size}>
      <path d="M12 2v10" />
      <path d="M18.4 6.6a9 9 0 1 1-12.8 0" />
    </Svg>
  );
}

export function BotIcon({ size }: IconProps) {
  return (
    <Svg size={size}>
      <path d="M12 8V4H8" />
      <rect width="16" height="12" x="4" y="8" rx="2" />
      <path d="M2 14h2" />
      <path d="M20 14h2" />
      <circle cx="9" cy="13" r="1" />
      <circle cx="15" cy="13" r="1" />
    </Svg>
  );
}

export function PanelRightIcon({ size }: IconProps) {
  return (
    <Svg size={size}>
      <rect x="3" y="3" width="18" height="18" rx="2" />
      <path d="M15 3v18" />
    </Svg>
  );
}

export function CloseIcon({ size = 16 }: IconProps) {
  return (
    <Svg size={size}>
      <path d="M18 6 6 18" />
      <path d="m6 6 12 12" />
    </Svg>
  );
}

export function SearchIcon({ size = 14 }: IconProps) {
  return (
    <Svg size={size}>
      <circle cx="11" cy="11" r="7" />
      <path d="m20 20-3.5-3.5" />
    </Svg>
  );
}

function AndroidNavSvg({ size = 18, children }: IconProps & { children: ReactNode }) {
  return (
    <svg
      aria-hidden="true"
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.7"
    >
      {children}
    </svg>
  );
}

export function AndroidBackIcon({ size }: IconProps) {
  return (
    <AndroidNavSvg size={size}>
      <path d="M15.8 5.4 7.2 12l8.6 6.6Z" strokeLinejoin="miter" />
    </AndroidNavSvg>
  );
}

export function AndroidHomeIcon({ size }: IconProps) {
  return (
    <AndroidNavSvg size={size}>
      <circle cx="12" cy="12" r="6.15" />
    </AndroidNavSvg>
  );
}

export function AndroidRecentsIcon({ size }: IconProps) {
  return (
    <AndroidNavSvg size={size}>
      <rect x="6.7" y="6.7" width="10.6" height="10.6" rx="1.15" />
    </AndroidNavSvg>
  );
}

export function PhoneGlyph({ size = 18 }: IconProps) {
  return (
    <svg
      aria-hidden="true"
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.7"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <rect x="7" y="2.5" width="10" height="19" rx="2.5" />
      <path d="M10 5h4" />
    </svg>
  );
}
