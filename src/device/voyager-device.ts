import GLib from 'gi://GLib';
import Gio from './gio.js';
import { Emitter } from '../core/emitter.js';
import {
    buildCommand,
    CMD_GET_FW_VERSION,
    CMD_GET_PROTOCOL_VERSION,
    CMD_PAIRING_INIT,
    SUPPORTED_PROTOCOL_VERSIONS,
} from '../core/oryx/commands.js';
import { parseOryxPacket } from '../core/oryx/parse.js';
import { REPORT_SIZE } from '../core/oryx/types.js';
import { findZsaRawHid } from './discovery.js';

export type DeviceState =
    | { status: 'stopped' }
    | { status: 'searching' }
    | { status: 'connected'; path: string; name: string }
    | { status: 'error'; reason: 'permission'; path: string; message: string };

export interface DeviceEvents extends Record<string, unknown> {
    state: DeviceState;
    layer: number;
    keydown: { row: number; col: number };
    keyup: { row: number; col: number };
    firmware: { raw: string; layoutId: string | null; revisionId: string | null };
    protocol: number;
    warning: string;
}

/** Retry delays while no keyboard is found; the last one repeats. */
const RETRY_DELAYS_MS = [1000, 2000, 5000, 10000];
/** udev applies permissions shortly after the device node appears. */
const HOTPLUG_SETTLE_MS = 500;
/** USB needs a moment after resume before the keyboard accepts reports again. */
const RESUME_SETTLE_MS = 1500;

/**
 * Connection to a ZSA keyboard over the Oryx raw HID protocol. It finds the device, pairs with
 * it, reports layer and key events, and reconnects after unplugging, reflashing or suspending.
 *
 * Only read-only commands and pairing are ever sent. Keymapp can stay open at the same time:
 * hidraw delivers every report to every reader.
 */
export class VoyagerDevice extends Emitter<DeviceEvents> {
    private state: DeviceState = { status: 'stopped' };
    private cancellable: Gio.Cancellable | null = null;
    private stream: Gio.FileIOStream | null = null;
    private monitor: Gio.FileMonitor | null = null;
    private monitorHandler = 0;
    private sleepSubscription = 0;
    private retryTimer = 0;
    private retryAttempt = 0;
    private connecting = false;

    get currentState(): DeviceState {
        return this.state;
    }

    start(): void {
        if (this.state.status !== 'stopped') {
            return;
        }
        this.cancellable = new Gio.Cancellable();
        this.watchHotplug();
        this.watchSleep();
        this.setState({ status: 'searching' });
        void this.connect();
    }

    /** Idempotent: releases the device, timers, monitors and subscriptions. */
    stop(): void {
        if (this.state.status === 'stopped') {
            return;
        }
        this.cancellable?.cancel();
        this.cancellable = null;
        this.clearRetry();
        this.closeStream();

        if (this.monitor) {
            this.monitor.disconnect(this.monitorHandler);
            this.monitor.cancel();
            this.monitor = null;
        }
        if (this.sleepSubscription) {
            Gio.DBus.system.signal_unsubscribe(this.sleepSubscription);
            this.sleepSubscription = 0;
        }
        this.setState({ status: 'stopped' });
    }

    private async connect(): Promise<void> {
        if (this.connecting || this.state.status === 'stopped' || this.state.status === 'connected') {
            return;
        }
        this.connecting = true;
        this.clearRetry();
        const cancellable = this.cancellable;

        try {
            const device = await findZsaRawHid(cancellable);
            if (cancellable?.is_cancelled()) {
                return;
            }
            if (!device) {
                this.setState({ status: 'searching' });
                this.scheduleRetry();
                return;
            }

            try {
                this.stream = await Gio.File.new_for_path(device.path).open_readwrite_async(
                    GLib.PRIORITY_DEFAULT,
                    cancellable,
                );
            } catch (e) {
                if (e instanceof GLib.Error && e.matches(Gio.IOErrorEnum, Gio.IOErrorEnum.PERMISSION_DENIED)) {
                    this.setState({
                        status: 'error',
                        reason: 'permission',
                        path: device.path,
                        message: `No permission to open ${device.path}. Install ZSA's udev rule (50-zsa.rules).`,
                    });
                    // Keep watching hotplug: fixing the rule and replugging recovers without a restart.
                    return;
                }
                throw e;
            }

            if (cancellable?.is_cancelled()) {
                // stop() ran while the device was opening.
                this.closeStream();
                return;
            }

            this.retryAttempt = 0;
            this.setState({ status: 'connected', path: device.path, name: device.name });
            void this.readLoop(this.stream, cancellable);
            await this.handshake();
        } catch (e) {
            if (isCancelled(e)) {
                return;
            }
            this.emit('warning', `Connection failed: ${errorMessage(e)}`);
            this.disconnected();
        } finally {
            this.connecting = false;
        }
    }

    /** Asks for the protocol and firmware versions and pairs so the keyboard starts reporting. */
    private async handshake(): Promise<void> {
        for (const command of [CMD_GET_PROTOCOL_VERSION, CMD_GET_FW_VERSION, CMD_PAIRING_INIT] as const) {
            await this.send(buildCommand(command));
        }
    }

