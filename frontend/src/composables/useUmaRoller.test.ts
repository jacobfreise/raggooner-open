import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { useUmaRoller } from './useUmaRoller';

describe('useUmaRoller', () => {
    beforeEach(() => {
        vi.useFakeTimers();
    });

    afterEach(() => {
        vi.restoreAllMocks();
        vi.useRealTimers();
    });

    // ── roll guard ────────────────────────────────────────────────────────────

    it('does nothing with an empty candidate list', () => {
        const { roll, isRolling, showRandomModal } = useUmaRoller();
        const onResult = vi.fn();

        roll([], onResult);

        expect(isRolling.value).toBe(false);
        expect(showRandomModal.value).toBe(false);
        expect(onResult).not.toHaveBeenCalled();
    });

    // ── immediate state ───────────────────────────────────────────────────────

    it('sets isRolling and shows modal immediately', () => {
        const { roll, isRolling, showRandomModal } = useUmaRoller();

        roll(['Uma A', 'Uma B', 'Uma C'], () => {});

        expect(isRolling.value).toBe(true);
        expect(showRandomModal.value).toBe(true);
    });

    it('builds reel with winner at index 40', () => {
        vi.spyOn(Math, 'random').mockReturnValue(0); // always picks index 0
        const { roll, slotReel } = useUmaRoller();
        const candidates = ['Uma A', 'Uma B', 'Uma C'];

        roll(candidates, () => {});

        // 40 lead-in items + 1 winner + 5 trailing = 46
        expect(slotReel.value).toHaveLength(46);
        expect(slotReel.value[40]).toBe('Uma A');
    });

    it('sets slotTranslateY to 80 on start', () => {
        const { roll, slotTranslateY } = useUmaRoller();

        roll(['Uma A'], () => {});

        expect(slotTranslateY.value).toBe(80);
    });

    // ── after animation ───────────────────────────────────────────────────────

    it('calls onResult with winner after 4500ms', () => {
        vi.spyOn(Math, 'random').mockReturnValue(0);
        const { roll } = useUmaRoller();
        const onResult = vi.fn();

        roll(['Uma A', 'Uma B'], onResult);
        expect(onResult).not.toHaveBeenCalled();

        vi.advanceTimersByTime(4500);

        expect(onResult).toHaveBeenCalledTimes(1);
        expect(onResult).toHaveBeenCalledWith('Uma A');
    });

    it('resets isRolling to false after animation', () => {
        const { roll, isRolling } = useUmaRoller();

        roll(['Uma A', 'Uma B'], () => {});
        expect(isRolling.value).toBe(true);

        vi.advanceTimersByTime(4500);

        expect(isRolling.value).toBe(false);
    });

    it('hides modal after animation', () => {
        const { roll, showRandomModal } = useUmaRoller();

        roll(['Uma A'], () => {});
        vi.advanceTimersByTime(4500);

        expect(showRandomModal.value).toBe(false);
    });

    // ── winner validity ───────────────────────────────────────────────────────

    it('winner is always from the candidates list', () => {
        const candidates = ['Uma A', 'Uma B', 'Uma C'];
        const onResult = vi.fn();
        const { roll } = useUmaRoller();

        roll(candidates, onResult);
        vi.advanceTimersByTime(4500);

        expect(candidates).toContain(onResult.mock.calls[0]![0]);
    });
});
