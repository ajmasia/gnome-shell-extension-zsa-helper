/** Events the keyboard sends over the Oryx raw HID protocol. */
export type OryxEvent =
    | { type: 'fw-version'; raw: string; layoutId: string | null; revisionId: string | null }
    | { type: 'pairing-success' }
    | { type: 'layer'; layer: number }
    | { type: 'keydown'; row: number; col: number }
    | { type: 'keyup'; row: number; col: number }
    | { type: 'protocol-version'; version: number }
    | { type: 'error'; code: number }
    | { type: 'unknown'; code: number };

/** First byte of every packet sent by the keyboard (`Oryx_Event_Code` in the firmware). */
export const EVT_FW_VERSION = 0x00;
export const EVT_PAIRING_SUCCESS = 0x04;
export const EVT_LAYER = 0x05;
export const EVT_KEYDOWN = 0x06;
export const EVT_KEYUP = 0x07;
export const EVT_PROTOCOL_VERSION = 0xfe;
export const EVT_ERROR = 0xff;

/** Terminates the parameters of a packet (`ORYX_STOP_BIT`, -2 as an unsigned byte). */
export const STOP_BYTE = 0xfe;

/** Size of a raw HID report, without the report id. */
export const REPORT_SIZE = 32;
