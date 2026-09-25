import Gio from './gio.js';
import { isCancelled } from './errors.js';
import { activeConnectors, connectorToStore, resolveMonitorIndex } from '../core/monitors.js';

/**
 * Translates between monitor indices, which the Shell uses, and connectors (`DP-1`…), which are
 * stable and therefore what the settings store. Mutter resolves connector → index directly; the
 * list of connectors comes from its DisplayConfig D-Bus interface.
 */
export class MonitorDirectory {
    private connectors: string[] = [];
    private cancellable = new Gio.Cancellable();

    /** Reloads the connectors of the active monitors; call it again after `monitors-changed`. */
    async refresh(): Promise<void> {
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
        } catch (e) {
            if (!isCancelled(e)) {
                console.warn(`[zsa-helper] cannot list monitors: ${e}`);
            }
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
    }

    private lookup(connector: string): number {
        return global.backend.get_monitor_manager().get_monitor_for_connector(connector);
    }
}

