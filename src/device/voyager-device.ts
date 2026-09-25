import GLib from 'gi://GLib';
import Gio from '../lib/gio.js';
import { errorMessage, isCancelled } from '../lib/errors.js';
import { Emitter, type ListenerErrorHandler } from '../core/emitter.js';
import {
    buildCommand,
    CMD_GET_FW_VERSION,
    CMD_GET_PROTOCOL_VERSION,
    CMD_PAIRING_INIT,
    SUPPORTED_PROTOCOL_VERSIONS,
} from '../core/oryx/commands.js';
import { parseOryxPacket } from '../core/oryx/parse.js';
import { REPORT_SIZE } from '../core/oryx/types.js';
import { PermissionDeniedError, systemEnvironment, type DeviceEnvironment, type HidConnection } from './transport.js';

export type DeviceState =
    | { status: 'stopped' }
    | { status: 'searching' }
    | { status: 'connected'; path: string; name: string; productId: number | null }
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

export interface DeviceTimings {
    /** Retry delays while no keyboard is found; the last one repeats. */
    retryDelaysMs: readonly number[];
    /** udev applies permissions shortly after the device node appears. */
    hotplugSettleMs: number;
    /** USB needs a moment after resume before the keyboard accepts reports again. */
    resumeSettleMs: number;
}

const DEFAULT_TIMINGS: DeviceTimings = {
    retryDelaysMs: [1000, 2000, 5000, 10000],
    hotplugSettleMs: 500,
    resumeSettleMs: 1500,
};

export interface VoyagerDeviceOptions {
    /** Receives exceptions thrown by event listeners; they never stop the device. */
    onListenerError?: ListenerErrorHandler;
    /** System access; replaced by a fake in tests. */
    environment?: DeviceEnvironment;
    timings?: Partial<DeviceTimings>;
}

/**
 * Connection to a ZSA keyboard over the Oryx raw HID protocol. It finds the device, pairs with
 * it, reports layer and key events, and reconnects after unplugging, reflashing or suspending.
 *
 * Only read-only commands and pairing are ever sent. Keymapp can stay open at the same time:
 * hidraw delivers every report to every reader.
 */
export class VoyagerDevice extends Emitter<DeviceEvents> {
    private readonly environment: DeviceEnvironment;
    private readonly timings: DeviceTimings;
    private state: DeviceState = { status: 'stopped' };
    private cancellable: Gio.Cancellable | null = null;
    private connection: HidConnection | null = null;
    private unwatch: (() => void)[] = [];
    private retryTimer = 0;
    private retryAttempt = 0;
    private connecting = false;

    constructor(options: VoyagerDeviceOptions = {}) {
        super(options.onListenerError);
        this.environment = options.environment ?? systemEnvironment;
        this.timings = { ...DEFAULT_TIMINGS, ...options.timings };
    }

    get currentState(): DeviceState {
        return this.state;
    }

    start(): void {
        if (this.state.status !== 'stopped') {
            return;
        }
        this.cancellable = new Gio.Cancellable();
        this.unwatch = [
            this.environment.watchHotplug(() => this.onHotplug()),
            this.environment.watchResume(() => this.onResume()),
        ];
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
        this.closeConnection();
        for (const unwatch of this.unwatch) {
            unwatch();
        }
        this.unwatch = [];
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
            const device = await this.environment.find(cancellable);
            if (cancellable?.is_cancelled()) {
                return;
            }
            if (!device) {
                this.setState({ status: 'searching' });
                this.scheduleRetry();
                return;
            }

            let connection: HidConnection;
            try {
                connection = await this.environment.open(device.path, cancellable);
            } catch (e) {
                if (e instanceof PermissionDeniedError) {
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
                connection.close();
                return;
            }

            this.connection = connection;
            this.retryAttempt = 0;
            this.setState({ status: 'connected', path: device.path, name: device.name, productId: device.productId });
            void this.readLoop(connection, cancellable);
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
        if (!this.connection) {
            return;
        }
        const written = await this.connection.write(report, this.cancellable);
        if (written !== report.length) {
            throw new Error(`short write: ${written} of ${report.length} bytes`);
        }
    }

    private async readLoop(connection: HidConnection, cancellable: Gio.Cancellable | null): Promise<void> {
        try {
            for (;;) {
                const data = await connection.read(REPORT_SIZE, cancellable);
                if (data.length === 0) {
                    throw new Error('end of stream');
                }
                this.handlePacket(data);
            }
        } catch (e) {
            if (isCancelled(e) || connection !== this.connection) {
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
        this.closeConnection();
        if (this.state.status === 'stopped') {
            return;
        }
        this.setState({ status: 'searching' });
        this.scheduleRetry();
    }

    private closeConnection(): void {
        const connection = this.connection;
        this.connection = null;
        connection?.close();
    }

    private scheduleRetry(delayMs?: number): void {
        this.clearRetry();
        const delays = this.timings.retryDelaysMs;
        const delay = delayMs ?? delays[Math.min(this.retryAttempt++, delays.length - 1)]!;
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

    /** A hidraw node appeared (plugging in, reflashing, udev rule fixed): try again soon. */
    private onHotplug(): void {
        if (this.state.status === 'connected' || this.state.status === 'stopped') {
            return;
        }
        this.retryAttempt = 0;
        this.scheduleRetry(this.timings.hotplugSettleMs);
    }

    /**
     * The firmware drops pairing when a report fails to send, e.g. while the USB bus is
     * suspended. After resume the device node may survive, so pair again explicitly.
     */
    private onResume(): void {
        if (this.state.status === 'stopped') {
            return;
        }
        this.clearRetry();
        this.retryTimer = GLib.timeout_add(GLib.PRIORITY_DEFAULT, this.timings.resumeSettleMs, () => {
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
    }

    private setState(state: DeviceState): void {
        this.state = state;
        this.emit('state', state);
    }
}
