import { describe, it, expect, beforeEach, vi } from 'vitest';
import { getCached, setCache, clearCache } from './cache';

// Better localStorage mock
class LocalStorageMock {
    private store: Record<string, string> = {};

    getItem(key: string) {
        return this.store[key] || null;
    }

    setItem(key: string, value: string) {
        this.store[key] = value.toString();
    }

    removeItem(key: string) {
        delete this.store[key];
    }

    clear() {
        this.store = {};
    }

    get length() {
        return Object.keys(this.store).length;
    }

    key(index: number) {
        return Object.keys(this.store)[index] || null;
    }

    // This is needed for Object.keys(localStorage) to work in Node
    // though clearCache uses Object.keys(localStorage)
    [Symbol.iterator]() {
        let index = 0;
        const keys = Object.keys(this.store);
        return {
            next: () => {
                if (index < keys.length) {
                    return { value: keys[index++], done: false };
                } else {
                    return { done: true };
                }
            }
        };
    }
}

// Re-define Object.keys for the mock
const mockStore = new LocalStorageMock();
Object.defineProperty(global, 'localStorage', { value: mockStore });

// Proxy Object.keys to handle localStorage specially in tests
const originalKeys = Object.keys;
Object.keys = (obj: any) => {
    if (obj === global.localStorage) {
        return originalKeys((global.localStorage as any).store);
    }
    return originalKeys(obj);
};

describe('cache utils', () => {
    beforeEach(() => {
        localStorage.clear();
        vi.useFakeTimers();
    });

    it('sets and gets cache correctly', () => {
        const data = { foo: 'bar' };
        setCache('test', data);
        expect(getCached('test')).toEqual(data);
    });

    it('returns null for expired cache', () => {
        const data = { foo: 'bar' };
        setCache('test', data, 1000); // 1 second TTL
        
        vi.advanceTimersByTime(1001);
        
        expect(getCached('test')).toBeNull();
    });

    it('returns null for missing cache', () => {
        expect(getCached('missing')).toBeNull();
    });

    it('clears specific cache entry', () => {
        setCache('a', 1);
        setCache('b', 2);
        clearCache('a');
        
        expect(getCached('a')).toBeNull();
        expect(getCached('b')).toBe(2);
    });

    it('clears all cache entries', () => {
        setCache('a', 1);
        setCache('b', 2);
        clearCache();
        
        expect(getCached('a')).toBeNull();
        expect(getCached('b')).toBeNull();
    });
});