    private async send(report: Uint8Array): Promise<void> {
        const output = this.stream?.get_output_stream();
        if (!output) {
            return;
        }
        // write_bytes_async keeps the data alive until the write completes; write_all_async with a
        // plain Uint8Array may read the buffer after GJS has released it and send garbage.
        const written = await output.write_bytes_async(new GLib.Bytes(report), GLib.PRIORITY_DEFAULT, this.cancellable);
        if (written !== report.length) {
            throw new Error(`short write: ${written} of ${report.length} bytes`);
        }
    }

    private async readLoop(stream: Gio.FileIOStream, cancellable: Gio.Cancellable | null): Promise<void> {
        const input = stream.get_input_stream();
        try {
            for (;;) {
                const bytes = await input.read_bytes_async(REPORT_SIZE, GLib.PRIORITY_DEFAULT, cancellable);
                const data = bytes.toArray();
                if (data.length === 0) {
                    throw new Error('end of stream');
                }
                this.handlePacket(data);
            }
        } catch (e) {
            if (isCancelled(e) || stream !== this.stream) {
                return;
            }
            this.disconnected();
        }
    }

    private handlePacket(data: Uint8Array): void {
        const event = parseOryxPacket(data);
        switch (event.type) {
            case 'layer':
                this.emit('layer', event.layer);
                break;
            case 'keydown':
            case 'keyup':
                this.emit(event.type, { row: event.row, col: event.col });
                break;
            case 'fw-version':
                this.emit('firmware', { raw: event.raw, layoutId: event.layoutId, revisionId: event.revisionId });
                break;
            case 'protocol-version':
                if (!SUPPORTED_PROTOCOL_VERSIONS.includes(event.version)) {
                    this.emit('warning', `Untested Oryx protocol version ${event.version}`);
                }
                this.emit('protocol', event.version);
                break;
            case 'error':
                this.emit('warning', `Keyboard reported error ${event.code}`);
                break;
            default:
                break;
        }
    }

    private disconnected(): void {
        this.closeStream();
        if (this.state.status === 'stopped') {
            return;
        }
        this.setState({ status: 'searching' });
        this.scheduleRetry();
    }

    private closeStream(): void {
        const stream = this.stream;
        this.stream = null;
        try {
            stream?.close(null);
        } catch {
            // Already gone with the device.
        }
    }

    private scheduleRetry(delayMs?: number): void {
        this.clearRetry();
        const delay = delayMs ?? RETRY_DELAYS_MS[Math.min(this.retryAttempt++, RETRY_DELAYS_MS.length - 1)]!;
        this.retryTimer = GLib.timeout_add(GLib.PRIORITY_DEFAULT, delay, () => {
            this.retryTimer = 0;
            void this.connect();
            return GLib.SOURCE_REMOVE;
        });
    }

    private clearRetry(): void {
        if (this.retryTimer) {
            GLib.Source.remove(this.retryTimer);
            this.retryTimer = 0;
        }
    }

    /** Reacts to hidraw nodes appearing in /dev (plugging in, reflashing, udev rule fixed). */
    private watchHotplug(): void {
        this.monitor = Gio.File.new_for_path('/dev').monitor_directory(Gio.FileMonitorFlags.NONE, null);
        this.monitorHandler = this.monitor.connect('changed', (_monitor, file, _other, type) => {
            const name = file.get_basename() ?? '';
            if (!name.startsWith('hidraw') || this.state.status === 'connected') {
                return;
            }
            if (type === Gio.FileMonitorEvent.CREATED || type === Gio.FileMonitorEvent.ATTRIBUTE_CHANGED) {
                this.retryAttempt = 0;
                this.scheduleRetry(HOTPLUG_SETTLE_MS);
            }
        });
    }

    /**
     * The firmware drops pairing when a report fails to send, e.g. while the USB bus is
     * suspended. After resume the device node may survive, so pair again explicitly.
     */
    private watchSleep(): void {
        this.sleepSubscription = Gio.DBus.system.signal_subscribe(
            'org.freedesktop.login1',
            'org.freedesktop.login1.Manager',
            'PrepareForSleep',
            '/org/freedesktop/login1',
            null,
            Gio.DBusSignalFlags.NONE,
            (_connection, _sender, _path, _iface, _signal, params) => {
                const [goingToSleep] = params.deepUnpack() as [boolean];
                if (goingToSleep) {
                    return;
                }
                this.clearRetry();
                this.retryTimer = GLib.timeout_add(GLib.PRIORITY_DEFAULT, RESUME_SETTLE_MS, () => {
                    this.retryTimer = 0;
                    if (this.state.status === 'connected') {
                        this.handshake().catch(e => {
                            if (!isCancelled(e)) {
                                this.disconnected();
                            }
                        });
                    } else {
                        void this.connect();
                    }
                    return GLib.SOURCE_REMOVE;
                });
            },
        );
    }

    private setState(state: DeviceState): void {
        this.state = state;
        this.emit('state', state);
    }
}

function isCancelled(e: unknown): boolean {
    return e instanceof GLib.Error && e.matches(Gio.IOErrorEnum, Gio.IOErrorEnum.CANCELLED);
}

function errorMessage(e: unknown): string {
    return e instanceof Error || e instanceof GLib.Error ? e.message : String(e);
}
