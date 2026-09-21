/**
 * Settings and saves go through this interface. The browser build keeps them in
 * localStorage; a desktop build can swap in files or Steam Cloud without touching callers.
 */
export interface SaveStorage {
  read<T>(key: string, fallback: T): T;
  write<T>(key: string, value: T): void;
}

const PREFIX = "boso-run:";

/** localStorage can throw or be missing (private windows, blocked site data), so every access is guarded. */
export class BrowserStorage implements SaveStorage {
  private readonly memory = new Map<string, string>();

  read<T>(key: string, fallback: T): T {
    try {
      const raw = localStorage.getItem(PREFIX + key) ?? this.memory.get(key);
      return raw === undefined || raw === null ? fallback : (JSON.parse(raw) as T);
    } catch {
      return fallback;
    }
  }

  write<T>(key: string, value: T): void {
    const raw = JSON.stringify(value);
    this.memory.set(key, raw);
    try {
      localStorage.setItem(PREFIX + key, raw);
    } catch {
      // kept in memory for this session only
    }
  }
}
