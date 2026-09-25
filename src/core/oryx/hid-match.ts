/** USB vendor id of ZSA Technology Labs. */
export const ZSA_VENDOR_ID = 0x3297;

/**
 * Start of the HID report descriptor of the Oryx raw HID interface: usage page 0xFF60,
 * usage 0x61. It tells it apart from the keyboard and consumer-control interfaces.
 */
const RAW_HID_DESCRIPTOR_PREFIX = [0x06, 0x60, 0xff, 0x09, 0x61];

/**
 * Tells whether a hidraw device is the Oryx raw HID interface of a ZSA keyboard, given the
 * contents of its sysfs `device/uevent` and `device/report_descriptor` files.
 */
export function isZsaRawHid(uevent: string, reportDescriptor: Uint8Array): boolean {
    // HID_ID=<bus>:<vendor>:<product>, e.g. HID_ID=0003:00003297:00001977
    const match = /^HID_ID=[0-9A-Fa-f]+:([0-9A-Fa-f]+):[0-9A-Fa-f]+$/m.exec(uevent);
    if (!match || parseInt(match[1]!, 16) !== ZSA_VENDOR_ID) {
        return false;
    }
    return RAW_HID_DESCRIPTOR_PREFIX.every((byte, i) => reportDescriptor[i] === byte);
}

/** Product name from a hidraw `uevent`, e.g. `ZSA Technology Labs Voyager`. */
export function hidName(uevent: string): string | null {
    return /^HID_NAME=(.+)$/m.exec(uevent)?.[1] ?? null;
}
