import type { MatchArchiveItem } from "@/types/game";

const ARCHIVE_KEY = "dfgf:arquivo-morto:v1";
const MAX_ITEMS = 40;

function isBrowser(): boolean {
  return typeof window !== "undefined" && typeof window.localStorage !== "undefined";
}

export function loadArchive(): MatchArchiveItem[] {
  if (!isBrowser()) return [];

  const raw = window.localStorage.getItem(ARCHIVE_KEY);
  if (!raw) return [];

  try {
    const parsed = JSON.parse(raw) as MatchArchiveItem[];
    if (!Array.isArray(parsed)) return [];
    return parsed;
  } catch {
    return [];
  }
}

export function saveArchiveItem(item: MatchArchiveItem): MatchArchiveItem[] {
  if (!isBrowser()) return [];

  const current = loadArchive();
  const deduped = current.filter((entry) => entry.id !== item.id);
  const next = [item, ...deduped].slice(0, MAX_ITEMS);

  window.localStorage.setItem(ARCHIVE_KEY, JSON.stringify(next));
  return next;
}

export function clearArchive(): void {
  if (!isBrowser()) return;
  window.localStorage.removeItem(ARCHIVE_KEY);
}
