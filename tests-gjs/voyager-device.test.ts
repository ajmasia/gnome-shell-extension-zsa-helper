import Gio from 'gi://Gio';
import { describe, expect, it, sleep, waitFor } from './harness.js';
import { PermissionDeniedError, type DeviceEnvironment, type HidConnection } from '../src/device/transport.js';
import type { RawHidDevice } from '../src/device/discovery.js';
import { VoyagerDevice, type DeviceState } from '../src/device/voyager-device.js';

const VOYAGER: RawHidDevice = { path: '/dev/hidraw4', name: 'ZSA Technology Labs Voyager', productId: 0x1977 };

function report(...bytes: number[]): Uint8Array {
    const buffer = new Uint8Array(32);
    buffer.set(bytes);
    return buffer;
}

const cancelledError = () => new Gio.IOErrorEnum({ code: Gio.IOErrorEnum.CANCELLED, message: 'Operation was cancelled' });

/** A keyboard connection whose reports are pushed by the test. */
class FakeConnection implements HidConnection {
    written: Uint8Array[] = [];
    closed = false;
    private queue: Uint8Array[] = [];
    private pending: { resolve: (data: Uint8Array) => void; reject: (e: unknown) => void } | null = null;

    push(data: Uint8Array): void {
        if (this.pending) {
            this.pending.resolve(data);
            this.pending = null;
        } else {
            this.queue.push(data);
        }
    }

    /** Makes the pending read fail, like an unplugged device. */
    unplug(): void {
        this.pending?.reject(new Error('No such device'));
        this.pending = null;
    }

    read(_size: number, cancellable: Gio.Cancellable | null): Promise<Uint8Array> {
        const queued = this.queue.shift();
        if (queued) {
            return Promise.resolve(queued);
        }
        return new Promise((resolve, reject) => {
            this.pending = { resolve, reject };
            cancellable?.connect(() => reject(cancelledError()));
        });
    }

    async write(data: Uint8Array): Promise<number> {
        this.written.push(data);
        return data.length;
    }

    close(): void {
        this.closed = true;
    }
}

class FakeEnvironment implements DeviceEnvironment {
    device: RawHidDevice | null = VOYAGER;
    denyPermission = false;
    /** When set, open() waits for this promise before returning. */
    openGate: Promise<void> | null = null;
    connections: FakeConnection[] = [];
    hotplug: (() => void) | null = null;
    resume: (() => void) | null = null;

    get last(): FakeConnection {
        return this.connections[this.connections.length - 1]!;
    }

    async find(): Promise<RawHidDevice | null> {
        return this.device;
    }

    async open(path: string): Promise<HidConnection> {
        if (this.openGate) {
            await this.openGate;
        }
        if (this.denyPermission) {
            throw new PermissionDeniedError(path);
        }
        const connection = new FakeConnection();
        this.connections.push(connection);
        return connection;
    }

    watchHotplug(onAdded: () => void): () => void {
        this.hotplug = onAdded;
        return () => (this.hotplug = null);
    }

    watchResume(onResume: () => void): () => void {
        this.resume = onResume;
        return () => (this.resume = null);
    }
}

function setup(environment = new FakeEnvironment()) {
    const states: DeviceState['status'][] = [];
    const device = new VoyagerDevice({
        environment,
        timings: { retryDelaysMs: [10], hotplugSettleMs: 10, resumeSettleMs: 10 },
        onListenerError: () => {},
    });
    device.on('state', state => states.push(state.status));
    return { device, environment, states };
}

