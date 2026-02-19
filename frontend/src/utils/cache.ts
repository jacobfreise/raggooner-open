/**
 * Simple TTL cache using localStorage.
 * Data persists across tabs and browser restarts until the TTL expires.
 */

const DEFAULT_TTL_MS = 24 * 60 * 60 * 1000; // 24 hours

interface CacheEntry<T> {
    data: T;
    expiresAt: number;
}

export function getCached<T>(key: string): T | null {
    try {
        const raw = localStorage.getItem(`cache:${key}`);
        if (!raw) return null;

        const entry: CacheEntry<T> = JSON.parse(raw);
        if (Date.now() > entry.expiresAt) {
            localStorage.removeItem(`cache:${key}`);
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
        localStorage.setItem(`cache:${key}`, JSON.stringify(entry));
    } catch {
        // localStorage full or unavailable — silently ignore
    }
}

export function clearCache(key?: string): void {
    if (key) {
        localStorage.removeItem(`cache:${key}`);
    } else {
        // Clear all cache entries
        const keys = Object.keys(localStorage).filter(k => k.startsWith('cache:'));
        keys.forEach(k => localStorage.removeItem(k));
    }
}
