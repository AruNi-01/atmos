/** Soft client navigation hook used by SPA smoke/stateful e2e tests. */
interface Window {
  __atmosNavigate?: (href: string) => void;
}
