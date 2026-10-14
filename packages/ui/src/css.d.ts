declare module "*.css";
declare module "*.png" {
  // Vite/Next may emit a URL string or `{ src }`. Keep `any` so both
  // `logo-svg` (`markSrc.src`) and `auth-shell` (`Record<Variant, string>`) typecheck.
  const value: any;
  export default value;
}
