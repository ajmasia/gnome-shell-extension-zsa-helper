import { describe, expect, it } from 'vitest';
import { clampOrigin, fromRelative, overlayOrigin, toRelative } from '../src/core/positioning.js';

const area = { x: 0, y: 32, width: 1920, height: 1048 };

describe('overlayOrigin', () => {
    it('centres the overlay above the bottom edge by default', () => {
        expect(overlayOrigin(area, 900, 400, 'bottom-center')).toEqual({ x: 510, y: 32 + 1048 - 400 - 48 });
    });

    it('places the overlay in each corner with a margin', () => {
        expect(overlayOrigin(area, 900, 400, 'top-left')).toEqual({ x: 48, y: 80 });
        expect(overlayOrigin(area, 900, 400, 'top-right')).toEqual({ x: 1920 - 900 - 48, y: 80 });
        expect(overlayOrigin(area, 900, 400, 'bottom-left')).toEqual({ x: 48, y: 632 });
        expect(overlayOrigin(area, 900, 400, 'bottom-right')).toEqual({ x: 972, y: 632 });
        expect(overlayOrigin(area, 900, 400, 'top-center')).toEqual({ x: 510, y: 80 });
    });

    it('scales the margin and respects monitor offsets', () => {
        const second = { x: 1920, y: 0, width: 2560, height: 1440 };
        expect(overlayOrigin(second, 1000, 400, 'top-left', 2)).toEqual({ x: 1920 + 96, y: 96 });
    });
});

describe('custom positions', () => {
    it('places a dragged overlay from its stored fractions', () => {
        expect(overlayOrigin(area, 900, 400, 'custom', 1, [0, 0])).toEqual({ x: 0, y: 32 });
        expect(overlayOrigin(area, 900, 400, 'custom', 1, [1, 1])).toEqual({ x: 1020, y: 32 + 648 });
        expect(overlayOrigin(area, 900, 400, 'custom', 1, [0.5, 0.5])).toEqual({ x: 510, y: 32 + 324 });
    });

    it('round-trips a position through fractions', () => {
        const origin = { x: 300, y: 500 };
        expect(fromRelative(area, 900, 400, toRelative(area, 900, 400, origin))).toEqual(origin);
    });

    it('keeps the same relative place on another resolution', () => {
        const relative = toRelative(area, 900, 400, { x: 1020, y: 680 }); // bottom-right corner
        const big = { x: 0, y: 0, width: 2560, height: 1440 };
        expect(fromRelative(big, 900, 400, relative)).toEqual({ x: 1660, y: 1040 });
    });

    it('clamps positions and fractions to the work area', () => {
        expect(clampOrigin(area, 900, 400, { x: -50, y: 2000 })).toEqual({ x: 0, y: 680 });
        expect(toRelative(area, 900, 400, { x: -50, y: 2000 })).toEqual([0, 1]);
        expect(fromRelative(area, 900, 400, [7, Number.NaN])).toEqual({ x: 1020, y: 356 });
    });

    it('centres an overlay larger than the work area instead of dividing by zero', () => {
        expect(toRelative(area, 3000, 2000, { x: 0, y: 0 })).toEqual([0.5, 0.5]);
    });
});
