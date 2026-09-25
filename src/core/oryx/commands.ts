import { REPORT_SIZE } from './types.js';

/**
 * Commands the host may send (`Oryx_Command_Code` in the firmware). Only read-only commands
 * and pairing are exposed on purpose: this extension never changes layers, RGB or LEDs.
 */
export const CMD_GET_FW_VERSION = 0x00;
export const CMD_PAIRING_INIT = 0x01;
export const CMD_GET_PROTOCOL_VERSION = 0xfe;

export type OryxCommand =
    | typeof CMD_GET_FW_VERSION
    | typeof CMD_PAIRING_INIT
    | typeof CMD_GET_PROTOCOL_VERSION;

/** Protocol versions this extension has been tested against. */
export const SUPPORTED_PROTOCOL_VERSIONS: readonly number[] = [4, 5];

/**
 * Builds a report ready to be written to a hidraw device: a leading report id (0, the
 * interface does not use numbered reports) followed by the 32-byte report.
 */
export function buildCommand(command: OryxCommand, ...params: number[]): Uint8Array {
    if (params.length > REPORT_SIZE - 1) {
        throw new RangeError(`Too many parameters for a ${REPORT_SIZE}-byte report`);
    }
    const buffer = new Uint8Array(REPORT_SIZE + 1);
    buffer.set([0, command, ...params]);
    return buffer;
}
