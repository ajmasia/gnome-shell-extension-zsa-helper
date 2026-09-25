import { describe, expect, it } from 'vitest';
import { layoutFromOryxJson, LayoutParseError } from '../src/core/layout/from-oryx.js';
import { readJsonFixture, realLayout } from './helpers.js';

describe('layoutFromOryxJson', () => {
    it('parses a revision cached by Keymapp', () => {
        const layout = realLayout();
        expect(layout).toMatchObject({ layoutId: 'aOa9o', revisionId: 'nlzDl9', title: 'Personal Settings' });
        expect(layout.layers.map(l => l.title)).toEqual(['Main', 'Nav', 'Sym', 'Brd+Sys', 'Sym+Num']);
        expect(layout.layers.every(l => l.keys.length === 52)).toBe(true);
    });

    it('parses the Oryx GraphQL response into the same layout', () => {
        const fromApi = layoutFromOryxJson(readJsonFixture('oryx-graphql-aOa9o-nlzDl9.json'));
        expect(fromApi).toEqual(realLayout());
    });

    it('normalises actions, modifiers and labels', () => {
        const [main, nav, sym] = realLayout().layers;
        expect(main!.keys[7]!.tap).toEqual({ code: 'KC_Q' });
        expect(main!.keys[24]).toEqual({ tap: { code: 'KC_SPACE' }, hold: { code: 'MO', layer: 1 } });
        expect(main!.keys[12]!.tap).toEqual({ code: 'OSM', modifier: 'MOD_RALT' });
        expect(nav!.keys[34]).toEqual({
            tap: { code: 'KC_TAB', modifiers: { ctrl: true, shift: true, alt: false, altGr: false, gui: false } },
            customLabel: 'Prev Tab',
        });
        expect(sym!.keys[32]!.tap).toEqual({ code: 'KC_LABK' });
        expect(sym!.keys[0]).toEqual({});
    });

    it('keeps layer colours and drops empty ones', () => {
        const [main, nav] = realLayout().layers;
        expect(main!.color).toBe('#ffffff');
        expect(nav!.color).toBeUndefined();
    });

    it('rejects layouts without layers or with the wrong number of keys', () => {
        expect(() => layoutFromOryxJson({})).toThrow(LayoutParseError);
        expect(() => layoutFromOryxJson({ layout: { hashId: 'a', revision: { hashId: 'b', layers: [] } } })).toThrow(
            LayoutParseError,
        );
        expect(() =>
            layoutFromOryxJson({ layout: { hashId: 'a', revision: { hashId: 'b', layers: [{ keys: [{}] }] } } }),
        ).toThrow(/52 keys/);
    });
});
