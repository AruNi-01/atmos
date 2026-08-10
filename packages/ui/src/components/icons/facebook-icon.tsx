"use client";

import type { HTMLAttributes } from "react";
import { forwardRef } from "react";

import { cn } from "@/lib/utils";

/**
 * Facebook brand mark.
 * Fill uses currentColor so light UI renders dark mark and dark UI renders light mark.
 */
interface FacebookIconProps extends HTMLAttributes<SVGSVGElement> {
  size?: number;
}

const FacebookIcon = forwardRef<SVGSVGElement, FacebookIconProps>(
  ({ className, size = 24, ...props }, ref) => {
    return (
      <svg
        ref={ref}
        className={cn("shrink-0", className)}
        height={size}
        role="img"
        viewBox="0 0 24 24"
        width={size}
        xmlns="http://www.w3.org/2000/svg"
        aria-hidden={props["aria-label"] ? undefined : true}
        {...props}
      >
        <title>Facebook</title>
        <path
          d="M9.101 23.691v-7.98H6.627v-3.667h2.474v-1.58c0-4.085 1.848-5.978 5.858-5.978.401 0 .955.042 1.468.103a8.68 8.68 0 0 1 1.141.195v3.325a8.623 8.623 0 0 0-.653-.036 26.805 26.805 0 0 0-.733-.009c-.707 0-1.259.096-1.675.309a1.686 1.686 0 0 0-.679.622c-.258.42-.374.995-.374 1.752v1.297h3.919l-.386 2.103-.287 1.564h-3.246v8.245C19.396 23.238 24 18.179 24 12.044c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.628 3.874 10.35 9.101 11.647Z"
          fill="currentColor"
        />
      </svg>
    );
  },
);

FacebookIcon.displayName = "FacebookIcon";

export { FacebookIcon };
