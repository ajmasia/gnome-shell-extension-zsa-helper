import GLib from 'gi://GLib';
import Gio from '../lib/gio.js';
import { findZsaRawHid, type RawHidDevice } from './discovery.js';

/** An open raw HID device. */
export interface HidConnection {
    /** Resolves with the next report; an empty array means the device went away. */
    read(size: number, cancellable: Gio.Cancellable | null): Promise<Uint8Array>;
    /** Resolves with the number of bytes written. */
    write(report: Uint8Array, cancellable: Gio.Cancellable | null): Promise<number>;
    close(): void;
}

/** Thrown by `open()` when the device exists but the user may not open it (no udev rule). */
export class PermissionDeniedError extends Error {
    constructor(readonly path: string) {
        super(`No permission to open ${path}`);
        this.name = 'PermissionDeniedError';
    }
}

/** Everything `VoyagerDevice` needs from the system, so it can be tested without hardware. */
export interface DeviceEnvironment {
    find(cancellable: Gio.Cancellable | null): Promise<RawHidDevice | null>;
    open(path: string, cancellable: Gio.Cancellable | null): Promise<HidConnection>;
    /** Calls `onAdded` when a hidraw node appears or changes; returns a function that stops watching. */
    watchHotplug(onAdded: () => void): () => void;
    /** Calls `onResume` after the system resumes from suspend; returns a function that stops watching. */
    watchResume(onResume: () => void): () => void;
}

/** The real environment: sysfs discovery, hidraw through Gio, /dev monitoring and logind. */
export const systemEnvironment: DeviceEnvironment = {
    find: cancellable => findZsaRawHid(cancellable),

    async open(path, cancellable) {
        let stream: Gio.FileIOStream;
        try {
            stream = await Gio.File.new_for_path(path).open_readwrite_async(GLib.PRIORITY_DEFAULT, cancellable);
        } catch (e) {
            if (e instanceof GLib.Error && e.matches(Gio.IOErrorEnum, Gio.IOErrorEnum.PERMISSION_DENIED)) {
                throw new PermissionDeniedError(path);
            }
            throw e;
        }
        const input = stream.get_input_stream();
        const output = stream.get_output_stream();
        return {
            async read(size, readCancellable) {
                const bytes = await input.read_bytes_async(size, GLib.PRIORITY_DEFAULT, readCancellable);
                return bytes.toArray();
            },
            // write_bytes_async keeps the data alive until the write completes; write_all_async with
            // a plain Uint8Array may read the buffer after GJS has released it and send garbage.
            write: (report, writeCancellable) =>
                output.write_bytes_async(new GLib.Bytes(report), GLib.PRIORITY_DEFAULT, writeCancellable),
            close() {
                try {
                    stream.close(null);
                } catch {
                    // Already gone with the device.
                }
            },
        };
    },

    watchHotplug(onAdded) {
        const monitor = Gio.File.new_for_path('/dev').monitor_directory(Gio.FileMonitorFlags.NONE, null);
        const handler = monitor.connect('changed', (_monitor, file, _other, type) => {
            const name = file.get_basename() ?? '';
            if (name.startsWith('hidraw') && (type === Gio.FileMonitorEvent.CREATED || type === Gio.FileMonitorEvent.ATTRIBUTE_CHANGED)) {
                onAdded();
            }
        });
        return () => {
            monitor.disconnect(handler);
            monitor.cancel();
        };
    },

    watchResume(onResume) {
        const subscription = Gio.DBus.system.signal_subscribe(
            'org.freedesktop.login1',
            'org.freedesktop.login1.Manager',
            'PrepareForSleep',
            '/org/freedesktop/login1',
            null,
            Gio.DBusSignalFlags.NONE,
            (_connection, _sender, _path, _iface, _signal, params) => {
                const [goingToSleep] = params.deepUnpack() as [boolean];
                if (!goingToSleep) {
                    onResume();
                }
            },
        );
        return () => Gio.DBus.system.signal_unsubscribe(subscription);
    },
};
