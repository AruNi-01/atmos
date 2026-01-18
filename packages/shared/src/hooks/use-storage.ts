import { useState, useCallback, useMemo } from "react";
import { appStorage, AppStorage } from "../utils/storage";

/**
 * Hook to access the raw application storage instance.
 * Useful for 3rd party libraries that require a storage object (like react-resizable-panels).
 */
export function useAppStorage(): AppStorage {
  return useMemo(() => appStorage, []);
}

/**
 * A generic hook for persistent state.
 * Handles JSON serialization/deserialization and provides a React-friendly API.
 */
export function useStorage<T>(key: string, defaultValue: T): [T, (value: T | ((val: T) => T)) => void] {
  const storage = useAppStorage();

  const [storedValue, setStoredValue] = useState<T>(() => {
    try {
      const item = storage.getItem(key);
      return item ? JSON.parse(item) : defaultValue;
    } catch (error) {
      console.warn(`Error reading storage key "${key}":`, error);
      return defaultValue;
    }
  });

  const setValue = useCallback(
    (value: T | ((val: T) => T)) => {
      try {
        const valueToStore = value instanceof Function ? value(storedValue) : value;
        setStoredValue(valueToStore);
        storage.setItem(key, JSON.stringify(valueToStore));
      } catch (error) {
        console.warn(`Error setting storage key "${key}":`, error);
      }
    },
    [key, storage, storedValue]
  );

  return [storedValue, setValue];
}
