import { describe, expect, it } from 'vitest';
import { overlayOrigin } from '../src/core/positioning.js';

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
