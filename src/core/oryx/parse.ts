import {
    EVT_ERROR,
    EVT_FW_VERSION,
    EVT_KEYDOWN,
    EVT_KEYUP,
    EVT_LAYER,
    EVT_PAIRING_SUCCESS,
    EVT_PROTOCOL_VERSION,
    STOP_BYTE,
    type OryxEvent,
} from './types.js';

/**
 * Parses a report read from the keyboard's raw HID interface.
 * Reports that are too short for their event type are returned as `unknown`.
 */
export function parseOryxPacket(bytes: Uint8Array): OryxEvent {
    const code = bytes[0];
    if (code === undefined) {
        return { type: 'unknown', code: -1 };
    }

    const param = (i: number): number | undefined => bytes[1 + i];

    switch (code) {
        case EVT_FW_VERSION:
            return parseFwVersion(bytes);
        case EVT_PAIRING_SUCCESS:
            return { type: 'pairing-success' };
        case EVT_LAYER: {
            const layer = param(0);
            return layer === undefined ? { type: 'unknown', code } : { type: 'layer', layer };
        }
        case EVT_KEYDOWN:
        case EVT_KEYUP: {
            // The firmware sends the column first, then the row.
            const col = param(0);
            const row = param(1);
            if (col === undefined || row === undefined) {
                return { type: 'unknown', code };
            }
            return { type: code === EVT_KEYDOWN ? 'keydown' : 'keyup', row, col };
        }
        case EVT_PROTOCOL_VERSION: {
            const version = param(0);
            return version === undefined ? { type: 'unknown', code } : { type: 'protocol-version', version };
        }
        case EVT_ERROR:
            return { type: 'error', code: param(0) ?? -1 };
        default:
            return { type: 'unknown', code };
    }
}

/** The payload is the firmware's SERIAL_NUMBER, which Oryx sets to `layoutId/revisionId`. */
function parseFwVersion(bytes: Uint8Array): OryxEvent {
    let raw = '';
    for (let i = 1; i < bytes.length; i++) {
        const byte = bytes[i]!;
        if (byte === STOP_BYTE || byte === 0x00) {
            break;
        }
        raw += String.fromCharCode(byte);
    }

    const match = /^([A-Za-z0-9]+)\/([A-Za-z0-9]+)$/.exec(raw);
    return {
        type: 'fw-version',
        raw,
        layoutId: match?.[1] ?? null,
        revisionId: match?.[2] ?? null,
    };
}
