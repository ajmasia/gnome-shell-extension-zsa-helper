import { describe, expect, it } from 'vitest';
import { describeInputSource, describeStatus, INITIAL_STATUS, isVoyager, parseStatus, type ExtensionStatus } from '../src/core/status.js';

const connected: ExtensionStatus = {
    ...INITIAL_STATUS,
    device: 'connected',
    deviceName: 'ZSA Technology Labs Voyager',
    devicePath: '/dev/hidraw4',
    protocol: 5,
    firmware: 'aOa9o/nlzDl9',
    oryxFirmware: true,
    layout: { title: 'Personal Settings', layoutId: 'aOa9o', revisionId: 'nlzDl9', source: 'oryx-api' },
};

const levels = (status: ExtensionStatus) => Object.fromEntries(describeStatus(status).map(r => [r.title, r.level]));

describe('describeStatus', () => {
    it('reports a healthy setup', () => {
        const rows = describeStatus(connected);
        expect(rows.every(r => r.level === 'ok')).toBe(true);
        expect(rows.find(r => r.title === 'Layout')?.value).toBe('Personal Settings (aOa9o/nlzDl9) from Oryx');
    });

    it('points to the udev rule when the device cannot be opened', () => {
        const rows = describeStatus({ ...INITIAL_STATUS, device: 'permission-denied', devicePath: '/dev/hidraw4' });
        expect(rows.find(r => r.title === 'Permissions')).toMatchObject({ level: 'error', value: expect.stringContaining('50-zsa.rules') });
    });

    it('explains that only the Voyager is supported', () => {
        const rows = describeStatus({ ...INITIAL_STATUS, device: 'unsupported', deviceName: 'ZSA Moonlander Mark I' });
        expect(rows).toEqual([{ title: 'Keyboard', value: expect.stringContaining('only the ZSA Voyager'), level: 'error' }]);
    });

    it('warns while the keyboard is missing', () => {
        expect(levels({ ...INITIAL_STATUS, device: 'searching' })).toEqual({ Keyboard: 'warning' });
    });

    it('flags untested protocols, non-Oryx firmware and layout errors', () => {
        expect(levels({ ...connected, protocol: 9 })['Oryx protocol']).toBe('warning');
        const custom = { ...connected, firmware: 'my-qmk', oryxFirmware: false, layout: null };
        expect(levels(custom)).toMatchObject({ Firmware: 'error' });
        expect(describeStatus(custom).some(r => r.title === 'Layout')).toBe(false);
        expect(levels({ ...connected, layout: null, layoutError: 'Oryx is unreachable' }).Layout).toBe('error');
    });

    it('warns when an older cached revision is shown instead of the flashed one', () => {
        const stale = { ...connected, firmware: 'aOa9o/newRev2', layout: { ...connected.layout!, source: 'stale-cache' } };
        expect(describeStatus(stale).find(r => r.title === 'Layout')).toEqual({
            title: 'Layout',
            value: 'Showing Personal Settings (aOa9o/nlzDl9) from the local cache: revision newRev2 could not be loaded yet',
            level: 'warning',
        });
    });

    it('shows pending steps while the keyboard answers', () => {
        const waiting = { ...connected, protocol: null, firmware: null, oryxFirmware: false, layout: null };
        expect(levels(waiting)).toMatchObject({ 'Oryx protocol': 'pending', Firmware: 'pending' });
    });

    it('adds the last error when there is one', () => {
        expect(describeStatus({ ...connected, lastError: 'boom' }).at(-1)).toEqual({ title: 'Last error', value: 'boom', level: 'warning' });
    });
});

describe('describeInputSource', () => {
    it('accepts US layouts and variants', () => {
        expect(describeInputSource([['xkb', 'us+altgr-intl']]).level).toBe('ok');
        expect(describeInputSource([['xkb', 'us']]).level).toBe('ok');
        expect(describeInputSource([]).level).toBe('ok');
    });

    it('warns about other layouts and input methods', () => {
        expect(describeInputSource([['xkb', 'es'], ['xkb', 'us']])).toMatchObject({ level: 'warning', value: expect.stringContaining('es:') });
        expect(describeInputSource([['ibus', 'anthy']]).level).toBe('warning');
    });
});

describe('isVoyager', () => {
    it('recognises the Voyager product id only', () => {
        expect(isVoyager(0x1977)).toBe(true);
        expect(isVoyager(0x1969)).toBe(false);
        expect(isVoyager(null)).toBe(false);
    });
});

describe('parseStatus', () => {
    it('reads published JSON and fills missing fields', () => {
        expect(parseStatus('{"device":"searching"}')).toEqual({ ...INITIAL_STATUS, device: 'searching' });
    });

    it('treats unreadable input as not running', () => {
        expect(parseStatus('nope')).toEqual(INITIAL_STATUS);
        expect(parseStatus(null)).toEqual(INITIAL_STATUS);
    });
});
