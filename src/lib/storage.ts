type StorageLike = Pick<Storage, "getItem" | "setItem" | "removeItem">;

function getStorage(): StorageLike | null {
  if (typeof window === "undefined") return null;
  if (!("localStorage" in window)) return null;
  return window.localStorage;
}

export function safeParseJson<T>(value: string | null): T | null {
  if (!value) return null;
  try {
    return JSON.parse(value) as T;
  } catch {
    return null;
  }
}

export function readLocalStorageJson<T>(key: string): T | null {
  const storage = getStorage();
  if (!storage) return null;
  return safeParseJson<T>(storage.getItem(key));
}

export function writeLocalStorageJson(key: string, value: unknown) {
  const storage = getStorage();
  if (!storage) return;
  try {
    storage.setItem(key, JSON.stringify(value));
  } catch {
    // Ignore quota and serialization issues.
  }
}

export function removeLocalStorageItem(key: string) {
  const storage = getStorage();
  if (!storage) return;
  try {
    storage.removeItem(key);
  } catch {
    // Ignore.
  }
}

