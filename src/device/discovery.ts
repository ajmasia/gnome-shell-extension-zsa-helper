import GLib from 'gi://GLib';
import Gio from '../lib/gio.js';
import { hidName, isZsaRawHid } from '../core/oryx/hid-match.js';

const HIDRAW_CLASS_DIR = '/sys/class/hidraw';

export interface RawHidDevice {
    /** Device node, e.g. `/dev/hidraw4`. */
    path: string;
    /** Product name, e.g. `ZSA Technology Labs Voyager`. */
    name: string;
}

/** Finds the Oryx raw HID interface of a connected ZSA keyboard, if any. */
export async function findZsaRawHid(cancellable: Gio.Cancellable | null = null): Promise<RawHidDevice | null> {
    const dir = Gio.File.new_for_path(HIDRAW_CLASS_DIR);
    let names: string[];
    try {
        names = await listChildren(dir, cancellable);
    } catch (e) {
        if (e instanceof GLib.Error && e.matches(Gio.IOErrorEnum, Gio.IOErrorEnum.NOT_FOUND)) {
            return null;
        }
        throw e;
    }

    for (const name of names.filter(n => n.startsWith('hidraw')).sort()) {
        const device = dir.get_child(name).get_child('device');
        try {
            const [uevent] = await device.get_child('uevent').load_contents_async(cancellable);
            const [descriptor] = await device.get_child('report_descriptor').load_contents_async(cancellable);
            const ueventText = new TextDecoder().decode(uevent);
            if (isZsaRawHid(ueventText, descriptor)) {
                return { path: `/dev/${name}`, name: hidName(ueventText) ?? 'ZSA keyboard' };
            }
        } catch (e) {
            if (e instanceof GLib.Error && e.matches(Gio.IOErrorEnum, Gio.IOErrorEnum.CANCELLED)) {
                throw e;
            }
            // The device vanished or is unreadable while scanning: skip it.
        }
    }
    return null;
}

async function listChildren(dir: Gio.File, cancellable: Gio.Cancellable | null): Promise<string[]> {
    const enumerator = await dir.enumerate_children_async(
        Gio.FILE_ATTRIBUTE_STANDARD_NAME,
        Gio.FileQueryInfoFlags.NONE,
        GLib.PRIORITY_DEFAULT,
        cancellable,
    );
    const names: string[] = [];
    for (;;) {
        const infos = await enumerator.next_files_async(32, GLib.PRIORITY_DEFAULT, cancellable);
        if (infos.length === 0) {
            break;
        }
        names.push(...infos.map(info => info.get_name()));
    }
    enumerator.close(null);
    return names;
}
