import { describe, expect, it } from 'vitest';
import { resolveKeyLabel } from '../src/core/labels/resolve.js';
import type { Key } from '../src/core/layout/model.js';
import { realLayout } from './helpers.js';

const layout = realLayout();
const MAIN = 0;
const NAV = 1;
const SYM = 2;
const BRD_SYS = 3;
const SYM_NUM = 4;

const label = (layer: number, key: number) => resolveKeyLabel(layout, layer, key);

describe('resolveKeyLabel', () => {
    it('resolves every key of every layer without unknown keycodes', () => {
        for (const layer of layout.layers) {
            for (let key = 0; key < 52; key++) {
                expect(label(layer.index, key).unknownCodes, `${layer.title}[${key}]`).toEqual([]);
            }
        }
    });

    it('labels printable characters', () => {
        expect(label(MAIN, 7)).toMatchObject({ main: 'Q', kind: 'char', inherited: false });
        expect(label(SYM, 32)).toMatchObject({ main: '<', kind: 'char' });
        expect(label(SYM, 43)).toMatchObject({ main: '~', kind: 'char' });
        expect(label(MAIN, 37)).toMatchObject({ main: '\\', kind: 'char' });
    });

    it('shows hold behaviours as a secondary label', () => {
        expect(label(MAIN, 13)).toMatchObject({ main: 'A', sub: 'Super' });
        expect(label(MAIN, 16)).toMatchObject({ main: 'F', sub: '⇧' });
        expect(label(MAIN, 24)).toMatchObject({ main: '␣', sub: '▸Nav', kind: 'action' });
        expect(label(MAIN, 25)).toMatchObject({ main: '⇥', sub: '▸Sym' });
    });

    it('prefers custom labels', () => {
        expect(label(NAV, 34)).toMatchObject({ main: 'Prev Tab', kind: 'action' });
        expect(label(NAV, 35)).toMatchObject({ main: 'Next Tab' });
        expect(label(NAV, 44)).toMatchObject({ main: 'Back' });
        expect(label(NAV, 45)).toMatchObject({ main: 'Fwd' });
        expect(label(SYM_NUM, 18)).toMatchObject({ main: '€', kind: 'char' });
    });

    it('prefixes modifiers when there is no custom label', () => {
        const key = layout.layers[NAV]!.keys[34]!;
        const withoutLabel = { ...layout, layers: [{ ...layout.layers[MAIN]!, keys: [{ tap: key.tap }] }] };
        expect(resolveKeyLabel(withoutLabel, 0, 0)).toMatchObject({ main: 'Ctrl+⇧ ⇥', kind: 'action' });
    });

    it('labels one-shot modifiers and special actions', () => {
        expect(label(MAIN, 12)).toMatchObject({ main: '1×AltGr', kind: 'modifier' });
        expect(label(MAIN, 6)).toMatchObject({ main: 'CapsW', kind: 'action' });
        expect(label(BRD_SYS, 0)).toMatchObject({ main: 'RGB ⏻' });
        expect(label(BRD_SYS, 1)).toMatchObject({ main: 'Layer Color' });
        expect(label(BRD_SYS, 21)).toMatchObject({ main: 'Color', color: '#ff0000' });
        expect(label(BRD_SYS, 31)).toMatchObject({ main: 'Flash' });
    });

    it('labels modifiers and media keys', () => {
        expect(label(SYM, 16)).toMatchObject({ main: '⇧', kind: 'modifier' });
        expect(label(BRD_SYS, 10)).toMatchObject({ main: '🔇', kind: 'action' });
    });

    it('inherits transparent and empty keys from the base layer, not from the layer below', () => {
        // Sym has '/' and '?' at 36 and 37, but Brd+Sys is reached from the base layer.
        expect(label(BRD_SYS, 36)).toMatchObject({ main: 'P', inherited: true });
        expect(label(BRD_SYS, 37)).toMatchObject({ main: '\\', inherited: true });
        expect(label(SYM, 0)).toMatchObject({ main: 'Esc', inherited: true });
        expect(label(NAV, 13)).toMatchObject({ main: 'A', sub: 'Super', inherited: false });
    });

    it('marks keys that toggle a host lock, also when inherited', () => {
        expect(label(MAIN, 18)).toMatchObject({ main: 'Caps', lock: 'caps', inherited: false });
        expect(label(NAV, 18)).toMatchObject({ main: 'Caps', lock: 'caps', inherited: true });
        expect(label(MAIN, 7).lock).toBeUndefined();
    });

    it('marks Num Lock keys but not locks wrapped in modifiers', () => {
        const withKeys = (keys: Key[]) => ({ ...layout, layers: [{ ...layout.layers[MAIN]!, keys }] });
        expect(resolveKeyLabel(withKeys([{ tap: { code: 'KC_NUM_LOCK' } }]), 0, 0).lock).toBe('num');
        const shifted = { code: 'KC_CAPS', modifiers: { ctrl: false, shift: true, alt: false, altGr: false, gui: false } };
        expect(resolveKeyLabel(withKeys([{ tap: shifted }]), 0, 0).lock).toBeUndefined();
    });

    it('returns an empty label for transparent keys on the base layer', () => {
        const base = { ...layout, layers: [{ ...layout.layers[MAIN]!, keys: [{ tap: { code: 'KC_TRANSPARENT' } }] }] };
        expect(resolveKeyLabel(base, 0, 0)).toEqual({ main: '', kind: 'empty', inherited: false, unknownCodes: [] });
    });

    it('reports unknown keycodes without failing', () => {
        const odd = { ...layout, layers: [{ ...layout.layers[MAIN]!, keys: [{ tap: { code: 'KC_LAUNCHPAD' } }] }] };
        expect(resolveKeyLabel(odd, 0, 0)).toMatchObject({ main: 'LAUNCHPAD', unknownCodes: ['KC_LAUNCHPAD'] });
    });
});
