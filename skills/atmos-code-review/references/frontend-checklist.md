# Frontend Review Checklist

Applies to: `.tsx`, `.ts`, `.jsx`, `.js`, `.css`, `.vue`, `.svelte`

## Correctness

- [ ] No stale closures in `useEffect` / event handlers (missing deps)
- [ ] No mutation of state directly (`arr.push()`, `obj.key = val` before `setState`)
- [ ] Async operations have error handling (`try/catch` or `.catch()`)
- [ ] Race conditions in concurrent fetches (use abort controllers or query deduplication)
- [ ] No `undefined` / `null` access without guard (`?.`, nullish checks)

## React-Specific (if applicable)

**useEffect anti-patterns** — flag immediately:
```tsx
// ❌ Derived state in useEffect (use useMemo instead)
useEffect(() => { setFull(first + last); }, [first, last]);

// ❌ Event logic in useEffect (put in handler)
useEffect(() => { if (added) showToast(); }, [added]);

// ❌ Promise created in render (infinite loop with React 19 `use`)
const data = use(fetch('/api')); // new Promise every render
```

- [ ] No component defined inside another component (remounts every render)
- [ ] Keys in lists are stable and unique (not array index for dynamic lists)
- [ ] `useCallback` / `useMemo` used only when there is a measurable benefit, not prematurely
- [ ] Forms use controlled inputs consistently (no mixing controlled/uncontrolled)

## State Management

| Data type | Correct solution |
|-----------|-----------------|
| Server / async data | React Query / SWR — never copy to `useState` |
| Global UI state | Zustand / Jotai / Context |
| Component-local state | `useState` / `useReducer` |
| Derived values | Computed inline or `useMemo` — not `useEffect` + `setState` |

```tsx
// ❌ Never copy server data to local state
const { data } = useQuery(...);
const [items, setItems] = useState([]);
useEffect(() => setItems(data), [data]); // anti-pattern

// ✅ Query IS the source of truth
const { data: items } = useQuery(...);
```

## TypeScript

- [ ] No `any` — use `unknown` + type narrowing or proper generics
- [ ] Array index access guarded (`arr[i]` can be `undefined`)
- [ ] No `as` casts that bypass runtime checks
- [ ] Props interfaces are explicit (avoid `React.FC` with generic components)
- [ ] Discriminated unions used for variant types instead of optional fields

## Performance

- [ ] No expensive computation in render without `useMemo`
- [ ] Large lists virtualized (react-window / tanstack-virtual)
- [ ] Images have explicit dimensions (avoid layout shift)
- [ ] No barrel file (`index.ts`) re-exports in hot paths (bundle bloat)
- [ ] Dynamic imports (`React.lazy`) for heavy components not needed on initial load

## Security

- [ ] No `dangerouslySetInnerHTML` with unsanitized user input (XSS)
- [ ] No sensitive data (tokens, keys) in component state or localStorage without encryption
- [ ] External URLs validated before use in `href` / `src`
- [ ] No `eval()` or `new Function()` with user input

## Accessibility

- [ ] Interactive elements are keyboard-accessible (`button`, not `div onClick`)
- [ ] Images have `alt` text
- [ ] Form inputs have associated `<label>`
- [ ] Color is not the only means of conveying information
