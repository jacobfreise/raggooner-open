import { describe, it, expect, vi, beforeEach } from 'vitest';
import { useTrackRoller, WEATHER_GROUND_MAP } from './useTrackRoller';

describe('useTrackRoller', () => {
    beforeEach(() => {
        localStorage.clear();
        vi.clearAllMocks();
    });

    // ── toggleFilter ──────────────────────────────────────────────────────────

    describe('toggleFilter', () => {
        it('adds a value when not present', () => {
            const { toggleFilter, surfaceFilters } = useTrackRoller();
            surfaceFilters.value.delete('Turf');

            toggleFilter(surfaceFilters.value, 'Turf');

            expect(surfaceFilters.value.has('Turf')).toBe(true);
        });

        it('removes a value when present', () => {
            const { toggleFilter, surfaceFilters } = useTrackRoller();
            surfaceFilters.value.add('Turf');

            toggleFilter(surfaceFilters.value, 'Turf');

            expect(surfaceFilters.value.has('Turf')).toBe(false);
        });
    });

    // ── toggleAll ─────────────────────────────────────────────────────────────

    describe('toggleAll', () => {
        it('clears set when all values already present', () => {
            const { toggleAll, surfaceFilters } = useTrackRoller();
            surfaceFilters.value = new Set(['Turf', 'Dirt']);

            toggleAll(surfaceFilters.value, ['Turf', 'Dirt']);

            expect(surfaceFilters.value.size).toBe(0);
        });

        it('fills set when not all values present', () => {
            const { toggleAll, surfaceFilters } = useTrackRoller();
            surfaceFilters.value = new Set(['Turf']);

            toggleAll(surfaceFilters.value, ['Turf', 'Dirt']);

            expect(surfaceFilters.value.has('Turf')).toBe(true);
            expect(surfaceFilters.value.has('Dirt')).toBe(true);
        });
    });

    // ── weightPercent ─────────────────────────────────────────────────────────

    describe('weightPercent', () => {
        it('returns correct percentage', () => {
            const { weightPercent } = useTrackRoller();
            const weights = { Firm: 50, Good: 20, Soft: 20, Heavy: 10 };

            expect(weightPercent(weights, 'Firm')).toBe(50);
            expect(weightPercent(weights, 'Good')).toBe(20);
            expect(weightPercent(weights, 'Heavy')).toBe(10);
        });

        it('returns 0 when all weights are zero', () => {
            const { weightPercent } = useTrackRoller();
            const weights = { Firm: 0, Good: 0, Soft: 0, Heavy: 0 };

            expect(weightPercent(weights, 'Firm')).toBe(0);
        });

        it('rounds to nearest integer', () => {
            const { weightPercent } = useTrackRoller();
            const weights = { A: 1, B: 2 }; // 33.33…% and 66.66…%

            expect(weightPercent(weights, 'A')).toBe(33);
            expect(weightPercent(weights, 'B')).toBe(67);
        });
    });

    // ── filteredTracks ────────────────────────────────────────────────────────

    describe('filteredTracks', () => {
        it('returns all tracks when all filters include everything', () => {
            const { filteredTracks, allTracks } = useTrackRoller();
            expect(filteredTracks.value.length).toBe(allTracks.value.length);
            expect(filteredTracks.value.length).toBeGreaterThan(0);
        });

        it('filters by surface', () => {
            const { filteredTracks, surfaceFilters } = useTrackRoller();
            surfaceFilters.value = new Set(['Turf']);

            expect(filteredTracks.value.length).toBeGreaterThan(0);
            expect(filteredTracks.value.every(t => t.surface === 'Turf')).toBe(true);
        });

        it('filters by distance type', () => {
            const { filteredTracks, distanceFilters } = useTrackRoller();
            distanceFilters.value = new Set(['Sprint']);

            expect(filteredTracks.value.every(t => t.distanceType === 'Sprint')).toBe(true);
        });

        it('returns empty when no surface selected', () => {
            const { filteredTracks, surfaceFilters } = useTrackRoller();
            surfaceFilters.value = new Set();

            expect(filteredTracks.value.length).toBe(0);
        });
    });

    // ── validConditionCombos ──────────────────────────────────────────────────

    describe('validConditionCombos', () => {
        it('only includes combos where ground is compatible with weather', () => {
            const { validConditionCombos } = useTrackRoller();

            for (const combo of validConditionCombos.value) {
                const validGrounds = WEATHER_GROUND_MAP[combo.weather] ?? [];
                expect(validGrounds).toContain(combo.ground);
            }
        });

        it('has combinations for all default filter values', () => {
            const { validConditionCombos } = useTrackRoller();
            expect(validConditionCombos.value.length).toBeGreaterThan(0);
        });

        it('returns empty when no ground selected', () => {
            const { validConditionCombos, groundFilters } = useTrackRoller();
            groundFilters.value = new Set();

            expect(validConditionCombos.value.length).toBe(0);
        });

        it('returns empty when no weather selected', () => {
            const { validConditionCombos, weatherFilters } = useTrackRoller();
            weatherFilters.value = new Set();

            expect(validConditionCombos.value.length).toBe(0);
        });

        it('snowy weather only paired with matching grounds', () => {
            const { validConditionCombos, weatherFilters } = useTrackRoller();
            weatherFilters.value = new Set(['Snowy']);

            const snowyGrounds = WEATHER_GROUND_MAP['Snowy'] ?? [];
            for (const combo of validConditionCombos.value) {
                expect(combo.weather).toBe('Snowy');
                expect(snowyGrounds).toContain(combo.ground);
            }
        });
    });

    // ── weights modal ─────────────────────────────────────────────────────────

    describe('openWeightsModal', () => {
        it('copies current weights to draft', () => {
            const { openWeightsModal, groundWeights, draftGroundWeights } = useTrackRoller();
            groundWeights.value = { Firm: 99, Good: 1, Soft: 0, Heavy: 0 };

            openWeightsModal();

            expect(draftGroundWeights.value.Firm).toBe(99);
            expect(draftGroundWeights.value.Good).toBe(1);
        });

        it('sets showWeightsModal to true', () => {
            const { openWeightsModal, showWeightsModal } = useTrackRoller();

            openWeightsModal();

            expect(showWeightsModal.value).toBe(true);
        });
    });

    describe('saveWeights', () => {
        it('commits draft to live weights', () => {
            const { openWeightsModal, saveWeights, draftGroundWeights, groundWeights } = useTrackRoller();
            openWeightsModal();
            draftGroundWeights.value.Firm = 77;

            saveWeights();

            expect(groundWeights.value.Firm).toBe(77);
        });

        it('closes the modal', () => {
            const { openWeightsModal, saveWeights, showWeightsModal } = useTrackRoller();
            openWeightsModal();

            saveWeights();

            expect(showWeightsModal.value).toBe(false);
        });

        it('does not affect draft until openWeightsModal is called again', () => {
            const { openWeightsModal, saveWeights, draftGroundWeights, groundWeights } = useTrackRoller();
            openWeightsModal();
            draftGroundWeights.value.Firm = 77;
            saveWeights();

            // Change live weights again without opening modal
            groundWeights.value.Firm = 10;
            // Draft still reflects committed value until re-opened
            expect(draftGroundWeights.value.Firm).toBe(77);
        });
    });
});
