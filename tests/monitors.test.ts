import { describe, expect, it } from 'vitest';
import { activeConnectors, connectorToStore, resolveMonitorIndex } from '../src/core/monitors.js';

// Monitor manager of a laptop with an external screen: eDP-1 is index 0, DP-1 index 1.
const indices: Record<string, number> = { 'eDP-1': 0, 'DP-1': 1 };
const indexFor = (connector: string) => indices[connector] ?? -1;

describe('resolveMonitorIndex', () => {
    it('uses the primary monitor when no connector is stored', () => {
        expect(resolveMonitorIndex('', indexFor, 0)).toBe(0);
    });

    it('uses the stored monitor when it is connected', () => {
        expect(resolveMonitorIndex('DP-1', indexFor, 0)).toBe(1);
    });

    it('falls back to the primary while the stored monitor is unplugged', () => {
        expect(resolveMonitorIndex('HDMI-1', indexFor, 0)).toBe(0);
    });
});

describe('connectorToStore', () => {
    const connectors = ['eDP-1', 'DP-1'];

    it('stores nothing for the primary monitor', () => {
        expect(connectorToStore(0, 0, connectors, indexFor)).toBe('');
    });

    it('stores the connector of another monitor', () => {
        expect(connectorToStore(1, 0, connectors, indexFor)).toBe('DP-1');
    });

    it('stores nothing when the monitor is unknown', () => {
        expect(connectorToStore(5, 0, connectors, indexFor)).toBe('');
    });
});

describe('activeConnectors', () => {
    it('reads the connectors of the logical monitors', () => {
        // Shape of GetCurrentState from a nested shell with two dummy monitors.
        const spec = (connector: string) => [connector, 'MetaProducts Inc.', 'MetaMonitor', '0xC0FFEE'];
        const state = [
            1,
            [],
            [
                [0, 0, 1, 0, true, [spec('LVDS1')], {}],
                [1280, 0, 1, 0, false, [spec('LVDS2')], {}],
            ],
            {},
        ];
        expect(activeConnectors(state)).toEqual(['LVDS1', 'LVDS2']);
    });

    it('returns nothing for unexpected data', () => {
        expect(activeConnectors(null)).toEqual([]);
        expect(activeConnectors([1, [], 'nope'])).toEqual([]);
    });
});
