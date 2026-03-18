/**
 * Suppress React 19 ref deprecation warnings from third-party libraries
 * 
 * React 19 changed how refs work - `ref` is now a regular prop instead of
 * being accessed via `element.ref`. This causes console warnings when using
 * libraries that haven't been updated yet (like react-mosaic-component).
 * 
 * This utility suppresses these specific warnings until the libraries are updated.
 * 
 * @see https://react.dev/blog/2024/04/25/react-19-upgrade-guide#removed-element-ref
 */

const originalConsoleError = console.error;

console.error = (...args: unknown[]) => {
  if (typeof args[0] === 'string') {
    // Suppress React 19 ref deprecation warning from third-party libraries
    if (args[0].includes('Accessing element.ref was removed in React 19')) {
      return;
    }
    // Suppress Radix DialogTitle warning — false positive in React 19 strict mode
    // when DialogTitle is already present as a child of DialogContent
    if (args[0].includes('requires a `DialogTitle`')) {
      return;
    }
  }
  
  // Pass through all other console.error calls
  originalConsoleError.apply(console, args);
};

// Export a dummy value to make this a module
export const react19RefWarningSuppressed = true;
