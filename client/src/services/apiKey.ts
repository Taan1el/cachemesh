// The dashboard keeps the API key in sessionStorage only: it is gone when the
// tab closes and is never written to localStorage or the URL. Every access is
// wrapped because storage can be blocked (private windows, embedded frames).
const STORAGE_KEY = 'cachemesh.apiKey';

// Fallback for browsers where sessionStorage throws, so the key still works for
// the lifetime of the page.
let memoryKey: string | null = null;

export function getApiKey(): string | null {
  try {
    return window.sessionStorage.getItem(STORAGE_KEY) ?? memoryKey;
  } catch {
    return memoryKey;
  }
}

export function setApiKey(key: string): void {
  memoryKey = key;
  try {
    window.sessionStorage.setItem(STORAGE_KEY, key);
  } catch {
    // Kept in memory only.
  }
}

export function clearApiKey(): void {
  memoryKey = null;
  try {
    window.sessionStorage.removeItem(STORAGE_KEY);
  } catch {
    // Nothing stored to remove.
  }
}
