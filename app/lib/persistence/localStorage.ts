/*
 * Only use the browser's Storage API. Newer Node versions may expose a
 * `localStorage` global during SSR, but it is not the browser storage object.
 */
export function getBrowserLocalStorage(): Storage | undefined {
  if (typeof window === 'undefined') {
    return undefined;
  }

  try {
    const storage = window.localStorage;

    if (
      typeof storage?.getItem === 'function' &&
      typeof storage.setItem === 'function' &&
      typeof storage.removeItem === 'function'
    ) {
      return storage;
    }
  } catch {
    // Storage can be disabled by browser privacy settings.
  }

  return undefined;
}

export function getLocalStorage(key: string): any | null {
  const storage = getBrowserLocalStorage();

  if (!storage) {
    return null;
  }

  try {
    const item = storage.getItem(key);
    return item ? JSON.parse(item) : null;
  } catch (error) {
    console.error(`Error reading from localStorage key "${key}":`, error);
    return null;
  }
}

export function setLocalStorage(key: string, value: any): void {
  const storage = getBrowserLocalStorage();

  if (!storage) {
    return;
  }

  try {
    storage.setItem(key, JSON.stringify(value));
  } catch (error) {
    console.error(`Error writing to localStorage key "${key}":`, error);
  }
}
