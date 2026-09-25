import GLib from 'gi://GLib';
import Gio from './gio.js';
import { INITIAL_STATUS, STATUS_INTERFACE, STATUS_OBJECT_PATH, type ExtensionStatus } from '../core/status.js';

const INTERFACE_XML = `
<node>
  <interface name="${STATUS_INTERFACE}">
    <property name="Status" type="s" access="read"/>
    <signal name="StatusChanged">
      <arg name="status" type="s"/>
    </signal>
  </interface>
</node>`;

/**
 * Publishes the extension's runtime status on the session bus (as part of the Shell), so the
 * preferences, which run in another process, can show a live diagnosis.
 */
export class StatusService {
    private status: ExtensionStatus = { ...INITIAL_STATUS };
    private readonly exported: Gio.DBusExportedObject;

    constructor() {
        this.exported = Gio.DBusExportedObject.wrapJSObject(INTERFACE_XML, this);
        this.exported.export(Gio.DBus.session, STATUS_OBJECT_PATH);
    }

    /** D-Bus property, read through `wrapJSObject`. */
    get Status(): string {
        return JSON.stringify(this.status);
    }

    get current(): ExtensionStatus {
        return this.status;
    }

    update(patch: Partial<ExtensionStatus>): void {
        this.status = { ...this.status, ...patch };
        const json = this.Status;
        this.exported.emit_property_changed('Status', new GLib.Variant('s', json));
        this.exported.emit_signal('StatusChanged', new GLib.Variant('(s)', [json]));
    }

    destroy(): void {
        this.exported.unexport();
    }
}
