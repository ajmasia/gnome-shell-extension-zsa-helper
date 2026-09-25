import GLib from 'gi://GLib';
import Gio from './gio.js';
import { errorMessage, isCancelled } from './errors.js';
import { activeConnectors, connectorToStore, resolveMonitorIndex } from '../core/monitors.js';

/** Delays between retries when Mutter cannot list the monitors; then it waits for the next change. */
const RETRY_DELAYS_MS = [1000, 3000, 10000];

export interface MonitorDirectoryCallbacks {
    /** The list of connectors changed (after a refresh or a successful retry). */
    onUpdated?: () => void;
    /** Listing failed; `null` once it works again. */
    onError?: (message: string | null) => void;
}

/**
 * Translates between monitor indices, which the Shell uses, and connectors (`DP-1`…), which are
 * stable and therefore what the settings store. Mutter resolves connector → index directly; the
 * list of connectors comes from its DisplayConfig D-Bus interface.
 */
export class MonitorDirectory {
    private connectors: string[] = [];
    private cancellable = new Gio.Cancellable();
    private retryTimer = 0;
    private attempt = 0;

    constructor(private readonly callbacks: MonitorDirectoryCallbacks = {}) {}

    /**
     * Reloads the connectors of the active monitors; call it again after `monitors-changed`.
     * On failure it retries a few times and reports the error.
     */
    async refresh(): Promise<void> {
        this.clearRetry();
        try {
            const reply = await Gio.DBus.session.call(
                'org.gnome.Mutter.DisplayConfig',
                '/org/gnome/Mutter/DisplayConfig',
                'org.gnome.Mutter.DisplayConfig',
                'GetCurrentState',
                null,
                null,
                Gio.DBusCallFlags.NONE,
                -1,
                this.cancellable,
            );
            this.connectors = activeConnectors(reply.deepUnpack());
            if (this.attempt > 0) {
                this.callbacks.onError?.(null);
            }
            this.attempt = 0;
            this.callbacks.onUpdated?.();
        } catch (e) {
            if (isCancelled(e)) {
                return;
            }
            const message = `Cannot list monitors: ${errorMessage(e)}`;
            console.warn(`[zsa-helper] ${message}`);
            this.callbacks.onError?.(message);
            this.scheduleRetry();
        }
    }

    /** Monitor index for a stored connector, or the primary monitor. */
    indexFor(connector: string): number {
        return resolveMonitorIndex(connector, c => this.lookup(c), global.display.get_primary_monitor());
    }

    /** Connector to store for a monitor index; empty for the primary. */
    connectorFor(index: number): string {
        return connectorToStore(index, global.display.get_primary_monitor(), this.connectors, c => this.lookup(c));
    }

    destroy(): void {
        this.cancellable.cancel();
        this.clearRetry();
    }

    private scheduleRetry(): void {
        const delay = RETRY_DELAYS_MS[this.attempt++];
        if (delay === undefined) {
            return;
        }
        this.retryTimer = GLib.timeout_add(GLib.PRIORITY_DEFAULT, delay, () => {
            this.retryTimer = 0;
            void this.refresh();
            return GLib.SOURCE_REMOVE;
        });
    }

    private clearRetry(): void {
        if (this.retryTimer) {
            GLib.Source.remove(this.retryTimer);
            this.retryTimer = 0;
        }
    }

    private lookup(connector: string): number {
        return global.backend.get_monitor_manager().get_monitor_for_connector(connector);
    }
}
