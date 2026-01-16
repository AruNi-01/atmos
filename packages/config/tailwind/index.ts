// Shared Tailwind CSS v4 configuration
// In Tailwind v4, configuration is primarily done in CSS using @theme
// This file provides shared JavaScript utilities and theme tokens

// Shared color palette (can be used in CSS via @theme)
export const colors = {
  // Brand colors
  brand: {
    50: "oklch(0.985 0 0)",
    100: "oklch(0.967 0.001 286.375)",
    200: "oklch(0.92 0.004 286.32)",
    300: "oklch(0.871 0.006 286.286)",
    400: "oklch(0.705 0.015 286.067)",
    500: "oklch(0.552 0.016 285.938)",
    600: "oklch(0.442 0.017 285.786)",
    700: "oklch(0.37 0.013 285.805)",
    800: "oklch(0.274 0.006 286.033)",
    900: "oklch(0.21 0.006 285.885)",
    950: "oklch(0.141 0.005 285.823)",
  },
};

// Shared font family configuration
export const fontFamily = {
  sans: ["var(--font-geist-sans)", "system-ui", "sans-serif"],
  mono: ["var(--font-geist-mono)", "monospace"],
};

// Shared animation configuration
export const animation = {
  "accordion-down": "accordion-down 0.2s ease-out",
  "accordion-up": "accordion-up 0.2s ease-out",
  "fade-in": "fade-in 0.3s ease-out",
  "fade-out": "fade-out 0.3s ease-out",
  "slide-in": "slide-in 0.3s ease-out",
  "slide-out": "slide-out 0.3s ease-out",
};

// Shared keyframes
export const keyframes = {
  "accordion-down": {
    from: { height: "0" },
    to: { height: "var(--radix-accordion-content-height)" },
  },
  "accordion-up": {
    from: { height: "var(--radix-accordion-content-height)" },
    to: { height: "0" },
  },
  "fade-in": {
    from: { opacity: "0" },
    to: { opacity: "1" },
  },
  "fade-out": {
    from: { opacity: "1" },
    to: { opacity: "0" },
  },
  "slide-in": {
    from: { transform: "translateY(10px)", opacity: "0" },
    to: { transform: "translateY(0)", opacity: "1" },
  },
  "slide-out": {
    from: { transform: "translateY(0)", opacity: "1" },
    to: { transform: "translateY(10px)", opacity: "0" },
  },
};

// Shared border radius
export const borderRadius = {
  sm: "calc(var(--radius) - 4px)",
  md: "calc(var(--radius) - 2px)",
  lg: "var(--radius)",
  xl: "calc(var(--radius) + 4px)",
  "2xl": "calc(var(--radius) + 8px)",
};
