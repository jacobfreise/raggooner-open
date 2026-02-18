/**
 * Simple TTL cache using sessionStorage.
 * Data persists across route navigations but clears when the tab is closed.
 */

const DEFAULT_TTL_MS = 2 * 60 * 60 * 1000; // 2 hours

interface CacheEntry<T> {
    data: T;
    expiresAt: number;
}

export function getCached<T>(key: string): T | null {
    try {
        const raw = sessionStorage.getItem(`cache:${key}`);
        if (!raw) return null;

        const entry: CacheEntry<T> = JSON.parse(raw);
        if (Date.now() > entry.expiresAt) {
            sessionStorage.removeItem(`cache:${key}`);
            return null;
        }

        return entry.data;
    } catch {
        return null;
    }
}

export function setCache<T>(key: string, data: T, ttlMs: number = DEFAULT_TTL_MS): void {
    try {
        const entry: CacheEntry<T> = {
            data,
            expiresAt: Date.now() + ttlMs,
        };
        sessionStorage.setItem(`cache:${key}`, JSON.stringify(entry));
    } catch {
        // sessionStorage full or unavailable — silently ignore
    }
}

export function clearCache(key?: string): void {
    if (key) {
        sessionStorage.removeItem(`cache:${key}`);
    } else {
        // Clear all cache entries
        const keys = Object.keys(sessionStorage).filter(k => k.startsWith('cache:'));
        keys.forEach(k => sessionStorage.removeItem(k));
    }
}
