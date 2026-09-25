import { SUPPORTED_PROTOCOL_VERSIONS } from './oryx/commands.js';

/** Runtime state the extension publishes so the preferences can show a diagnosis. */
export interface ExtensionStatus {
    device: 'stopped' | 'searching' | 'connected' | 'permission-denied' | 'unsupported';
    deviceName: string | null;
    devicePath: string | null;
    protocol: number | null;
    /** Raw firmware id, e.g. `aOa9o/nlzDl9`; null until the keyboard answers. */
    firmware: string | null;
    /** Whether the firmware id is an Oryx layout/revision pair. */
    oryxFirmware: boolean;
    layout: { title: string; layoutId: string; revisionId: string; source: string } | null;
    layoutError: string | null;
    /** Last unexpected error, for troubleshooting. */
    lastError: string | null;
}

export const INITIAL_STATUS: ExtensionStatus = {
    device: 'stopped',
    deviceName: null,
    devicePath: null,
    protocol: null,
    firmware: null,
    oryxFirmware: false,
    layout: null,
    layoutError: null,
    lastError: null,
};

export type StatusLevel = 'ok' | 'warning' | 'error' | 'pending';

export interface StatusRow {
    title: string;
    value: string;
    level: StatusLevel;
}

/** USB product id of the ZSA Voyager; other ZSA keyboards use the same vendor id. */
export const VOYAGER_PRODUCT_ID = 0x1977;

export function isVoyager(productId: number | null): boolean {
    return productId === VOYAGER_PRODUCT_ID;
}

/** Turns the published status into the rows the preferences show. */
export function describeStatus(status: ExtensionStatus): StatusRow[] {
    const rows: StatusRow[] = [];

    switch (status.device) {
        case 'connected':
            rows.push({ title: 'Keyboard', value: `${status.deviceName ?? 'ZSA keyboard'} (${status.devicePath})`, level: 'ok' });
            rows.push({ title: 'Permissions', value: 'Raw HID access granted', level: 'ok' });
            break;
        case 'permission-denied':
            rows.push({ title: 'Keyboard', value: status.deviceName ?? 'Found', level: 'ok' });
            rows.push({
                title: 'Permissions',
                value: `No access to ${status.devicePath ?? 'the keyboard'}. Install ZSA's udev rule (50-zsa.rules) and replug it`,
                level: 'error',
            });
            break;
        case 'unsupported':
            rows.push({ title: 'Keyboard', value: `${status.deviceName ?? 'This keyboard'} is not supported; only the ZSA Voyager is`, level: 'error' });
            break;
        case 'searching':
            rows.push({ title: 'Keyboard', value: 'Not connected; waiting for it', level: 'warning' });
            break;
        case 'stopped':
            rows.push({ title: 'Keyboard', value: 'Not running', level: 'pending' });
            break;
    }

    if (status.device === 'connected') {
        if (status.protocol === null) {
            rows.push({ title: 'Oryx protocol', value: 'Waiting for the keyboard', level: 'pending' });
        } else if (SUPPORTED_PROTOCOL_VERSIONS.includes(status.protocol)) {
            rows.push({ title: 'Oryx protocol', value: `Version ${status.protocol}`, level: 'ok' });
        } else {
            rows.push({ title: 'Oryx protocol', value: `Version ${status.protocol} has not been tested; it may not work`, level: 'warning' });
        }

        if (status.firmware === null) {
            rows.push({ title: 'Firmware', value: 'Waiting for the keyboard', level: 'pending' });
        } else if (!status.oryxFirmware) {
            rows.push({ title: 'Firmware', value: `"${status.firmware}" is not an Oryx layout`, level: 'error' });
        } else {
            rows.push({ title: 'Firmware', value: status.firmware, level: 'ok' });
        }

        if (status.layout) {
            const { title, layoutId, revisionId, source } = status.layout;
            rows.push({ title: 'Layout', value: `${title} (${layoutId}/${revisionId}) from ${sourceLabel(source)}`, level: 'ok' });
        } else if (status.layoutError) {
            rows.push({ title: 'Layout', value: status.layoutError, level: 'error' });
        } else if (status.oryxFirmware) {
            rows.push({ title: 'Layout', value: 'Loading', level: 'pending' });
        }
    }

    if (status.lastError) {
        rows.push({ title: 'Last error', value: status.lastError, level: 'warning' });
    }
    return rows;
}

function sourceLabel(source: string): string {
    return { cache: 'the local cache', 'oryx-api': 'Oryx', keymapp: "Keymapp's cache" }[source] ?? source;
}

/**
 * Checks the first GNOME input source (`org.gnome.desktop.input-sources sources`, pairs like
 * `['xkb', 'us+altgr-intl']`). Labels assume a US layout, so anything else gets a warning.
 */
export function describeInputSource(sources: readonly (readonly [string, string])[]): StatusRow {
    const first = sources[0];
    if (!first) {
        return { title: 'Keyboard layout', value: 'Default (US)', level: 'ok' };
    }
    const [type, id] = first;
    const layout = id.split('+')[0];
    if (type === 'xkb' && layout === 'us') {
        return { title: 'Keyboard layout', value: id, level: 'ok' };
    }
    return {
        title: 'Keyboard layout',
        value: `${id}: key labels assume a US layout, so some symbols may be shown wrong`,
        level: 'warning',
    };
}

/** Where the extension publishes its status on the session bus, inside the Shell's connection. */
export const STATUS_BUS_NAME = 'org.gnome.Shell';
export const STATUS_OBJECT_PATH = '/org/gnome/Shell/Extensions/ZsaHelper';
export const STATUS_INTERFACE = 'org.gnome.Shell.Extensions.ZsaHelper';

/** Parses the published JSON; anything unreadable counts as "not running". */
export function parseStatus(json: string | null | undefined): ExtensionStatus {
    try {
        const value: unknown = JSON.parse(json ?? '');
        return value && typeof value === 'object' ? { ...INITIAL_STATUS, ...(value as Partial<ExtensionStatus>) } : INITIAL_STATUS;
    } catch {
        return INITIAL_STATUS;
    }
}
