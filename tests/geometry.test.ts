import { describe, expect, it } from 'vitest';
import { matrixToOryxIndex, VOYAGER_HEIGHT, VOYAGER_KEYS, VOYAGER_WIDTH } from '../src/core/geometry/voyager.js';
import { readFixture, readJsonFixture, realLayout } from './helpers.js';

/** Index in QMK's `LAYOUT` (rows interleave both halves) for an Oryx key index. */
function oryxToQmkIndex(oryx: number): number {
    if (oryx < 24) return Math.floor(oryx / 6) * 12 + (oryx % 6);
    if (oryx < 26) return 48 + (oryx - 24);
    if (oryx < 50) return Math.floor((oryx - 26) / 6) * 12 + 6 + ((oryx - 26) % 6);
    return oryx;
}

/** Splits the arguments of each `LAYOUT_voyager(...)` in a compiled keymap.c. */
function parseKeymap(source: string): string[][] {
    return [...source.matchAll(/LAYOUT_voyager\(([\s\S]*?)\n {2}\)/g)].map(match => {
        const keys: string[] = [];
        let depth = 0;
        let current = '';
        for (const char of match[1]!) {
            if (char === '(') depth++;
            if (char === ')') depth--;
            if (char === ',' && depth === 0) {
                keys.push(current.trim());
                current = '';
            } else {
                current += char;
            }
        }
        keys.push(current.trim());
        return keys.filter(Boolean);
    });
}

describe('VOYAGER_KEYS', () => {
    it('has 52 keys with unique matrix positions', () => {
        expect(VOYAGER_KEYS).toHaveLength(52);
        expect(new Set(VOYAGER_KEYS.map(k => `${k.row},${k.col}`)).size).toBe(52);
    });

    it('matches QMK keyboard.json reordered from QMK LAYOUT order to Oryx order', () => {
        const qmk = (readJsonFixture('qmk-voyager-keyboard.json') as {
            layouts: { LAYOUT: { layout: { matrix: [number, number]; x: number; y: number }[] } };
        }).layouts.LAYOUT.layout;
        VOYAGER_KEYS.forEach((key, oryx) => {
            const expected = qmk[oryxToQmkIndex(oryx)]!;
            expect(key, `oryx ${oryx}`).toEqual({ row: expected.matrix[0], col: expected.matrix[1], x: expected.x, y: expected.y });
        });
    });

    it('uses the same key order as the compiled firmware of the real layout', () => {
        const compiled = parseKeymap(readFixture('qmk-keymap-aOa9o-nlzDl9.c'));
        const layout = realLayout();
        expect(compiled).toHaveLength(layout.layers.length);
        layout.layers.forEach((layer, l) => {
            layer.keys.forEach((key, oryx) => {
                const code = key.tap?.code ?? 'KC_TRANSPARENT';
                const firmware = compiled[l]![oryxToQmkIndex(oryx)]!;
                const aliases: Record<string, RegExp> = { RGB: /^HSV_/, OSM: /^OSM\(/ };
                expect(aliases[code]?.test(firmware) || firmware.includes(code), `${layer.title}[${oryx}]`).toBe(true);
            });
        });
    });

    it('spans 16 by 5.75 key units', () => {
        expect(VOYAGER_WIDTH).toBe(16);
        expect(VOYAGER_HEIGHT).toBe(5.75);
    });
});

describe('matrixToOryxIndex', () => {
    it('maps matrix positions to Oryx indices', () => {
        expect(matrixToOryxIndex(0, 1)).toBe(0); // Esc
        expect(matrixToOryxIndex(1, 2)).toBe(7); // Q
        expect(matrixToOryxIndex(5, 0)).toBe(24); // Space (left thumb)
        expect(matrixToOryxIndex(7, 0)).toBe(32); // Y
        expect(matrixToOryxIndex(11, 6)).toBe(51); // Enter (right thumb)
    });

    it('returns undefined for positions without a key', () => {
        expect(matrixToOryxIndex(0, 0)).toBeUndefined();
        expect(matrixToOryxIndex(12, 0)).toBeUndefined();
    });
});