describe('VoyagerDevice', () => {
    it('pairs after asking for the protocol and firmware versions', async () => {
        const { device, environment } = setup();
        device.start();
        await waitFor(() => environment.connections.length === 1 && environment.last.written.length === 3, 'handshake');
        expect(environment.last.written.map(w => [w.length, w[0], w[1]])).toEqual([
            [33, 0, 0xfe],
            [33, 0, 0x00],
            [33, 0, 0x01],
        ]);
        device.stop();
    });

    it('turns reports into events', async () => {
        const { device, environment } = setup();
        const events: unknown[] = [];
        device.on('layer', layer => events.push(['layer', layer]));
        device.on('keydown', key => events.push(['keydown', key]));
        device.on('protocol', version => events.push(['protocol', version]));
        device.on('firmware', fw => events.push(['firmware', fw.layoutId, fw.revisionId]));
        device.start();
        await waitFor(() => environment.connections.length === 1, 'connection');

        const ascii = [...'aOa9o/nlzDl9'].map(c => c.charCodeAt(0));
        environment.last.push(report(0xfe, 0x05, 0xfe));
        environment.last.push(report(0x00, ...ascii, 0xfe));
        environment.last.push(report(0x05, 0x02, 0xfe));
        environment.last.push(report(0x06, 0x02, 0x01, 0xfe));
        await waitFor(() => events.length === 4, 'four events');
        expect(events).toEqual([
            ['protocol', 5],
            ['firmware', 'aOa9o', 'nlzDl9'],
            ['layer', 2],
            ['keydown', { row: 1, col: 2 }],
        ]);
        device.stop();
    });

    it('reconnects after the device goes away', async () => {
        const { device, environment, states } = setup();
        device.start();
        await waitFor(() => environment.connections.length === 1, 'first connection');
        environment.last.unplug();
        await waitFor(() => environment.connections.length === 2, 'reconnection');
        expect(environment.connections[0]!.closed).toBe(true);
        expect(states).toEqual(['searching', 'connected', 'searching', 'connected']);
        device.stop();
    });

    it('keeps searching while there is no keyboard and connects when it appears', async () => {
        const environment = new FakeEnvironment();
        environment.device = null;
        const { device, states } = setup(environment);
        device.start();
        await sleep(40);
        expect(environment.connections.length).toBe(0);
        environment.device = VOYAGER;
        await waitFor(() => states.includes('connected'), 'connected');
        device.stop();
    });

    it('reports missing permissions and recovers on hotplug once they are fixed', async () => {
        const environment = new FakeEnvironment();
        environment.denyPermission = true;
        const { device, states } = setup(environment);
        device.start();
        await waitFor(() => states.includes('error'), 'permission error');
        await sleep(40);
        expect(states.filter(s => s === 'error').length).toBe(1);

        environment.denyPermission = false;
        environment.hotplug?.();
        await waitFor(() => states.includes('connected'), 'connected after hotplug');
        device.stop();
    });

    it('does not reconnect when a listener throws', async () => {
        const { device, environment, states } = setup();
        device.on('layer', () => {
            throw new Error('render failed');
        });
        device.start();
        await waitFor(() => environment.connections.length === 1, 'connection');
        environment.last.push(report(0x05, 0x01, 0xfe));
        await sleep(40);
        expect(environment.connections.length).toBe(1);
        expect(states).toEqual(['searching', 'connected']);
        device.stop();
    });

    it('does not end up connected when stopped while opening', async () => {
        const environment = new FakeEnvironment();
        let release: () => void = () => {};
        environment.openGate = new Promise(resolve => (release = resolve));
        const { device, states } = setup(environment);
        device.start();
        await sleep(10);
        device.stop();
        release();
        await sleep(20);
        expect(states).toEqual(['searching', 'stopped']);
        expect(environment.connections.every(c => c.closed)).toBe(true);
    });

    it('pairs again after resuming from suspend', async () => {
        const { device, environment } = setup();
        device.start();
        await waitFor(() => environment.connections.length === 1 && environment.last.written.length === 3, 'handshake');
        environment.resume?.();
        await waitFor(() => environment.last.written.length === 6, 'second handshake');
        expect(environment.last.written[5]![1]).toBe(0x01);
        device.stop();
    });

    it('stops watching hotplug and resume when stopped', async () => {
        const { device, environment } = setup();
        device.start();
        await waitFor(() => environment.connections.length === 1, 'connection');
        device.stop();
        expect(environment.hotplug).toBe(null);
        expect(environment.resume).toBe(null);
        expect(environment.last.closed).toBe(true);
    });
});
