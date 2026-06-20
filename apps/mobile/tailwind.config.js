/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ["./app/**/*.{ts,tsx}", "./src/**/*.{ts,tsx}"],
  presets: [require("nativewind/preset")],
  theme: {
    extend: {
      colors: {
        "sf-bg": "rgb(242 242 247)",
        "sf-card": "rgb(255 255 255)",
        "sf-label": "rgb(17 24 39)",
        "sf-secondary": "rgb(99 99 102)",
        "sf-blue": "rgb(0 122 255)",
        "sf-green": "rgb(52 199 89)",
        "sf-red": "rgb(255 59 48)",
      },
    },
  },
};
