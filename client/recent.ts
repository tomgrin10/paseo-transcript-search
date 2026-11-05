import { useSyncExternalStore } from "react";

/**
 * Recent searches, newest first. They live on this device only: in the web and desktop apps the
 * browser's storage keeps them across reloads, elsewhere they last as long as the app session.
 * Nothing is sent to a host. Reads and writes are best effort; a blocked storage is memory only.
 */

const KEY = "tomgrin10.transcript-search.recent.v1";
export const MAX_RECENT = 8;

function storage(): Storage | null {
  try {
    const value = (globalThis as { localStorage?: Storage }).localStorage;
    return value ?? null;
  } catch {
    return null;
  }
}

function read(): string[] {
  try {
    const raw = storage()?.getItem(KEY);
    const parsed: unknown = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed.filter((item): item is string => typeof item === "string").slice(0, MAX_RECENT) : [];
  } catch {
    return [];
  }
}

let items: string[] | null = null;
const listeners = new Set<() => void>();

function current(): string[] {
  items ??= read();
  return items;
}

function write(next: string[]) {
  items = next;
  try { storage()?.setItem(KEY, JSON.stringify(next)); } catch { /* memory only */ }
  for (const listener of listeners) listener();
}

/** Adds a query to the front; the same words in another case replace the older entry. */
export function addRecent(next: string[], query: string): string[] {
  const value = query.trim();
  if (value.length < 2) return next;
  return [value, ...next.filter((item) => item.toLowerCase() !== value.toLowerCase())].slice(0, MAX_RECENT);
}

export const recentSearches = {
  list: current,
  remember(query: string) {
    const next = addRecent(current(), query);
    if (next !== current() && next.join("\n") !== current().join("\n")) write(next);
  },
  forget(query: string) { write(current().filter((item) => item !== query)); },
  clear() { write([]); },
  subscribe(listener: () => void) { listeners.add(listener); return () => { listeners.delete(listener); }; },
};

export function useRecentSearches(): string[] {
  return useSyncExternalStore(recentSearches.subscribe, recentSearches.list, recentSearches.list);
}
