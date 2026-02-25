# Frontend Review Checklist

## React / Component-Based Frameworks

### Component Design
- [ ] Component does one thing (SRP) — split if > 300 lines
- [ ] Props are well-typed with TypeScript interfaces (no `any`)
- [ ] Default props are handled correctly
- [ ] Component does not accept too many props (> 10 = design smell)
- [ ] Presentational and container logic are separated
- [ ] Components are composable and reusable where appropriate

### Hooks & State Management

#### useEffect Abuse (Most Common Anti-Pattern)
```typescript
// ❌ WRONG: Derived state in useEffect
const [firstName, setFirstName] = useState('');
const [fullName, setFullName] = useState('');
useEffect(() => {
  setFullName(firstName + ' ' + lastName);
}, [firstName, lastName]);

// ✅ CORRECT: Compute during render
const fullName = firstName + ' ' + lastName;
```

```typescript
// ❌ WRONG: Event logic in useEffect
useEffect(() => {
  if (product.isInCart) showNotification('Added!');
}, [product]);

// ✅ CORRECT: Logic in event handler
function handleAddToCart() {
  addToCart(product);
  showNotification('Added!');
}
```

#### General Hooks Rules
- [ ] No conditional hook calls (violates Rules of Hooks)
- [ ] Dependency arrays are complete (no eslint-disable for exhaustive-deps)
- [ ] `useEffect` has cleanup when subscribing to external resources
- [ ] `useMemo` / `useCallback` are justified (not premature optimization)
- [ ] Custom hooks follow `use` prefix naming convention
- [ ] No hooks defined inside loops, conditions, or nested functions

### State Management
- [ ] Server state uses proper library (TanStack Query, SWR) — never copied to local state
- [ ] State is colocated (lives as close to usage as possible)
- [ ] Prop drilling is limited (< 3 levels, otherwise use context or composition)
- [ ] Global state is minimal (only truly global concerns)
- [ ] Form state is managed properly (controlled vs uncontrolled)

### State Mutation Detection
```typescript
// ❌ WRONG: Mutations (causes silent failures)
items.push(newItem);
setItems(items);

arr[i] = newValue;
setArr(arr);

obj.key = newValue;
setObj(obj);

// ✅ CORRECT: Immutable updates
setItems([...items, newItem]);
setArr(arr.map((x, idx) => idx === i ? newValue : x));
setObj({ ...obj, key: newValue });
```

### Rendering Performance
- [ ] No unnecessary re-renders (check with React DevTools Profiler)
- [ ] `key` prop uses stable unique ID (not array index for dynamic lists)
- [ ] Heavy computations are memoized where justified
- [ ] Expensive components use `React.memo` when props rarely change
- [ ] Large lists use virtualization (react-window, tanstack-virtual)
- [ ] No component definitions inside other components (causes remount every render)

### React 19 Specific (if applicable)
- [ ] `useFormStatus` is used in a *child* component, not in the same component as `<form>`
- [ ] `use()` hook does not create new Promise inside render (causes infinite loop)
- [ ] `useActionState` is used for form actions instead of manual state management
- [ ] `useOptimistic` is used correctly for optimistic UI updates

## Vue Specific (if applicable)
- [ ] Composition API preferred over Options API for new code
- [ ] `ref` vs `reactive` used appropriately
- [ ] `computed` used for derived state (not watchers)
- [ ] Template refs are typed correctly
- [ ] `defineProps` / `defineEmits` are used with TypeScript generics

## TypeScript
- [ ] No `any` type without explicit justification (comment required)
- [ ] Function return types are explicit for public APIs
- [ ] Generic types are used where appropriate (no unnecessary casting)
- [ ] Discriminated unions preferred over boolean flags
- [ ] `noUncheckedIndexedAccess` compliance (arr[i] may be undefined)
- [ ] Enums use `const enum` or string unions where possible

## CSS / Styling
- [ ] No inline styles for anything beyond truly dynamic values
- [ ] Responsive design works at common breakpoints (mobile, tablet, desktop)
- [ ] No hardcoded pixel values for spacing (use design system tokens)
- [ ] Dark mode considered (CSS variables or themed approach)
- [ ] No `z-index` wars (use stacking context system)
- [ ] No `!important` without justification

## Accessibility
- [ ] Interactive elements are keyboard accessible
- [ ] Images have meaningful `alt` text
- [ ] Form inputs have associated labels
- [ ] ARIA attributes are correct (not overused)
- [ ] Color is not the sole indicator of state
- [ ] Focus management for modals and navigation

## Client-Side Security
- [ ] No `dangerouslySetInnerHTML` / `v-html` without sanitization
- [ ] User input in URLs is encoded
- [ ] Sensitive data not stored in localStorage (use httpOnly cookies)
- [ ] No secrets or API keys in client-side code
- [ ] External links use `rel="noopener noreferrer"`

## Error Handling
- [ ] Error boundaries (React) or error handling (Vue) around critical sections
- [ ] API error states are handled (loading, error, empty states all covered)
- [ ] Form validation shows clear, actionable error messages
- [ ] Network failures have retry/fallback mechanisms
- [ ] Async errors are caught (no unhandled promise rejections)

## Questions to Ask
- "What happens if this API call fails?"
- "What does this look like on mobile?"
- "What happens if the list is empty?"
- "Does this component re-render unnecessarily?"
- "Is this state truly needed, or can it be derived?"
